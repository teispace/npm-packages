import { type Signal, signal } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import { $findMatchingParent } from '@lexical/utils';
import {
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  configExtension,
  DELETE_CHARACTER_COMMAND,
  DELETE_LINE_COMMAND,
  DELETE_WORD_COMMAND,
  type ElementNode,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
  PASTE_COMMAND,
  type PointType,
  type RangeSelection,
  REMOVE_TEXT_COMMAND,
} from 'lexical';
import { defineTeiExtension, getPeerOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  check as checkIcon,
  close as closeIcon,
  suggest as suggestIcon,
} from '../../icons/index.js';
import {
  $createSuggestionNode,
  $isSuggestionNode,
  REVIEW_EXTENSION,
  type SuggestionAuthor,
  type SuggestionExportMode,
  type SuggestionKind,
  SuggestionNode,
} from './node.js';

export type {
  SerializedSuggestionNode,
  SuggestionAuthor,
  SuggestionExportMode,
  SuggestionKind,
} from './node.js';
export {
  $createSuggestionNode,
  $isSuggestionNode,
  REVIEW_EXTENSION,
  SuggestionNode,
} from './node.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Turn suggest mode on or off: while on, edits become suggestions. */
    setSuggesting: [on: boolean];
    toggleSuggesting: [];
    /** Accept a suggestion (by default the one at the caret): insertions stay, deletions go. */
    acceptChange: [id?: string];
    /** Reject a suggestion (by default the one at the caret): insertions go, deletions stay. */
    rejectChange: [id?: string];
    acceptAllChanges: [];
    rejectAllChanges: [];
  }
  interface TeiActiveStates {
    suggesting: [];
    /** The caret is in a suggestion. */
    suggestion: [];
  }
}

export interface ReviewOptions {
  /** Who is suggesting. Without one, suggestions are by "Anonymous". */
  user: SuggestionAuthor | null;
  /** Start in suggest mode. */
  suggesting: boolean;
  /**
   * How suggestions are written to HTML. Default `'original'`: what you
   * publish never carries changes nobody accepted. See {@link SuggestionExportMode}.
   */
  exportMode: SuggestionExportMode;
  /** Whether `user` may accept or reject `suggestion`. Default: anyone may. */
  canReview: ((user: SuggestionAuthor, suggestion: Suggestion) => boolean) | null;
  /** Ids for new suggestions. Default `crypto.randomUUID()`. */
  createId: (() => string) | null;
}

/** A suggestion as the UI shows it: every run with its id, together. */
export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  author: SuggestionAuthor;
  createdAt: number;
  /** Its text, runs joined. */
  text: string;
  /** Its runs, in document order. */
  keys: readonly NodeKey[];
}

export interface ReviewStorage {
  /** Whether edits become suggestions. */
  suggesting: Signal<boolean>;
  /** Every suggestion in the document, in document order. */
  suggestions: Signal<readonly Suggestion[]>;
  /** The suggestion at the caret, if any. */
  active: Signal<string | null>;
}

const ANONYMOUS = 'anonymous';

/** The suggesting user: the configured one, or Anonymous. */
export function reviewUser(editor: TeiEditor, options: ReviewOptions): SuggestionAuthor {
  return options.user ?? { id: ANONYMOUS, name: editor.t('review.anonymous') };
}

function newId(options: ReviewOptions): string {
  const custom = options.createId?.();
  if (custom) return custom;
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return (
    crypto?.randomUUID?.() ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  );
}

const suggestionOf = (node: LexicalNode | null | undefined): SuggestionNode | null =>
  node ? ($findMatchingParent(node, $isSuggestionNode) as SuggestionNode | null) : null;

const isOwn = (node: SuggestionNode | null, kind: SuggestionKind, user: SuggestionAuthor) =>
  node !== null && node.getKind() === kind && node.getAuthor().id === user.id;

/** Every run of every suggestion, in document order. */
function $allSuggestionNodes(): SuggestionNode[] {
  const found: SuggestionNode[] = [];
  const visit = (node: ElementNode) => {
    for (const child of node.getChildren()) {
      if ($isSuggestionNode(child)) found.push(child);
      if ($isElementNode(child)) visit(child);
    }
  };
  visit($getRoot());
  return found;
}

/** The suggestions, grouped by id, in document order. */
function $collect(): Suggestion[] {
  const byId = new Map<string, Suggestion & { keys: NodeKey[] }>();
  for (const node of $allSuggestionNodes()) {
    const id = node.getSuggestionId();
    const found = byId.get(id);
    if (found) {
      found.keys.push(node.getKey());
      found.text += node.getTextContent();
      continue;
    }
    byId.set(id, {
      id,
      kind: node.getKind(),
      author: node.getAuthor(),
      createdAt: node.getCreatedAt(),
      text: node.getTextContent(),
      keys: [node.getKey()],
    });
  }
  return [...byId.values()];
}

/** The suggestion at the caret: around it, or just before it (the caret lands after one). */
function $suggestionAtCaret(): SuggestionNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const { focus } = selection;
  const node = focus.getNode();
  const around = suggestionOf(node);
  if (around) return around;
  const before =
    focus.type === 'text'
      ? focus.offset === 0
        ? node.getPreviousSibling()
        : null
      : $isElementNode(node)
        ? node.getChildAtIndex(focus.offset - 1)
        : null;
  return $isSuggestionNode(before) ? before : null;
}

// -- Suggest mode: inserting ---------------------------------------------------

/** Text as nodes: runs of text with line breaks between, in the selection's format. */
function textNodes(text: string, selection: RangeSelection): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line, i) => {
      if (i > 0) nodes.push($createLineBreakNode());
      if (line)
        nodes.push($createTextNode(line).setFormat(selection.format).setStyle(selection.style));
    });
  return nodes;
}

/**
 * Put `nodes` at a collapsed point: into a text node (split there) or an
 * element. `false` when the point cannot hold inline content.
 */
function $insertAt(point: PointType, nodes: LexicalNode[]): boolean {
  const node = point.getNode();
  if ($isTextNode(node)) {
    const offset = point.offset;
    if (offset === 0) {
      for (const n of nodes) node.insertBefore(n);
    } else {
      const left = offset >= node.getTextContentSize() ? node : node.splitText(offset)[0];
      if (!left) return false;
      let after: LexicalNode = left;
      for (const n of nodes) {
        after.insertAfter(n);
        after = n;
      }
    }
    return true;
  }
  if (!$isElementNode(node) || node.isShadowRoot() || node.getType() === 'root') return false;
  const child = node.getChildAtIndex(point.offset);
  if (child) for (const n of nodes) child.insertBefore(n);
  else node.append(...nodes);
  return true;
}

/**
 * Move the insertion point out of a suggestion that is not the user's own
 * insertion, so suggestions never nest: after a deletion, or between the
 * halves of someone else's insertion.
 */
function $hoist(selection: RangeSelection, user: SuggestionAuthor): void {
  const host = suggestionOf(selection.anchor.getNode());
  if (!host || isOwn(host, 'insert', user)) return;
  const point = selection.anchor;
  const text = point.getNode();
  if (host.getKind() === 'delete' || !$isTextNode(text)) {
    $selectAfter(host);
    return;
  }
  // The child of the suggestion the caret is before, splitting the text at the caret.
  let child: LexicalNode | null = text;
  if (point.offset > 0 && point.offset < text.getTextContentSize()) {
    child = text.splitText(point.offset)[1] ?? null;
  } else if (point.offset > 0) {
    child = text.getNextSibling();
  }
  while (child && !child.getParent()?.is(host)) {
    child = child.getParent()?.getNextSibling() ?? null;
  }
  if (!child) {
    $selectAfter(host);
    return;
  }
  const rest = [child, ...child.getNextSiblings()];
  if (rest.length === host.getChildrenSize()) {
    $selectBefore(host);
    return;
  }
  const tail = $createSuggestionNode(
    host.getKind(),
    host.getSuggestionId(),
    host.getAuthor(),
    host.getCreatedAt(),
  );
  host.insertAfter(tail);
  tail.append(...rest);
  $selectAfter(host);
}

/** A caret right before a node, in its parent. */
function $selectBefore(node: LexicalNode): void {
  const index = node.getIndexWithinParent();
  node.getParentOrThrow().select(index, index);
}

/** A caret right after a node, in its parent. */
function $selectAfter(node: LexicalNode): void {
  const index = node.getIndexWithinParent() + 1;
  node.getParentOrThrow().select(index, index);
}

/** Join a run into the same author's run of the same kind right beside it. */
function $merge(node: SuggestionNode): SuggestionNode {
  let current = node;
  const prev = current.getPreviousSibling();
  if (
    $isSuggestionNode(prev) &&
    prev.getKind() === current.getKind() &&
    prev.getAuthor().id === current.getAuthor().id
  ) {
    prev.append(...current.getChildren());
    current.remove();
    current = prev;
  }
  const next = current.getNextSibling();
  if (
    $isSuggestionNode(next) &&
    next.getKind() === current.getKind() &&
    next.getAuthor().id === current.getAuthor().id
  ) {
    current.append(...next.getChildren());
    next.remove();
  }
  return current;
}

/** Text typed or pasted in suggest mode: a deletion of what was selected, then an insertion. */
function $suggestInsert(text: string, user: SuggestionAuthor, id: () => string): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  if (!selection.isCollapsed()) $suggestDeleteRange(selection, false, user, id);
  const current = $getSelection();
  if (!$isRangeSelection(current)) return true;
  const nodes = textNodes(text, current);
  if (nodes.length === 0) return true;
  $hoist(current, user);
  const at = $getSelection();
  if (!$isRangeSelection(at)) return true;
  const own = suggestionOf(at.anchor.getNode());
  if (own && isOwn(own, 'insert', user)) {
    if (!$insertAt(at.anchor, nodes)) return true;
  } else {
    const suggestion = $createSuggestionNode('insert', id(), user, Date.now());
    suggestion.append(...nodes);
    if (!$insertAt(at.anchor, [suggestion])) return true;
    $merge(suggestion);
  }
  const last = nodes.at(-1) as LexicalNode;
  if ($isTextNode(last)) last.select(last.getTextContentSize(), last.getTextContentSize());
  else $selectAfter(last);
  return true;
}

// -- Suggest mode: deleting ----------------------------------------------------

/** Where the grapheme next to `offset` starts or ends. */
function graphemeStep(text: string, offset: number, backward: boolean): number {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    const bounds = Array.from(
      new Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
      (s) => s.index,
    ).concat(text.length);
    return backward
      ? (bounds.filter((b) => b < offset).at(-1) ?? 0)
      : (bounds.find((b) => b > offset) ?? text.length);
  }
  const code = text.charCodeAt(backward ? offset - 1 : offset);
  const pair = backward ? code >= 0xdc00 && code <= 0xdfff : code >= 0xd800 && code <= 0xdbff;
  return backward ? offset - (pair ? 2 : 1) : offset + (pair ? 2 : 1);
}

/** The inline leaf beside `node` in its block, stepping in and out of inline elements. */
function $leafBeside(node: LexicalNode, backward: boolean): LexicalNode | null {
  let current: LexicalNode = node;
  let sibling = backward ? current.getPreviousSibling() : current.getNextSibling();
  while (!sibling) {
    const parent = current.getParent();
    if (!parent || !$isElementNode(parent) || !parent.isInline()) return null;
    current = parent;
    sibling = backward ? current.getPreviousSibling() : current.getNextSibling();
  }
  return $leafIn(sibling, backward);
}

/** The last (or first) leaf of `node`, `node` itself when it has none. */
function $leafIn(node: LexicalNode, backward: boolean): LexicalNode | null {
  let current: LexicalNode = node;
  while ($isElementNode(current)) {
    if (!current.isInline()) return null;
    const child: LexicalNode | null = backward ? current.getLastChild() : current.getFirstChild();
    if (!child) return null;
    current = child;
  }
  return current;
}

/** Extend a caret by one character, within its block. `false` at a block's edge. */
function $extendByCharacter(selection: RangeSelection, backward: boolean): boolean {
  const { focus } = selection;
  const node = focus.getNode();
  let leaf: LexicalNode | null;
  if ($isTextNode(node)) {
    const size = node.getTextContentSize();
    if (backward ? focus.offset > 0 : focus.offset < size) {
      focus.set(focus.key, graphemeStep(node.getTextContent(), focus.offset, backward), 'text');
      return true;
    }
    leaf = $leafBeside(node, backward);
  } else if ($isElementNode(node)) {
    const child = node.getChildAtIndex(backward ? focus.offset - 1 : focus.offset);
    leaf = child ? $leafIn(child, backward) : null;
  } else {
    leaf = null;
  }
  if (!leaf) return false;
  if ($isTextNode(leaf)) {
    const content = leaf.getTextContent();
    const at = backward ? content.length : 0;
    focus.set(leaf.getKey(), graphemeStep(content, at, backward), 'text');
    return true;
  }
  const parent = leaf.getParent();
  if (!parent) return false;
  const index = leaf.getIndexWithinParent();
  focus.set(parent.getKey(), backward ? index : index + 1, 'element');
  return true;
}

/** Whether a node is a leaf a deletion can strike: text, a line break, an inline decorator. */
const isStrikable = (node: LexicalNode) =>
  $isTextNode(node) || $isLineBreakNode(node) || ($isDecoratorNode(node) && node.isInline());

/**
 * Mark a range as deleted: plain text goes into deletion runs, the user's
 * own suggested insertions really go, and other suggestions are left. The
 * caret ends before the range (`backward`) or after it.
 */
function $suggestDeleteRange(
  selection: RangeSelection,
  backward: boolean,
  user: SuggestionAuthor,
  id: () => string,
): void {
  const leaves = selection.extract().filter(isStrikable);
  // The caret ends beside this leaf, wherever it has gone by then.
  const edge = backward ? leaves[0] : leaves.at(-1);
  /** Where the edge was, if it is removed: in its parent, and its parent in its own. */
  let spot: Array<[ElementNode, number]> = [];
  let current: SuggestionNode | null = null;
  // One suggestion for the whole range, however many runs it takes.
  let rangeId: string | null = null;
  for (const leaf of leaves) {
    const host = suggestionOf(leaf);
    if (host) {
      if (isOwn(host, 'insert', user)) {
        if (leaf === edge) {
          const parent = leaf.getParentOrThrow();
          spot = [
            [parent, leaf.getIndexWithinParent()],
            [host.getParentOrThrow(), host.getIndexWithinParent()],
          ];
        }
        leaf.remove();
      }
      continue;
    }
    const prev = leaf.getPreviousSibling();
    if (current && prev?.is(current)) {
      current.append(leaf);
    } else {
      rangeId ??= id();
      current = $createSuggestionNode('delete', rangeId, user, Date.now());
      leaf.insertBefore(current);
      current.append(leaf);
      current = $merge(current);
    }
  }
  if (current) $merge(current);

  const run = edge?.isAttached() ? suggestionOf(edge) : null;
  if (run) {
    if (backward) $selectBefore(run);
    else $selectAfter(run);
    return;
  }
  const [place] = spot.filter(([parent]) => parent.isAttached());
  if (place) {
    const [parent, index] = place;
    const at = Math.min(index, parent.getChildrenSize());
    parent.select(at, at);
    return;
  }
  const [start, end] = selection.isBackward()
    ? [selection.focus, selection.anchor]
    : [selection.anchor, selection.focus];
  const { key, offset, type } = backward ? start : end;
  selection.anchor.set(key, offset, type);
  selection.focus.set(key, offset, type);
}

type Granularity = 'character' | 'word' | 'lineboundary';

/** A delete key in suggest mode: extend a caret, then strike the range. */
function $suggestDelete(
  backward: boolean,
  granularity: Granularity,
  user: SuggestionAuthor,
  id: () => string,
): boolean {
  const selection = $getSelection();
  if ($isNodeSelection(selection)) return true;
  if (!$isRangeSelection(selection)) return false;
  if (selection.isCollapsed()) {
    if (granularity !== 'character') {
      try {
        selection.modify('extend', backward, granularity);
      } catch {
        // No native selection to measure words with (a test, a server): a character.
      }
    }
    if (selection.isCollapsed() && !$extendByCharacter(selection, backward)) {
      // A block's edge: blocks are not joined in suggest mode; the caret goes on.
      const block = selection.focus.getNode().getTopLevelElement();
      const next = backward ? block?.getPreviousSibling() : block?.getNextSibling();
      if ($isElementNode(next)) {
        if (backward) next.selectEnd();
        else next.selectStart();
      }
      return true;
    }
  }
  $suggestDeleteRange(selection, backward, user, id);
  return true;
}

// -- Accepting and rejecting -----------------------------------------------------

function $unwrap(node: ElementNode): void {
  for (const child of node.getChildren()) node.insertBefore(child);
  node.remove();
}

/** Settle a suggestion's runs: what it proposed stays (`accept`) or goes. */
function $settle(nodes: readonly SuggestionNode[], accept: boolean): boolean {
  for (const node of nodes) {
    if (!node.isAttached()) continue;
    if ((node.getKind() === 'insert') === accept) $unwrap(node);
    else node.remove();
  }
  return nodes.length > 0;
}

const $nodesOf = (id: string): SuggestionNode[] =>
  $allSuggestionNodes().filter((node) => node.getSuggestionId() === id);

const optionsOf = (editor: TeiEditor) =>
  getPeerOptions<ReviewOptions>(editor.lexical, REVIEW_EXTENSION) as ReviewOptions;

/** The suggestion a command is about: by id, or the caret's. */
function $target(id: string | undefined): Suggestion | null {
  const wanted = id ?? $suggestionAtCaret()?.getSuggestionId();
  if (!wanted) return null;
  const nodes = $nodesOf(wanted);
  const first = nodes[0];
  if (!first) return null;
  return {
    id: wanted,
    kind: first.getKind(),
    author: first.getAuthor(),
    createdAt: first.getCreatedAt(),
    text: nodes.map((n) => n.getTextContent()).join(''),
    keys: nodes.map((n) => n.getKey()),
  };
}

const mayReview = (editor: TeiEditor, suggestion: Suggestion) => {
  const options = optionsOf(editor);
  return options.canReview ? options.canReview(reviewUser(editor, options), suggestion) : true;
};

/** `<ins data-tei-suggestion>` and `<del data-tei-suggestion>`, as `'marked'` export writes them. */
const SUGGESTION_RULE = defineImportRule({
  name: REVIEW_EXTENSION,
  match: sel.tag('ins', 'del').attr('data-tei-suggestion', true),
  $import: (ctx, el) => {
    const children = ctx.$importChildren(el);
    const id = el.getAttribute('data-tei-suggestion') ?? '';
    const inline = children.every(
      (n) => $isTextNode(n) || $isLineBreakNode(n) || ($isElementNode(n) && n.isInline()),
    );
    if (!id || children.length === 0 || !inline) return children;
    const time = Date.parse(el.getAttribute('datetime') ?? '');
    const node = $createSuggestionNode(
      el.tagName === 'DEL' ? 'delete' : 'insert',
      id,
      {
        id: el.getAttribute('data-author') ?? '',
        name: el.getAttribute('data-author-name') ?? '',
      },
      Number.isFinite(time) ? time : 0,
    );
    node.append(...children);
    return [node];
  },
});

/**
 * Suggested changes (track changes). In suggest mode, typing and pasting
 * become insertions and deleting strikes text through instead of removing
 * it, each attributed to the user and timed; anyone (or whom `canReview`
 * allows) accepts or rejects them, one by one or all at once. A deletion
 * of your own suggested text simply removes it. Block structure is not
 * tracked: Enter suggests a line break, and Backspace at a block's start
 * moves into the block before instead of joining them; formatting and
 * inserted blocks (images, tables) are not suggestions.
 *
 * Suggestions are in the document (JSON keeps them). HTML is written per
 * `exportMode`: the original text by default. `<SuggestionPopover>` and
 * the comments panel are the built-in UI. ⌘⌥⇧X toggles suggest mode.
 */
export const Review = defineTeiExtension({
  name: REVIEW_EXTENSION,
  config: {
    user: null,
    suggesting: false,
    exportMode: 'original',
    canReview: null,
    createId: null,
  } as ReviewOptions,
  nodes: [SuggestionNode],
  theme: { suggestion: 'tei-suggestion' },
  dependencies: [configExtension(DOMImportExtension, { rules: [SUGGESTION_RULE] })],
  storage: ({ options }): ReviewStorage => ({
    suggesting: signal(options.suggesting === true),
    suggestions: signal<readonly Suggestion[]>([]),
    active: signal<string | null>(null),
  }),
  commands: {
    setSuggesting: {
      run: ({ storage }, on: boolean) => {
        storage.suggesting.value = on === true;
      },
    },
    toggleSuggesting: {
      run: ({ storage }) => {
        storage.suggesting.value = !storage.suggesting.peek();
      },
    },
    acceptChange: {
      run: ({ editor }, id?: string) => {
        const target = $target(id);
        if (!target || !mayReview(editor, target)) return false;
        return $settle($nodesOf(target.id), true);
      },
      can: ({ editor }, id?: string) => {
        const target = $target(id);
        return target !== null && mayReview(editor, target);
      },
    },
    rejectChange: {
      run: ({ editor }, id?: string) => {
        const target = $target(id);
        if (!target || !mayReview(editor, target)) return false;
        return $settle($nodesOf(target.id), false);
      },
      can: ({ editor }, id?: string) => {
        const target = $target(id);
        return target !== null && mayReview(editor, target);
      },
    },
    acceptAllChanges: {
      run: ({ editor }) => {
        const all = $collect().filter((s) => mayReview(editor, s));
        if (all.length === 0) return false;
        for (const s of all) $settle($nodesOf(s.id), true);
      },
      can: ({ editor }) => $collect().some((s) => mayReview(editor, s)),
    },
    rejectAllChanges: {
      run: ({ editor }) => {
        const all = $collect().filter((s) => mayReview(editor, s));
        if (all.length === 0) return false;
        for (const s of all) $settle($nodesOf(s.id), false);
      },
      can: ({ editor }) => $collect().some((s) => mayReview(editor, s)),
    },
  },
  active: {
    suggesting: ({ storage }) => storage.suggesting.peek(),
    suggestion: () => $suggestionAtCaret() !== null,
  },
  keymap: {
    toggleSuggesting: {
      key: 'Mod-Alt-Shift-x',
      command: 'toggleSuggesting',
      description: 'Suggest changes',
    },
  },
  icons: { suggest: suggestIcon, check: checkIcon, close: closeIcon },
  messages: {
    'review.suggesting': 'Suggest changes',
    'review.anonymous': 'Anonymous',
    'review.accept': 'Accept',
    'review.reject': 'Reject',
    'review.acceptAll': 'Accept all',
    'review.rejectAll': 'Reject all',
    'review.inserted': 'Added',
    'review.deleted': 'Deleted',
    'review.label': 'Suggestion',
    'review.title': 'Suggestions',
    'review.empty': 'No suggestions.',
    'review.lineBreak': 'line break',
  },
  items: [
    {
      id: 'suggesting',
      label: 'review.suggesting',
      icon: 'suggest',
      in: ['toolbar'],
      group: 'advanced',
      order: 81,
      shortcut: 'toggleSuggesting',
      command: 'toggleSuggesting',
      active: 'suggesting',
    },
    {
      id: 'acceptChange',
      label: 'review.accept',
      icon: 'check',
      in: ['contextMenu'],
      group: 'review',
      order: 0,
      command: 'acceptChange',
      visible: (editor) => editor.isActive('suggestion'),
    },
    {
      id: 'rejectChange',
      label: 'review.reject',
      icon: 'close',
      in: ['contextMenu'],
      group: 'review',
      order: 1,
      command: 'rejectChange',
      visible: (editor) => editor.isActive('suggestion'),
    },
  ],
  register: ({ lexical, storage, options, editor, signal: aborted }) => {
    const user = () => reviewUser(editor, options);
    const id = () => newId(options);
    const on = () => storage.suggesting.peek();
    const when =
      <P>(handle: (payload: P) => boolean) =>
      (payload: P) =>
        on() ? handle(payload) : false;

    // Typing the browser would put straight into the DOM: in suggest mode
    // it goes through the insertion command instead, before Lexical sees it.
    const onBeforeInput = (event: InputEvent) => {
      if (!on() || event.inputType !== 'insertText' || !event.data || event.isComposing) return;
      const root = lexical.getRootElement();
      if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      lexical.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, event.data);
    };
    // Runs in the document, by key: with none, an update costs nothing here.
    const runs = new Set<NodeKey>();
    const refresh = () => {
      if (runs.size === 0) {
        if (storage.suggestions.peek().length > 0) storage.suggestions.value = [];
        if (storage.active.peek() !== null) storage.active.value = null;
        return;
      }
      const [all, active] = lexical
        .getEditorState()
        .read(() => [$collect(), $suggestionAtCaret()?.getSuggestionId() ?? null] as const, {
          editor: lexical,
        });
      const before = storage.suggestions.peek();
      const same =
        before.length === all.length &&
        before.every((s, i) => {
          const other = all[i] as Suggestion;
          return (
            s.id === other.id &&
            s.text === other.text &&
            s.kind === other.kind &&
            s.keys.join() === other.keys.join()
          );
        });
      if (!same) storage.suggestions.value = all;
      if (storage.active.peek() !== active) storage.active.value = active;
    };

    return mergeRegister(
      lexical.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        when((payload: string | InputEvent) => {
          const text =
            typeof payload === 'string'
              ? payload
              : (payload.dataTransfer?.getData('text/plain') ?? payload.data ?? '');
          return text ? $suggestInsert(text, user(), id) : true;
        }),
        COMMAND_PRIORITY_CRITICAL,
      ),
      lexical.registerCommand(
        PASTE_COMMAND,
        when((event) => {
          const data =
            event && 'clipboardData' in event
              ? event.clipboardData
              : event && 'dataTransfer' in event
                ? (event as InputEvent).dataTransfer
                : null;
          const text = data?.getData('text/plain') ?? '';
          if (event && 'preventDefault' in event) event.preventDefault();
          return text ? $suggestInsert(text, user(), id) : true;
        }),
        COMMAND_PRIORITY_CRITICAL,
      ),
      lexical.registerCommand(
        INSERT_LINE_BREAK_COMMAND,
        when(() => $suggestInsert('\n', user(), id)),
        COMMAND_PRIORITY_CRITICAL,
      ),
      lexical.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        when(() => $suggestInsert('\n', user(), id)),
        COMMAND_PRIORITY_CRITICAL,
      ),
      lexical.registerCommand(
        DELETE_CHARACTER_COMMAND,
        when((backward: boolean) => $suggestDelete(backward, 'character', user(), id)),
        COMMAND_PRIORITY_CRITICAL,
      ),
      lexical.registerCommand(
        DELETE_WORD_COMMAND,
        when((backward: boolean) => $suggestDelete(backward, 'word', user(), id)),
        COMMAND_PRIORITY_CRITICAL,
      ),
      lexical.registerCommand(
        DELETE_LINE_COMMAND,
        when((backward: boolean) => $suggestDelete(backward, 'lineboundary', user(), id)),
        COMMAND_PRIORITY_CRITICAL,
      ),
      lexical.registerCommand(
        REMOVE_TEXT_COMMAND,
        when(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && !selection.isCollapsed())
            $suggestDeleteRange(selection, false, user(), id);
          return true;
        }),
        COMMAND_PRIORITY_CRITICAL,
      ),
      lexical.registerCommand(
        CUT_COMMAND,
        when((event: ClipboardEvent | KeyboardEvent | null) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selection.isCollapsed()) return true;
          const text = selection.getTextContent();
          if (event && 'clipboardData' in event && event.clipboardData) {
            event.preventDefault();
            event.clipboardData.setData('text/plain', text);
          } else {
            const clipboard = (globalThis as { navigator?: Navigator }).navigator?.clipboard;
            clipboard?.writeText(text).catch(() => {});
          }
          $suggestDeleteRange(selection, false, user(), id);
          return true;
        }),
        COMMAND_PRIORITY_CRITICAL,
      ),
      // A selected image or table is not deleted in suggest mode.
      ...[KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND].map((command) =>
        lexical.registerCommand(
          command,
          when((event: KeyboardEvent | null) => {
            if (!$isNodeSelection($getSelection())) return false;
            event?.preventDefault();
            return true;
          }),
          COMMAND_PRIORITY_CRITICAL,
        ),
      ),
      lexical.registerRootListener((root, previous) => {
        previous?.ownerDocument.removeEventListener('beforeinput', onBeforeInput, true);
        root?.ownerDocument.addEventListener('beforeinput', onBeforeInput, {
          capture: true,
          signal: aborted,
        });
      }),
      lexical.registerMutationListener(
        SuggestionNode,
        (mutations) => {
          for (const [key, kind] of mutations) {
            if (kind === 'destroyed') runs.delete(key);
            else runs.add(key);
          }
        },
        { skipInitialization: false },
      ),
      lexical.registerUpdateListener(refresh),
    );
  },
});

export { $suggestionAtCaret };
