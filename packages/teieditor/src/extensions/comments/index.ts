import { effect, type Signal, signal } from '@lexical/extension';
import {
  DOMImportExtension,
  DOMRenderExtension,
  defineImportRule,
  domOverride,
  sel,
} from '@lexical/html';
import {
  $createMarkNode,
  $getMarkIDs,
  $isMarkNode,
  $unwrapMarkNode,
  $wrapSelectionInMarkNode,
  MarkNode,
} from '@lexical/mark';
import { registerNestedElementResolver } from '@lexical/utils';
import {
  $createRangeSelection,
  $getDocument,
  $getEditor,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  configExtension,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
  type PointType,
} from 'lexical';
import { defineTeiExtension, getPeerOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  check as checkIcon,
  close as closeIcon,
  comment as commentIcon,
  trash as trashIcon,
} from '../../icons/index.js';
import { highlightNamed, type SavedPoint, savedPointsRange } from '../../utils/dom-range.js';
import {
  type CommentStore,
  type CommentThread,
  type CommentUser,
  createMemoryCommentStore,
  type TeiComment,
} from './store.js';

export type { CommentStore, CommentThread, CommentUser, TeiComment } from './store.js';
export { createMemoryCommentStore, parseCommentThreads, parseCommentUser } from './store.js';

export const COMMENTS_EXTENSION = '@teispace/teieditor/comments';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Start a thread on the selected text: opens the composer (`<CommentComposer>`). */
    addComment: [];
    /** Post the composer's first comment, marking the text it was opened on. */
    submitComment: [content: string];
    /** Close the composer without posting. */
    cancelComment: [];
    /** Add a reply to a thread; a resolved thread opens again. */
    replyToThread: [threadId: string, content: string];
    resolveThread: [threadId: string];
    reopenThread: [threadId: string];
    /** Delete one comment; the last one takes its thread with it. */
    deleteComment: [threadId: string, commentId: string];
    /** Delete a thread and take its marks off the text. */
    deleteThread: [threadId: string];
    /** Make a thread the active one and put the caret at its text. */
    focusThread: [threadId: string];
    /** Show or hide the comments panel; without an argument, toggle it. */
    toggleCommentsPanel: [open?: boolean];
  }
  interface TeiActiveStates {
    /** The caret is in commented text. */
    comment: [];
    commentsPanel: [];
  }
}

export interface CommentsOptions {
  /** Who is commenting. Without one, comments are by "Anonymous". */
  user: CommentUser | null;
  /** Where threads live; the default keeps them in memory. Read once, when the editor is built. */
  store: CommentStore | null;
  /**
   * Keep the marks in exported HTML, as `<mark data-tei-comment="id …">`
   * (and read them back). Off by default: comments are about the
   * document, not part of it. JSON always keeps them; they are the anchors.
   */
  exportMarks: boolean;
  /**
   * What happens to a thread whose text is all deleted: `'resolve'` it (it
   * opens again if an undo brings the text back), or `'keep'` it open and
   * detached. Default `'resolve'`.
   */
  orphans: 'resolve' | 'keep';
  /** Whether `user` may delete what `author` wrote. Default: only their own. */
  canModify: ((user: CommentUser, author: CommentUser) => boolean) | null;
  /** Longest comment, in characters. Default 10 000. */
  maxLength: number;
  /** Ids for new threads and comments. Default `crypto.randomUUID()`. */
  createId: (() => string) | null;
  /** A store write that failed (a rejected promise). */
  onError: ((error: unknown) => void) | null;
}

/** The composer, while it is open: the text it is about, by its ends. */
export interface CommentComposerState {
  quote: string;
  anchor: SavedPoint;
  focus: SavedPoint;
}

export interface CommentsStorage {
  store: CommentStore;
  /** The store's threads, oldest first. */
  threads: Signal<readonly CommentThread[]>;
  /** Each anchored thread's mark nodes; a thread missing here has no text left. */
  anchors: Signal<ReadonlyMap<string, readonly NodeKey[]>>;
  /** The thread being looked at: the caret's, or the one `focusThread` chose. */
  active: Signal<string | null>;
  /** Every thread the caret is in, overlapping ones included. */
  atCaret: Signal<readonly string[]>;
  /** The open composer, or `null`. */
  composer: Signal<CommentComposerState | null>;
  /** Whether the comments panel is shown. */
  panel: Signal<boolean>;
}

interface Engine {
  keyToIds: Map<NodeKey, readonly string[]>;
  idToKeys: Map<string, Set<NodeKey>>;
  /** Threads resolved because their text went, to open again if it comes back. */
  autoResolved: Set<string>;
  /** Set by a command that chose the active thread itself: the next caret check leaves it be. */
  chosen: boolean;
}
const engines = new WeakMap<CommentsStorage, Engine>();
const engineOf = (storage: CommentsStorage) => engines.get(storage) as Engine;

const QUOTE_MAX = 500;
const ANONYMOUS = 'anonymous';

function newId(options: CommentsOptions): string {
  const custom = options.createId?.();
  if (custom) return custom;
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return (
    crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  );
}

/** The commenting user: the configured one, or Anonymous. */
export function commentUser(editor: TeiEditor, options: CommentsOptions): CommentUser {
  return options.user ?? { id: ANONYMOUS, name: editor.t('comments.anonymous') };
}

const mayModify = (options: CommentsOptions, user: CommentUser, author: CommentUser) =>
  options.canModify ? options.canModify(user, author) : user.id === author.id;

const threadOf = (storage: CommentsStorage, id: string) =>
  storage.store.getThreads().find((thread) => thread.id === id);

/** Run a store write; a rejected promise goes to `onError` (or the console). */
function write(options: CommentsOptions, result: void | Promise<void>): void {
  if (result && typeof (result as Promise<void>).then === 'function') {
    (result as Promise<void>).catch((error: unknown) => {
      if (options.onError) options.onError(error);
      else console.error('teieditor: a comment store write failed', error);
    });
  }
}

const cleanContent = (options: CommentsOptions, content: unknown): string | null => {
  const text = typeof content === 'string' ? content.trim() : '';
  return text && text.length <= options.maxLength ? text : null;
};

const save = (point: PointType): SavedPoint => ({
  key: point.key,
  offset: point.offset,
  type: point.type,
});

/** A saved point back as a selection point, if its node is still there and the offset fits. */
function $restore(point: SavedPoint): boolean {
  const node = $getNodeByKey(point.key);
  if (!node?.isAttached()) return false;
  if (point.type === 'text') return $isTextNode(node) && point.offset <= node.getTextContentSize();
  return $isElementNode(node) && point.offset <= node.getChildrenSize();
}

/**
 * The thread ids at the selection's focus: in a mark, or touching one (the
 * caret is put just after a mark when it lands at its end).
 */
function $idsAtCaret(): string[] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [];
  const { offset } = selection.focus;
  const node = selection.focus.getNode();
  if (!$isTextNode(node)) return [];
  const ids = $getMarkIDs(node, offset) ?? [];
  const before = offset === 0 ? node.getPreviousSibling() : null;
  if ($isMarkNode(before)) for (const id of before.getIDs()) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** Take one thread's id off its marks; a mark left with none goes, keeping its text. */
function $unmark(keys: Iterable<NodeKey>, id: string): void {
  for (const key of keys) {
    const node = $getNodeByKey(key);
    if (!$isMarkNode(node)) continue;
    node.deleteID(id);
    if (node.getIDs().length === 0) $unwrapMarkNode(node);
  }
}

/** The first of a thread's marks in document order. */
function $firstMark(keys: Iterable<NodeKey>): MarkNode | null {
  let first: MarkNode | null = null;
  for (const key of keys) {
    const node = $getNodeByKey(key);
    if ($isMarkNode(node) && node.isAttached() && (!first || node.isBefore(first))) first = node;
  }
  return first;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

const optionsOf = (lexical: LexicalEditor) =>
  getPeerOptions<CommentsOptions>(lexical, COMMENTS_EXTENSION);

/** `<mark data-tei-comment="a b">`, read back as a mark when marks are exported. */
const MARK_RULE = defineImportRule({
  name: COMMENTS_EXTENSION,
  match: sel.tag('mark').attr('data-tei-comment', true),
  $import: (ctx, el) => {
    const children = ctx.$importChildren(el);
    if (!optionsOf($getEditor())?.exportMarks) return children;
    const ids = (el.getAttribute('data-tei-comment') ?? '')
      .split(/\s+/)
      .filter((id) => id && id.length <= 128)
      .slice(0, 32);
    if (ids.length === 0) return children;
    const mark = $createMarkNode(ids);
    mark.append(...children);
    return [mark];
  },
});

/**
 * Comments: threads of discussion on ranges of text. The text is marked
 * (a `MarkNode` per run, carrying the ids of every thread on it, so
 * threads can overlap); the marks move with the text as it is edited, and
 * a thread whose text is all deleted is resolved. The talk itself lives in
 * a `CommentStore` — in memory by default, or the app's own — never in the
 * document, and exported HTML leaves the marks out unless `exportMarks`.
 *
 * Headless: threads, the active thread and the composer are signals.
 * `<CommentComposer>` and `<CommentsPanel>` are the built-in UI.
 * ⌘⌥M comments on the selection.
 */
export const Comments = defineTeiExtension({
  name: COMMENTS_EXTENSION,
  config: {
    user: null,
    store: null,
    exportMarks: false,
    orphans: 'resolve',
    canModify: null,
    maxLength: 10_000,
    createId: null,
    onError: null,
  } as CommentsOptions,
  nodes: [MarkNode],
  theme: { mark: 'tei-comment', markOverlap: 'tei-comment-overlap' },
  dependencies: [
    configExtension(DOMImportExtension, { rules: [MARK_RULE] }),
    configExtension(DOMRenderExtension, {
      overrides: [
        domOverride([MarkNode], {
          // Left out of HTML (its text stays) unless marks are exported.
          $shouldExclude: (_node, _selection, $next) =>
            optionsOf($getEditor())?.exportMarks ? false : $next(),
          $exportDOM: (node, $next) => {
            if (!optionsOf($getEditor())?.exportMarks) return $next();
            const element = $getDocument().createElement('mark');
            element.setAttribute('data-tei-comment', node.getIDs().join(' '));
            return { element };
          },
        }),
      ],
    }),
  ],
  storage: ({ options }): CommentsStorage => {
    const store = options.store ?? createMemoryCommentStore();
    const storage: CommentsStorage = {
      store,
      threads: signal(store.getThreads()),
      anchors: signal<ReadonlyMap<string, readonly NodeKey[]>>(new Map()),
      active: signal<string | null>(null),
      atCaret: signal<readonly string[]>([]),
      composer: signal<CommentComposerState | null>(null),
      panel: signal(false),
    };
    engines.set(storage, {
      keyToIds: new Map(),
      idToKeys: new Map(),
      autoResolved: new Set(),
      chosen: false,
    });
    return storage;
  },
  commands: {
    addComment: {
      run: ({ storage }) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
        const quote = selection.getTextContent();
        if (!quote.trim()) return false;
        storage.composer.value = {
          quote: quote.slice(0, QUOTE_MAX),
          anchor: save(selection.anchor),
          focus: save(selection.focus),
        };
        storage.active.value = null;
      },
      can: () => {
        const selection = $getSelection();
        return (
          $isRangeSelection(selection) &&
          !selection.isCollapsed() &&
          selection.getTextContent().trim() !== ''
        );
      },
    },
    submitComment: {
      run: ({ storage, options, editor }, content: string) => {
        const composer = storage.composer.peek();
        const text = cleanContent(options, content);
        if (!composer || !text) return false;
        storage.composer.value = null;
        if (!$restore(composer.anchor) || !$restore(composer.focus)) return false;
        const range = $createRangeSelection();
        range.anchor.set(composer.anchor.key, composer.anchor.offset, composer.anchor.type);
        range.focus.set(composer.focus.key, composer.focus.offset, composer.focus.type);
        const quote = range.getTextContent().slice(0, QUOTE_MAX) || composer.quote;
        const id = newId(options);
        let marked = false;
        $wrapSelectionInMarkNode(range, range.isBackward(), id, (ids) => {
          marked = true;
          return $createMarkNode(ids);
        });
        // Nothing markable in it (only blocks and media): no thread.
        if (!marked) return false;
        const now = Date.now();
        const thread: CommentThread = {
          id,
          quote,
          comments: [
            {
              id: newId(options),
              author: commentUser(editor, options),
              content: text,
              createdAt: now,
            },
          ],
          resolved: false,
          createdAt: now,
        };
        write(options, storage.store.addThread(thread));
        storage.active.value = id;
        engineOf(storage).chosen = true;
      },
      can: ({ storage, options }, content: string) =>
        storage.composer.peek() !== null &&
        (content === undefined || cleanContent(options, content) !== null),
    },
    cancelComment: {
      run: ({ storage }) => {
        if (!storage.composer.peek()) return false;
        storage.composer.value = null;
      },
      can: ({ storage }) => storage.composer.peek() !== null,
    },
    replyToThread: {
      run: ({ storage, options, editor }, threadId: string, content: string) => {
        const thread = threadOf(storage, threadId);
        const text = cleanContent(options, content);
        if (!thread || !text) return false;
        const comment: TeiComment = {
          id: newId(options),
          author: commentUser(editor, options),
          content: text,
          createdAt: Date.now(),
        };
        write(options, storage.store.addComment(threadId, comment));
        if (thread.resolved) write(options, storage.store.setResolved(threadId, false));
      },
      can: ({ storage, options }, threadId: string, content?: string) =>
        threadOf(storage, threadId) !== undefined &&
        (content === undefined || cleanContent(options, content) !== null),
    },
    resolveThread: {
      run: ({ storage, options }, threadId: string) => {
        const thread = threadOf(storage, threadId);
        if (!thread || thread.resolved) return false;
        engineOf(storage).autoResolved.delete(threadId);
        write(options, storage.store.setResolved(threadId, true));
        if (storage.active.peek() === threadId) storage.active.value = null;
      },
      can: ({ storage }, threadId: string) => threadOf(storage, threadId)?.resolved === false,
    },
    reopenThread: {
      run: ({ storage, options }, threadId: string) => {
        const thread = threadOf(storage, threadId);
        if (!thread?.resolved) return false;
        engineOf(storage).autoResolved.delete(threadId);
        write(options, storage.store.setResolved(threadId, false));
      },
      can: ({ storage }, threadId: string) => threadOf(storage, threadId)?.resolved === true,
    },
    deleteComment: {
      run: ({ storage, options, editor }, threadId: string, commentId: string) => {
        const thread = threadOf(storage, threadId);
        const comment = thread?.comments.find((c) => c.id === commentId);
        if (!thread || !comment) return false;
        if (!mayModify(options, commentUser(editor, options), comment.author)) return false;
        if (thread.comments.length === 1) {
          $unmark(engineOf(storage).idToKeys.get(threadId) ?? [], threadId);
          write(options, storage.store.deleteThread(threadId));
          if (storage.active.peek() === threadId) storage.active.value = null;
          return;
        }
        write(options, storage.store.deleteComment(threadId, commentId));
      },
      can: ({ storage, options, editor }, threadId: string, commentId: string) => {
        const comment = threadOf(storage, threadId)?.comments.find((c) => c.id === commentId);
        return (
          comment !== undefined && mayModify(options, commentUser(editor, options), comment.author)
        );
      },
    },
    deleteThread: {
      run: ({ storage, options, editor }, threadId: string) => {
        const thread = threadOf(storage, threadId);
        const author = thread?.comments[0]?.author;
        if (!thread || !author || !mayModify(options, commentUser(editor, options), author))
          return false;
        $unmark(engineOf(storage).idToKeys.get(threadId) ?? [], threadId);
        engineOf(storage).autoResolved.delete(threadId);
        write(options, storage.store.deleteThread(threadId));
        if (storage.active.peek() === threadId) storage.active.value = null;
      },
      can: ({ storage, options, editor }, threadId: string) => {
        const author = threadOf(storage, threadId)?.comments[0]?.author;
        return author !== undefined && mayModify(options, commentUser(editor, options), author);
      },
    },
    focusThread: {
      run: ({ storage, lexical }, threadId: string) => {
        if (!threadOf(storage, threadId)) return false;
        storage.active.value = threadId;
        storage.panel.value = true;
        engineOf(storage).chosen = true;
        const mark = $firstMark(engineOf(storage).idToKeys.get(threadId) ?? []);
        if (!mark) return;
        mark.selectStart();
        const key = mark.getKey();
        queueMicrotask(() =>
          lexical.getElementByKey(key)?.scrollIntoView?.({ block: 'center', inline: 'nearest' }),
        );
      },
      can: ({ storage }, threadId: string) => threadOf(storage, threadId) !== undefined,
    },
    toggleCommentsPanel: {
      run: ({ storage }, open?: boolean) => {
        storage.panel.value = typeof open === 'boolean' ? open : !storage.panel.peek();
      },
    },
  },
  active: {
    comment: ({ storage }) => storage.atCaret.peek().length > 0,
    commentsPanel: ({ storage }) => storage.panel.peek(),
  },
  keymap: {
    addComment: { key: 'Mod-Alt-m', command: 'addComment', description: 'Comment' },
  },
  icons: { comment: commentIcon, check: checkIcon, close: closeIcon, trash: trashIcon },
  messages: {
    'comments.add': 'Comment',
    'comments.panel': 'Comments',
    'comments.anonymous': 'Anonymous',
    'comments.placeholder': 'Add a comment…',
    'comments.replyPlaceholder': 'Reply…',
    'comments.submit': 'Comment',
    'comments.reply': 'Reply',
    'comments.cancel': 'Cancel',
    'comments.resolve': 'Resolve',
    'comments.reopen': 'Reopen',
    'comments.delete': 'Delete',
    'comments.deleteThread': 'Delete thread',
    'comments.deleteComment': 'Delete comment',
    'comments.confirmThread': 'Delete this thread and all its replies?',
    'comments.confirmComment': 'Delete this comment?',
    'comments.close': 'Close comments',
    'comments.open': 'Open',
    'comments.resolved': 'Resolved',
    'comments.filter': 'Show',
    'comments.empty': 'No comments yet. Select text and press Comment to start one.',
    'comments.emptyResolved': 'No resolved comments.',
    'comments.detached': 'The text was deleted',
    'comments.replies': '{count} replies',
    'comments.tooLong': 'Comments are limited to {max} characters.',
    'comments.shortcutHint': '⌘↵ to post',
  },
  items: [
    {
      id: 'comment',
      label: 'comments.add',
      icon: 'comment',
      in: ['bubble', 'contextMenu'],
      group: 'insert',
      order: 5,
      keywords: ['comment', 'note', 'annotate', 'discuss'],
      shortcut: 'addComment',
      command: 'addComment',
      active: 'comment',
    },
    {
      id: 'commentsPanel',
      label: 'comments.panel',
      icon: 'comment',
      in: ['toolbar'],
      group: 'advanced',
      order: 80,
      command: 'toggleCommentsPanel',
      active: 'commentsPanel',
    },
  ],
  register: ({ lexical, storage, options }) => {
    const engine = engineOf(storage);
    const { keyToIds, idToKeys, autoResolved } = engine;

    /** The thread state a mark's ids show: the active thread's, an open one's, or none. */
    const stateOf = (ids: readonly string[]): 'active' | 'open' | 'resolved' | 'none' => {
      const active = storage.active.peek();
      if (active && ids.includes(active)) return 'active';
      let known = false;
      for (const id of ids) {
        const thread = threadOf(storage, id);
        if (thread && !thread.resolved) return 'open';
        if (thread) known = true;
      }
      return known ? 'resolved' : 'none';
    };
    const decorate = (keys: Iterable<NodeKey>) => {
      for (const key of keys) {
        const element = lexical.getElementByKey(key);
        const ids = keyToIds.get(key);
        if (element && ids) element.setAttribute('data-tei-comment', stateOf(ids));
      }
    };

    /** Threads that lost their last mark, or got one back, as the document changed. */
    const onAnchors = (lost: readonly string[], found: readonly string[]) => {
      for (const id of found) {
        if (!autoResolved.delete(id)) continue;
        if (threadOf(storage, id)?.resolved) write(options, storage.store.setResolved(id, false));
      }
      if (options.orphans !== 'resolve') return;
      for (const id of lost) {
        const thread = threadOf(storage, id);
        if (!thread || thread.resolved) continue;
        autoResolved.add(id);
        write(options, storage.store.setResolved(id, true));
        if (storage.active.peek() === id) storage.active.value = null;
      }
    };

    // Pending: the text the composer is about, painted while focus is in the composer.
    let pending: Range | null = null;
    const paintPending = (composer: CommentComposerState | null) => {
      const highlight = highlightNamed('tei-comment-pending');
      if (!highlight) return;
      if (pending) highlight.delete(pending);
      pending = composer ? savedPointsRange(lexical, composer.anchor, composer.focus) : null;
      if (pending) highlight.add(pending);
    };

    return mergeRegister(
      storage.store.subscribe(() => {
        storage.threads.value = storage.store.getThreads();
      }),
      // Marks inside marks are split apart, the inner one carrying both threads' ids.
      registerNestedElementResolver<MarkNode>(
        lexical,
        MarkNode,
        (from) => $createMarkNode(from.getIDs()),
        (from, to) => {
          for (const id of from.getIDs()) to.addID(id);
        },
      ),
      lexical.registerMutationListener(
        MarkNode,
        (mutations) => {
          const touched = new Map<string, boolean>();
          lexical.getEditorState().read(() => {
            for (const [key, kind] of mutations) {
              const before = keyToIds.get(key) ?? [];
              const node = kind === 'destroyed' ? null : $getNodeByKey(key);
              const after = $isMarkNode(node) ? node.getIDs() : [];
              for (const id of before) {
                if (after.includes(id)) continue;
                if (!touched.has(id)) touched.set(id, (idToKeys.get(id)?.size ?? 0) > 0);
                idToKeys.get(id)?.delete(key);
              }
              for (const id of after) {
                if (!touched.has(id)) touched.set(id, (idToKeys.get(id)?.size ?? 0) > 0);
                let keys = idToKeys.get(id);
                if (!keys) {
                  keys = new Set();
                  idToKeys.set(id, keys);
                }
                keys.add(key);
              }
              if (after.length > 0) keyToIds.set(key, after);
              else keyToIds.delete(key);
            }
          });
          if (touched.size === 0) {
            decorate(mutations.keys());
            return;
          }
          const lost: string[] = [];
          const found: string[] = [];
          for (const [id, had] of touched) {
            const has = (idToKeys.get(id)?.size ?? 0) > 0;
            if (!has) idToKeys.delete(id);
            if (had && !has) lost.push(id);
            if (!had && has) found.push(id);
          }
          storage.anchors.value = new Map(
            Array.from(idToKeys, ([id, keys]) => [id, Object.freeze([...keys])] as const),
          );
          onAnchors(lost, found);
          decorate(mutations.keys());
        },
        { skipInitialization: false },
      ),
      // The active thread follows the caret: the one already active while it
      // stays in it, else the first open thread there.
      // A thread chosen in the panel stays active until the caret moves.
      lexical.registerUpdateListener(({ editorState, prevEditorState }) => {
        const [ids, selection] = editorState.read(() => [$idsAtCaret(), $getSelection()] as const, {
          editor: lexical,
        });
        if (!sameList(ids, storage.atCaret.peek())) storage.atCaret.value = ids;
        if (engine.chosen) {
          engine.chosen = false;
          return;
        }
        if (storage.composer.peek()) return;
        const previous = prevEditorState.read(() => $getSelection());
        if (selection && previous && selection.is(previous)) return;
        const active = storage.active.peek();
        if (active && ids.includes(active)) return;
        storage.active.value =
          ids.find((id) => {
            const thread = threadOf(storage, id);
            return thread !== undefined && !thread.resolved;
          }) ?? null;
      }),
      effect(() => {
        storage.threads.value;
        storage.active.value;
        decorate(keyToIds.keys());
      }),
      effect(() => paintPending(storage.composer.value)),
      () => paintPending(null),
    );
  },
});
