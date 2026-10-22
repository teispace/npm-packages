import { batch, type Signal, signal } from '@lexical/extension';
import {
  $convertSelectionToMarkdownString,
  $generateNodesFromMarkdownString,
} from '@lexical/markdown';
import {
  $addUpdateTag,
  $createLineBreakNode,
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  KEY_ESCAPE_COMMAND,
  type LexicalNode,
  mergeRegister,
  type PointType,
  type RangeSelection,
} from 'lexical';
import { defineTeiExtension, getPeerOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import {
  check,
  chevronLeft,
  chevronRight,
  close,
  expand,
  fileText,
  languages,
  megaphone,
  penLine,
  retry,
  shrink,
  sparkles,
  spellCheck,
  stop,
  wand,
} from '../../icons/index.js';
import { frameScheduler } from '../../utils/overlay.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Run an action (`'rewrite'`, `'translate'`, your own) on the selection or at the caret. */
    aiRun: [actionId: string, options?: Record<string, string>];
    /** Ask for anything: the selection is replaced, or the answer goes at the caret. */
    aiPrompt: [prompt: string, options?: Record<string, string>];
    /** Put the answer into the document, as one undo step. */
    aiAccept: [];
    /** Drop the answer (stopping it first); the document is untouched. */
    aiDiscard: [];
    /** Ask again, the same request. */
    aiRetry: [];
    /** Stop the answer where it is; what arrived can still be accepted. */
    aiStop: [];
    /** Open the AI menu (`<AiMenu>`) at the selection. */
    openAiMenu: [];
  }
}

export const AI_EXTENSION = '@teispace/teieditor/ai';

/** What kind of request the handler gets. Your own actions are `custom` unless they say otherwise. */
export type AiActionKind =
  | 'continue'
  | 'rewrite'
  | 'summarize'
  | 'shorter'
  | 'longer'
  | 'fix'
  | 'translate'
  | 'tone'
  | 'custom';

/** Everything the handler is told. All of it is text: send what you need to your model. */
export interface AiRequest {
  /** The kind of action. */
  action: AiActionKind;
  /** The action's id: a built-in one's, or your own. */
  id: string;
  /** The instruction: the action's built-in one, or what the user typed. */
  prompt?: string;
  /** The selected text, plain and as markdown. Empty at a caret. */
  selection: { text: string; markdown: string };
  /**
   * The text around it: before and after, cut to `contextBefore` and
   * `contextAfter` characters; and the whole document's text, to
   * `documentContext` characters, when that is set.
   */
  context: { before: string; after: string; document?: string };
  /** The action's options: `language` for translate, `tone` for tone, your own. */
  options: Record<string, string>;
  /** What the answer should be written in: markdown (headings, lists) or plain text. */
  format: 'markdown' | 'text';
}

/** A piece of an answer: text, or bytes (a `fetch` body) read as UTF-8. */
export type AiChunk = string | Uint8Array;

/** An answer, whole or streamed, or a promise of one. */
export type AiAnswer = string | AsyncIterable<AiChunk> | ReadableStream<AiChunk>;

/**
 * Your model, behind one function: given a request, return the answer as
 * text, a stream (`ReadableStream`, an async generator), or a promise of
 * either. `signal` aborts when the user stops or discards; pass it to
 * `fetch`. The editor makes no requests of its own.
 */
export type AiHandler = (
  request: AiRequest,
  context: { signal: AbortSignal },
) => AiAnswer | Promise<AiAnswer>;

/** One choice an action asks for first: a language, a tone. */
export interface AiChoice {
  /** What the handler gets, as `options[option]`. */
  value: string;
  /** Label, or a message id. Default: the value. */
  label?: string;
}

/** An action in the AI menu. */
export interface AiAction {
  /** Unique id; `aiRun(id)` runs it. */
  id: string;
  /** What the handler is told it is. Default `custom`. */
  kind?: AiActionKind;
  /** Label, or a message id. */
  label: string;
  /** Icon name. */
  icon?: string;
  /** Extra words the menu's filter matches. */
  keywords?: readonly string[];
  /**
   * Where it is offered: `selection` needs selected text, `caret` a caret
   * with nothing selected, `empty` a caret on an empty line, `always` either.
   */
  when: 'selection' | 'caret' | 'empty' | 'always';
  /**
   * What accepting does with selected text: `replace` it (the default) or
   * put the answer in a new block `after` it. At a caret, the answer goes there.
   */
  insert?: 'replace' | 'after';
  /** The instruction sent as `prompt`. */
  prompt?: (request: Omit<AiRequest, 'prompt'>) => string;
  /** A choice made first, passed as `options[option]`; the menu lists the values. */
  choices?: { option: string; values: readonly AiChoice[] };
}

export interface AiOptions {
  /** Your model. Without one, nothing is offered. */
  handler: AiHandler | null;
  /** The menu's actions, in order. Default {@link AI_ACTIONS}: add, remove or relabel from it. */
  actions: readonly AiAction[];
  /** How the answer is read: markdown becomes headings, lists and links; text stays text. Default markdown. */
  format: 'markdown' | 'text';
  /** Characters of text before the selection to send. Default 2000. */
  contextBefore: number;
  /** Characters of text after it. Default 1000. */
  contextAfter: number;
  /** Characters of the whole document's text to send too; 0 sends none. Default 0. */
  documentContext: number;
  /** The longest selection an action takes, in characters. Default 20000. */
  maxSelection: number;
}

export type AiState = 'idle' | 'streaming' | 'done' | 'error';

export interface AiStorage {
  /** Where the answer is: none yet, arriving, complete (or stopped), failed. */
  readonly state: Signal<AiState>;
  /** The answer so far. Updated at most once a frame while it streams. */
  readonly output: Signal<string>;
  /** The id of the action that asked. */
  readonly action: Signal<string | null>;
  /** Why it failed, as text. */
  readonly error: Signal<string | null>;
  /** Whether the user stopped it before it was complete. */
  readonly stopped: Signal<boolean>;
  /** What accepting will do: replace the selected text, or insert at the caret. */
  readonly mode: Signal<'replace' | 'insert' | null>;
  /** `openAiMenu`'s requests, to the AI menu (`<AiMenu>`). */
  readonly menu: UiRequest;
  /** @internal */
  session: AiSession;
}

/** A point in the document, saved while the answer arrives. */
interface SavedPoint {
  key: string;
  offset: number;
  type: 'text' | 'element';
}

/** @internal One request and where its answer goes. */
export interface AiSession {
  run: ($request: () => Prepared | null) => boolean;
  retry: () => boolean;
  stop: () => boolean;
  discard: () => boolean;
  $accept: () => boolean;
  hasRequest: () => boolean;
}

interface Prepared {
  request: AiRequest;
  start: SavedPoint;
  end: SavedPoint;
  /** The selected text when asked: accepting replaces it only if it is still there. */
  text: string;
  mode: 'replace' | 'after' | 'insert';
}

/** The built-in instructions, short and plain; a handler can use `action` and ignore them. */
const keep = 'Keep its meaning, language and formatting. Reply with only the new text.';

/** The actions the menu offers by default. */
export const AI_ACTIONS: readonly AiAction[] = [
  {
    id: 'continue',
    kind: 'continue',
    label: 'ai.action.continue',
    icon: 'penLine',
    keywords: ['write', 'more', 'next'],
    when: 'caret',
    prompt: () =>
      'Continue writing from where the text before the caret ends. Match its language, tone and formatting. Reply with only the new text.',
  },
  {
    id: 'rewrite',
    kind: 'rewrite',
    label: 'ai.action.rewrite',
    icon: 'wand',
    keywords: ['improve', 'rephrase', 'clarity'],
    when: 'selection',
    prompt: () => `Rewrite the text so it reads clearly and smoothly. ${keep}`,
  },
  {
    id: 'fix',
    kind: 'fix',
    label: 'ai.action.fix',
    icon: 'spellCheck',
    keywords: ['spelling', 'grammar', 'typo', 'correct'],
    when: 'selection',
    prompt: () => `Fix the spelling and grammar, changing nothing else. ${keep}`,
  },
  {
    id: 'shorter',
    kind: 'shorter',
    label: 'ai.action.shorter',
    icon: 'shrink',
    keywords: ['shorten', 'concise', 'trim'],
    when: 'selection',
    prompt: () => `Make the text shorter. ${keep}`,
  },
  {
    id: 'longer',
    kind: 'longer',
    label: 'ai.action.longer',
    icon: 'expand',
    keywords: ['expand', 'elaborate', 'lengthen'],
    when: 'selection',
    prompt: () => `Make the text longer, with more detail. ${keep}`,
  },
  {
    id: 'summarize',
    kind: 'summarize',
    label: 'ai.action.summarize',
    icon: 'fileText',
    keywords: ['summary', 'tldr', 'key points'],
    when: 'selection',
    insert: 'after',
    prompt: () =>
      'Summarize the text in a few sentences, in its language. Reply with only the summary.',
  },
  {
    id: 'tone',
    kind: 'tone',
    label: 'ai.action.tone',
    icon: 'megaphone',
    keywords: ['voice', 'style', 'formal', 'casual'],
    when: 'selection',
    choices: {
      option: 'tone',
      values: ['professional', 'casual', 'friendly', 'confident', 'direct'].map((value) => ({
        value,
        label: `ai.tone.${value}`,
      })),
    },
    prompt: ({ options }) =>
      `Rewrite the text in a ${options.tone ?? 'professional'} tone. ${keep}`,
  },
  {
    id: 'translate',
    kind: 'translate',
    label: 'ai.action.translate',
    icon: 'languages',
    keywords: ['language', 'translation'],
    when: 'selection',
    choices: {
      option: 'language',
      values: [
        'English',
        'Spanish',
        'French',
        'German',
        'Portuguese',
        'Italian',
        'Chinese',
        'Japanese',
        'Korean',
        'Hindi',
        'Arabic',
      ].map((value) => ({ value })),
    },
    prompt: ({ options }) =>
      `Translate the text into ${options.language ?? 'English'}. Keep its formatting. Reply with only the translation.`,
  },
];

/** The custom prompt's action: what `aiPrompt` runs. */
const CUSTOM: AiAction = { id: 'custom', kind: 'custom', label: 'ai.ask', when: 'always' };

// -- Reading the selection ---------------------------------------------------

const save = (point: PointType): SavedPoint => ({
  key: point.key,
  offset: point.offset,
  type: point.type,
});

/** A saved point, if it still points into the document. */
function $valid(point: SavedPoint): boolean {
  const node = $getNodeByKey(point.key);
  if (!node?.isAttached()) return false;
  if (point.type === 'text') return $isTextNode(node) && point.offset <= node.getTextContentSize();
  return $isElementNode(node) && point.offset <= node.getChildrenSize();
}

function $range(start: SavedPoint, end: SavedPoint): RangeSelection {
  const range = $createRangeSelection();
  range.anchor.set(start.key, start.offset, start.type);
  range.focus.set(end.key, end.offset, end.type);
  return range;
}

/** The text from the document's start to a point, or from a point to its end. */
function $textBefore(point: SavedPoint): string {
  const root = $getRoot();
  const range = $createRangeSelection();
  range.anchor.set(root.getKey(), 0, 'element');
  range.focus.set(point.key, point.offset, point.type);
  return range.getTextContent();
}

function $textAfter(point: SavedPoint): string {
  const root = $getRoot();
  const range = $createRangeSelection();
  range.anchor.set(point.key, point.offset, point.type);
  range.focus.set(root.getKey(), root.getChildrenSize(), 'element');
  return range.getTextContent();
}

/** The top-level block a node is in. */
function $topBlock(node: LexicalNode): LexicalNode {
  let current = node;
  for (let parent = current.getParent(); parent && !$isRootOrShadowRoot(parent); ) {
    current = parent;
    parent = current.getParent();
  }
  return current;
}

/** Whether an action is offered at this selection. */
function $applies(action: AiAction, selection: RangeSelection | null): boolean {
  if (!selection) return false;
  const selected = !selection.isCollapsed() && selection.getTextContent().trim() !== '';
  switch (action.when) {
    case 'selection':
      return selected;
    case 'caret':
      return selection.isCollapsed();
    case 'empty':
      return (
        selection.isCollapsed() && $topBlock(selection.anchor.getNode()).getTextContent() === ''
      );
    default:
      return true;
  }
}

// -- Writing the answer ------------------------------------------------------

/** Plain text as paragraphs: a blank line between them, single newlines kept as line breaks. */
function $textNodes(text: string): LexicalNode[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => {
      const paragraph = $createParagraphNode();
      block.split('\n').forEach((line, i) => {
        if (i > 0) paragraph.append($createLineBreakNode());
        if (line) paragraph.append($createTextNode(line));
      });
      return paragraph;
    });
}

/**
 * Put the answer where the selection is. One paragraph goes in as inline
 * text, so a rewritten phrase stays in its sentence; more becomes blocks.
 */
function $insertAnswer(nodes: LexicalNode[], selection: RangeSelection): void {
  const blocks = nodes.filter((node) => !($isParagraphNode(node) && node.isEmpty()));
  if (blocks.length === 0) return;
  const only = blocks[0];
  if (blocks.length === 1 && $isParagraphNode(only)) {
    selection.insertNodes(only.getChildren());
    return;
  }
  selection.insertNodes(blocks);
}

// -- Reading a streamed answer -----------------------------------------------

function isReadable(value: unknown): value is ReadableStream<AiChunk> {
  return typeof (value as ReadableStream | null)?.getReader === 'function';
}

function isAsyncIterable(value: unknown): value is AsyncIterable<AiChunk> {
  return typeof (value as AsyncIterable<AiChunk> | null)?.[Symbol.asyncIterator] === 'function';
}

/** Read an answer, a piece at a time, until it ends or `signal` aborts. */
async function readAnswer(
  answer: AiAnswer | Promise<AiAnswer>,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<void> {
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(signal.reason);
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
  aborted.catch(() => {});
  const value = await Promise.race([Promise.resolve(answer), aborted]);
  const decoder = new TextDecoder();
  const take = (chunk: AiChunk) => {
    const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    if (text) onText(text);
  };
  if (typeof value === 'string') {
    take(value);
    return;
  }
  if (isReadable(value)) {
    const reader = value.getReader();
    try {
      while (true) {
        const next = await Promise.race([reader.read(), aborted]);
        if (next.done) break;
        take(next.value);
      }
    } finally {
      if (signal.aborted) reader.cancel().catch(() => {});
      reader.releaseLock?.();
    }
  } else if (isAsyncIterable(value)) {
    const iterator = value[Symbol.asyncIterator]();
    try {
      while (true) {
        const next = await Promise.race([iterator.next(), aborted]);
        if (next.done) break;
        take(next.value);
      }
    } finally {
      // A generator paused at an `await` returns when it resumes.
      if (signal.aborted) Promise.resolve(iterator.return?.()).catch(() => {});
    }
  } else if (value != null) {
    throw new TypeError('teieditor: the AI handler must return text or a stream of text');
  }
  const rest = decoder.decode();
  if (rest) onText(rest);
}

function message(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Error';
}

// -- The session ---------------------------------------------------------------

function createStorage(editor: TeiEditor, options: Readonly<AiOptions>): AiStorage {
  const storage = {
    state: signal<AiState>('idle'),
    output: signal(''),
    action: signal<string | null>(null),
    error: signal<string | null>(null),
    stopped: signal(false),
    mode: signal<'replace' | 'insert' | null>(null),
    menu: uiRequest(),
  } as AiStorage;

  let current: { prepared: Prepared; abort: AbortController; id: number } | null = null;
  let last: Prepared | null = null;
  let buffer = '';
  let runs = 0;
  const flush = frameScheduler(() => {
    storage.output.value = buffer;
  });

  const halt = () => {
    flush.cancel();
    current?.abort.abort();
  };

  const reset = () => {
    halt();
    current = null;
    last = null;
    buffer = '';
    batch(() => {
      storage.state.value = 'idle';
      storage.output.value = '';
      storage.action.value = null;
      storage.error.value = null;
      storage.stopped.value = false;
      storage.mode.value = null;
    });
  };

  const start = (prepared: Prepared): boolean => {
    const handler = options.handler;
    if (!handler) return false;
    halt();
    const abort = new AbortController();
    const id = ++runs;
    current = { prepared, abort, id };
    last = prepared;
    buffer = '';
    batch(() => {
      storage.state.value = 'streaming';
      storage.output.value = '';
      storage.action.value = prepared.request.id;
      storage.error.value = null;
      storage.stopped.value = false;
      storage.mode.value = prepared.mode === 'replace' ? 'replace' : 'insert';
    });
    const live = () => current?.id === id && !abort.signal.aborted;
    // Outside the update the command runs in: the handler is the app's code.
    Promise.resolve()
      .then(() => {
        if (!live()) return;
        return readAnswer(
          handler(prepared.request, { signal: abort.signal }),
          abort.signal,
          (text) => {
            if (!live()) return;
            buffer += text;
            flush.schedule();
          },
        );
      })
      .then(
        () => {
          if (!live()) return;
          flush.cancel();
          batch(() => {
            storage.output.value = buffer;
            storage.state.value = 'done';
          });
        },
        (error: unknown) => {
          if (!live()) return;
          flush.cancel();
          batch(() => {
            storage.output.value = buffer;
            storage.error.value = message(error);
            storage.state.value = 'error';
          });
        },
      );
    return true;
  };

  storage.session = {
    run: ($prepare) => {
      const prepared = $prepare();
      return prepared ? start(prepared) : false;
    },
    retry: () => (last ? start(last) : false),
    hasRequest: () => last !== null,
    stop: () => {
      if (storage.state.peek() !== 'streaming') return false;
      halt();
      current = null;
      batch(() => {
        storage.output.value = buffer;
        storage.stopped.value = true;
        storage.state.value = 'done';
      });
      return true;
    },
    discard: () => {
      if (storage.state.peek() === 'idle') return false;
      reset();
      return true;
    },
    $accept: () => {
      const target = last;
      const answer = buffer;
      if (!target || storage.state.peek() !== 'done' || !answer.trim()) return false;
      const { start: from, end: to, mode, text } = target;
      let selection: RangeSelection | null = null;
      if ($valid(from) && $valid(to)) {
        selection = $range(from, to);
        // Replace only what was asked about: text changed since is never lost.
        if (mode === 'replace' && selection.getTextContent() !== text) {
          selection = $range(to, to);
        }
      }
      if (!selection) {
        const now = $getSelection();
        if ($isRangeSelection(now)) {
          selection = now.clone();
          const end = now.isBackward() ? now.anchor : now.focus;
          selection.anchor.set(end.key, end.offset, end.type);
          selection.focus.set(end.key, end.offset, end.type);
        } else {
          $getRoot().selectEnd();
          selection = $getSelection() as RangeSelection;
        }
      } else if (mode === 'after') {
        // A new block after the selected text's last one.
        const block = $topBlock(
          selection.isBackward() ? selection.anchor.getNode() : selection.focus.getNode(),
        );
        const paragraph = $createParagraphNode();
        block.insertAfter(paragraph);
        selection = paragraph.select();
      }
      $setSelection(selection);
      $addUpdateTag(HISTORY_PUSH_TAG);
      const nodes =
        options.format === 'markdown'
          ? $generateNodesFromMarkdownString(answer, editor.markdownTransformers)
          : $textNodes(answer);
      const inserted = $getSelection();
      if ($isRangeSelection(inserted)) $insertAnswer(nodes, inserted);
      reset();
      return true;
    },
  };
  return storage;
}

/** The request for an action at the selection, or `null` when it does not apply. */
function $prepare(
  editor: TeiEditor,
  options: Readonly<AiOptions>,
  action: AiAction,
  given: Record<string, string> | undefined,
  prompt?: string,
): Prepared | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !$applies(action, selection)) return null;
  const text = selection.isCollapsed() ? '' : selection.getTextContent();
  if (text.length > options.maxSelection) return null;
  const forward = !selection.isBackward();
  const start = save(forward ? selection.anchor : selection.focus);
  const end = save(forward ? selection.focus : selection.anchor);
  const values: Record<string, string> = { ...given };
  if (action.choices && values[action.choices.option] === undefined) {
    const first = action.choices.values[0];
    if (first) values[action.choices.option] = first.value;
  }
  const document =
    options.documentContext > 0
      ? $getRoot().getTextContent().slice(0, options.documentContext)
      : undefined;
  const base: Omit<AiRequest, 'prompt'> = {
    action: action.kind ?? 'custom',
    id: action.id,
    selection: {
      text,
      markdown: text
        ? $convertSelectionToMarkdownString(editor.markdownTransformers, selection)
        : '',
    },
    context: {
      before: options.contextBefore > 0 ? $textBefore(start).slice(-options.contextBefore) : '',
      after: options.contextAfter > 0 ? $textAfter(end).slice(0, options.contextAfter) : '',
      ...(document === undefined ? {} : { document }),
    },
    options: values,
    format: options.format,
  };
  const request: AiRequest = { ...base, prompt: prompt ?? action.prompt?.(base) };
  if (request.prompt === undefined) delete request.prompt;
  return {
    request,
    start,
    end,
    text,
    mode: text ? (action.insert === 'after' ? 'after' : 'replace') : 'insert',
  };
}

const findAction = (options: Readonly<AiOptions>, id: string) =>
  options.actions.find((action) => action.id === id);

/** Whether the AI can be asked at all: a handler, and an editable document. */
const ready = (editor: TeiEditor, options: Readonly<AiOptions>) =>
  Boolean(options.handler) && editor.isEditable;

/** Whether an editor has a handler for the AI: its items and keys show only then. */
const hasHandler = (editor: TeiEditor) =>
  Boolean(getPeerOptions<AiOptions>(editor.lexical, AI_EXTENSION)?.handler);

/**
 * A writing assistant on your own model: continue, rewrite, fix, shorten,
 * lengthen, summarize, translate, change the tone, or ask for anything.
 * You give it a `handler` that returns the answer, streamed or whole; the
 * editor makes no requests of its own. The answer streams into a preview
 * (`<AiMenu>` shows it) and the document changes only when it is accepted,
 * as one undo step; discarding leaves it untouched. Escape, discarding,
 * going read-only and destroying the editor abort the request.
 *
 * Model output is untrusted: it goes in as text, or through the markdown
 * import, where links pass the Link extension's URL allowlist and HTML
 * stays literal text.
 */
export const Ai = defineTeiExtension({
  name: AI_EXTENSION,
  config: {
    handler: null,
    actions: AI_ACTIONS,
    format: 'markdown',
    contextBefore: 2000,
    contextAfter: 1000,
    documentContext: 0,
    maxSelection: 20000,
  } as AiOptions,
  storage: ({ editor, options }): AiStorage => createStorage(editor, options),
  commands: {
    aiRun: {
      run: ({ editor, options, storage }, id: string, values?: Record<string, string>) => {
        const action = findAction(options, id);
        if (!action || !ready(editor, options)) return false;
        return storage.session.run(() => $prepare(editor, options, action, values));
      },
      can: ({ editor, options }, id: string, values?: Record<string, string>) => {
        const action = findAction(options, id);
        return Boolean(
          action && ready(editor, options) && $prepare(editor, options, action, values, ''),
        );
      },
    },
    aiPrompt: {
      run: ({ editor, options, storage }, prompt: string, values?: Record<string, string>) => {
        if (!ready(editor, options) || typeof prompt !== 'string' || !prompt.trim()) return false;
        return storage.session.run(() => $prepare(editor, options, CUSTOM, values, prompt.trim()));
      },
      can: ({ editor, options }, prompt?: string) =>
        ready(editor, options) &&
        (prompt === undefined || (typeof prompt === 'string' && prompt.trim() !== '')) &&
        $prepare(editor, options, CUSTOM, undefined, '') !== null,
    },
    aiAccept: {
      run: ({ editor, storage }) => editor.isEditable && storage.session.$accept(),
      can: ({ editor, storage }) =>
        editor.isEditable && storage.state.peek() === 'done' && storage.output.peek().trim() !== '',
    },
    aiDiscard: {
      run: ({ storage }) => storage.session.discard(),
      can: ({ storage }) => storage.state.peek() !== 'idle',
    },
    aiRetry: {
      run: ({ editor, options, storage }) => ready(editor, options) && storage.session.retry(),
      can: ({ editor, options, storage }) =>
        ready(editor, options) &&
        storage.session.hasRequest() &&
        storage.state.peek() !== 'streaming' &&
        storage.state.peek() !== 'idle',
    },
    aiStop: {
      run: ({ storage }) => storage.session.stop(),
      can: ({ storage }) => storage.state.peek() === 'streaming',
    },
    openAiMenu: {
      run: ({ editor, options, storage }) =>
        ready(editor, options) && $isRangeSelection($getSelection()) && requestUi(storage.menu),
      can: ({ editor, options, storage }) =>
        ready(editor, options) && hasUi(storage.menu) && $isRangeSelection($getSelection()),
    },
  },
  keymap: {
    ai: { key: 'Mod-j', command: 'openAiMenu', description: 'Ask AI' },
  },
  icons: {
    sparkles,
    penLine,
    wand,
    spellCheck,
    shrink,
    expand,
    fileText,
    megaphone,
    languages,
    stop,
    retry,
    check,
    close,
    chevronLeft,
    chevronRight,
  },
  messages: {
    'ai.label': 'AI',
    'ai.ask': 'Ask AI',
    'ai.askDescription': 'Write, edit or summarize with AI',
    'ai.menu': 'AI assistant',
    'ai.placeholder': 'Ask AI to write or edit…',
    'ai.actions': 'Actions',
    'ai.custom': 'Ask: {prompt}',
    'ai.noMatch': 'No matching actions',
    'ai.back': 'Back',
    'ai.preview': 'Answer',
    'ai.writing': 'Writing…',
    'ai.ready': 'Answer ready. Enter to accept, Escape to discard.',
    'ai.stopped': 'Stopped.',
    'ai.empty': 'No answer came back.',
    'ai.failed': 'Something went wrong: {error}',
    'ai.accept': 'Accept',
    'ai.discard': 'Discard',
    'ai.retry': 'Try again',
    'ai.stop': 'Stop',
    'ai.accepted': 'Answer inserted',
    'ai.action.continue': 'Continue writing',
    'ai.action.rewrite': 'Improve writing',
    'ai.action.fix': 'Fix spelling and grammar',
    'ai.action.shorter': 'Make shorter',
    'ai.action.longer': 'Make longer',
    'ai.action.summarize': 'Summarize',
    'ai.action.tone': 'Change tone',
    'ai.action.translate': 'Translate',
    'ai.tone.professional': 'Professional',
    'ai.tone.casual': 'Casual',
    'ai.tone.friendly': 'Friendly',
    'ai.tone.confident': 'Confident',
    'ai.tone.direct': 'Direct',
  },
  items: [
    {
      id: 'ai',
      label: 'ai.ask',
      description: 'ai.askDescription',
      icon: 'sparkles',
      in: ['slash'],
      group: 'advanced',
      keywords: ['ai', 'assistant', 'write', 'generate', 'gpt'],
      shortcut: 'ai',
      command: 'openAiMenu',
      visible: hasHandler,
    },
    {
      id: 'aiMenu',
      label: 'ai.label',
      icon: 'sparkles',
      in: ['bubble'],
      shortcut: 'ai',
      command: 'openAiMenu',
      visible: hasHandler,
    },
  ],
  register: ({ lexical, storage }) =>
    mergeRegister(
      lexical.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (storage.state.peek() === 'idle') return false;
          event?.preventDefault();
          storage.session.discard();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      lexical.registerEditableListener((editable) => {
        if (!editable) storage.session.discard();
      }),
      // Destroyed: the request stops, and nothing it sends lands.
      () => storage.session.discard(),
    ),
});
