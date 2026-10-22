import { type Signal, signal } from '@lexical/extension';
import {
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_HIGH,
  HISTORIC_TAG,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
  PASTE_TAG,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import { RichText } from '../rich-text/index.js';
import { AUTOCOMPLETE_WORDS } from './words.js';

export { AUTOCOMPLETE_WORDS };

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Type the suggestion showing after the caret. */
    acceptSuggestion: [];
    /** Hide the suggestion showing after the caret. */
    dismissSuggestion: [];
  }
}

/** What a `suggest` function is told: the word being typed and the line before the caret. */
export interface AutocompleteContext {
  /** The word the caret is at the end of. */
  word: string;
  /** The line's text before the caret (its last 500 characters). */
  textBefore: string;
}

/**
 * Return the text to add after the caret (not the whole word), or `null`.
 * `signal` aborts when the user types on, so a slow request can stop.
 */
export type AutocompleteSuggest = (
  context: AutocompleteContext,
  options: { signal: AbortSignal },
) => Promise<string | null | undefined> | string | null | undefined;

export interface AutocompleteOptions {
  /** Where suggestions come from. Default: the `words` list. */
  suggest: AutocompleteSuggest | null;
  /** Words the built-in suggester completes. Default {@link AUTOCOMPLETE_WORDS}. */
  words: readonly string[];
  /** Letters typed before suggesting. Default 2. */
  minLength: number;
  /** Milliseconds of quiet before asking `suggest`. Default 120. */
  debounce: number;
}

export interface AutocompleteStorage {
  /** The suggestion showing after the caret, if any. */
  readonly suggestion: Signal<string | null>;
  /** @internal What the commands run, set once the editor has a root. */
  accept: () => boolean;
  /** @internal */
  dismiss: () => boolean;
}

export const AUTOCOMPLETE_EXTENSION = '@teispace/teieditor/autocomplete';

/** The word at the end of the text, and what may not come before it (a mention's `@`, a slash command). */
const WORD = /(^|[^@#:/\p{L}\p{N}_])([\p{L}\p{N}_][\p{L}\p{N}_'’-]*)$/u;
/** The longest a suggestion may be: one line, for a ghost after the caret. */
const MAX_SUGGESTION = 200;

/** The built-in suggester: the first listed word that the typed one starts, in the typed case. */
export function suggestFromWords(words: readonly string[], word: string): string | null {
  const lower = word.toLowerCase();
  const found = words.find((w) => w.length > lower.length && w.toLowerCase().startsWith(lower));
  if (!found) return null;
  const rest = found.slice(lower.length);
  return word.length > 1 && word === word.toUpperCase() && word !== lower
    ? rest.toUpperCase()
    : rest;
}

interface Query extends AutocompleteContext {
  key: NodeKey;
  offset: number;
}

/** Where a suggestion could go: a caret at the end of a line's text, outside code. */
function $query(): Query | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const node = selection.anchor.getNode();
  const offset = selection.anchor.offset;
  if (!$isTextNode(node) || offset !== node.getTextContentSize() || offset === 0) return null;
  if (node.hasFormat('code') || node.getType() === 'code-highlight') return null;
  // The end of the line: nothing after the caret but a line break.
  let at: LexicalNode = node;
  let parent = node.getParent();
  while (parent && $isElementNode(parent) && parent.isInline()) {
    const next = at.getNextSibling();
    if (next && !$isLineBreakNode(next)) return null;
    at = parent;
    parent = parent.getParent();
  }
  const next = at.getNextSibling();
  if (!parent || (next && !$isLineBreakNode(next)) || parent.getType() === 'code') return null;
  let textBefore = '';
  for (let prev = at.getPreviousSibling(); prev; prev = prev.getPreviousSibling()) {
    if ($isLineBreakNode(prev)) break;
    textBefore = prev.getTextContent() + textBefore;
    if (textBefore.length > 500) break;
  }
  textBefore = (textBefore + at.getTextContent()).slice(-500);
  const word = WORD.exec(textBefore)?.[2];
  return word ? { key: node.getKey(), offset, word, textBefore } : null;
}

/** A suggestion as one line of plain text, or nothing. */
function clean(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const line = text.split(/[\r\n]/, 1)[0] ?? '';
  return line.trim() ? line.slice(0, MAX_SUGGESTION) : null;
}

/** The last text node in an element: where the caret is. */
function lastText(element: Node): Text | null {
  for (let child = element.lastChild; child; child = child.previousSibling) {
    if (child.nodeType === 3) return child as Text;
    const found = lastText(child);
    if (found) return found;
  }
  return null;
}

type Ctx = {
  editor: TeiEditor;
  lexical: LexicalEditor;
  options: AutocompleteOptions;
  storage: AutocompleteStorage;
};

function register({ editor, lexical, options, storage }: Ctx): () => void {
  /** What is showing, for where. */
  let shown: (Query & { suggestion: string }) | null = null;
  /** The request on its way. */
  let pending: {
    query: Query;
    timer: ReturnType<typeof setTimeout>;
    abort: AbortController;
  } | null = null;
  let overlay: HTMLElement | null = null;

  const cancel = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.abort.abort();
    pending = null;
  };

  const hide = () => {
    shown = null;
    overlay?.remove();
    if (storage.suggestion.peek() !== null) storage.suggestion.value = null;
  };

  const clear = () => {
    cancel();
    hide();
  };

  /** Draw the ghost after the caret: one line, in the text's font, never read out. */
  const draw = () => {
    const root = lexical.getRootElement();
    const host = root?.parentElement;
    const element = shown && lexical.getElementByKey(shown.key);
    const text = element && lastText(element);
    if (!shown || !root || !host || !text) return hide();
    const doc = root.ownerDocument;
    const view = doc.defaultView;
    if (!overlay) {
      overlay = doc.createElement('span');
      overlay.className = (lexical._config.theme.autocomplete as string) || 'tei-autocomplete';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('data-tei-autocomplete', '');
      // A tap or click takes it: phones have no Tab.
      overlay.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch') event.preventDefault();
      });
      overlay.addEventListener('click', (event) => {
        event.preventDefault();
        editor.commands.acceptSuggestion();
        editor.focus();
      });
    }
    overlay.textContent = shown.suggestion;
    const style = view?.getComputedStyle(text.parentElement ?? element);
    if (style) {
      overlay.style.fontFamily = style.fontFamily;
      overlay.style.fontSize = style.fontSize;
      overlay.style.fontWeight = style.fontWeight;
      overlay.style.fontStyle = style.fontStyle;
      overlay.style.letterSpacing = style.letterSpacing;
    }
    if (overlay.parentNode !== host) host.append(overlay);
    const range = doc.createRange();
    range.setStart(text, text.length);
    const rects = range.getClientRects();
    const caret = rects[rects.length - 1] ?? range.getBoundingClientRect();
    // Measured against what it is positioned in (the page, past a static body).
    const parent = overlay.offsetParent as HTMLElement | null;
    const viewport =
      !parent || (parent === doc.body && view?.getComputedStyle(parent).position === 'static');
    const box = viewport
      ? { left: -(view?.scrollX ?? 0), top: -(view?.scrollY ?? 0) }
      : parent.getBoundingClientRect();
    const scrollLeft = viewport ? 0 : parent.scrollLeft - parent.clientLeft;
    const scrollTop = viewport ? 0 : parent.scrollTop - parent.clientTop;
    const rtl = style?.direction === 'rtl';
    const bounds = root.getBoundingClientRect();
    const room = rtl ? caret.left - bounds.left : bounds.right - caret.right;
    overlay.style.maxInlineSize = `${Math.max(room, 0)}px`;
    overlay.style.blockSize = `${caret.height}px`;
    overlay.style.lineHeight = `${caret.height}px`;
    overlay.style.top = `${caret.top - box.top + scrollTop}px`;
    overlay.style.left = `${(rtl ? caret.left - overlay.offsetWidth : caret.right) - box.left + scrollLeft}px`;
    overlay.toggleAttribute('data-rtl', rtl);
  };

  const show = (query: Query, suggestion: string) => {
    shown = { ...query, suggestion };
    storage.suggestion.value = suggestion;
    draw();
  };

  const ask = (query: Query) => {
    const abort = new AbortController();
    const run = () => {
      let result: ReturnType<AutocompleteSuggest>;
      try {
        result = options.suggest
          ? options.suggest(
              { word: query.word, textBefore: query.textBefore },
              { signal: abort.signal },
            )
          : suggestFromWords(options.words, query.word);
      } catch {
        return;
      }
      Promise.resolve(result).then(
        (text) => {
          if (abort.signal.aborted || pending?.abort !== abort) return;
          pending = null;
          const suggestion = clean(text);
          if (suggestion && !lexical.isComposing()) show(query, suggestion);
        },
        () => {},
      );
    };
    pending = { query, abort, timer: setTimeout(run, options.debounce) };
  };

  const same = (a: Query | null, b: Query | null) =>
    a !== null &&
    b !== null &&
    a.key === b.key &&
    a.offset === b.offset &&
    a.textBefore === b.textBefore;

  /** Accept the suggestion: type it, and say so to screen readers. */
  const $accept = (): boolean => {
    const current = shown;
    if (!current || !same($query(), current)) return false;
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return false;
    hide();
    selection.insertText(current.suggestion);
    editor.announce(editor.t('autocomplete.accepted', { word: current.word + current.suggestion }));
    return true;
  };

  storage.accept = $accept;
  storage.dismiss = () => {
    const had = shown !== null || pending !== null;
    clear();
    return had;
  };

  const onKeyDown = (event: KeyboardEvent): boolean => {
    if (!shown || event.isComposing || lexical.isComposing()) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const rtl = overlay?.hasAttribute('data-rtl') ?? false;
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    if (event.key === 'Escape') {
      event.preventDefault();
      clear();
      return true;
    }
    if (event.key !== 'Tab' && event.key !== forward) return false;
    if (!$accept()) return false;
    event.preventDefault();
    return true;
  };

  const onRoot = (root: HTMLElement | null, prev: HTMLElement | null) => {
    prev?.removeEventListener('blur', clear);
    prev?.removeEventListener('compositionstart', clear);
    root?.addEventListener('blur', clear);
    root?.addEventListener('compositionstart', clear);
    clear();
    overlay = null;
  };

  return mergeRegister(
    lexical.registerRootListener(onRoot),
    lexical.registerCommand(KEY_DOWN_COMMAND, onKeyDown, COMMAND_PRIORITY_HIGH),
    lexical.registerEditableListener((editable) => {
      if (!editable) clear();
    }),
    lexical.registerUpdateListener(({ tags, dirtyLeaves, editorState }) => {
      if (!lexical.isEditable() || lexical.isComposing()) return clear();
      const query = editorState.read($query);
      if (!query) return clear();
      // Typing what the ghost shows eats into it, with no new request.
      if (shown && query.key === shown.key && query.textBefore.startsWith(shown.textBefore)) {
        const typed = query.textBefore.slice(shown.textBefore.length);
        if (typed && shown.suggestion.startsWith(typed) && typed !== shown.suggestion) {
          cancel();
          show(query, shown.suggestion.slice(typed.length));
          return;
        }
      }
      if (same(query, shown)) return draw();
      if (same(query, pending?.query ?? null)) return;
      clear();
      // Only as the user types: not on caret moves, undo, paste or a collaborator's edit.
      if (
        dirtyLeaves.size === 0 ||
        tags.has(HISTORIC_TAG) ||
        tags.has(PASTE_TAG) ||
        tags.has(COLLABORATION_TAG) ||
        !editor.isFocused ||
        query.word.length < options.minLength
      )
        return;
      ask(query);
    }),
    () => {
      clear();
      overlay = null;
    },
  );
}

/**
 * Suggestions as you type: a ghost of the rest of the word (or sentence)
 * after the caret, from your `suggest` function or a word list. Tab, or →
 * at the end of the line, takes it; Escape or typing on drops it. It is
 * drawn over the page, never in the document, so it is never saved, undone
 * or sent to collaborators; screen readers hear only what was accepted.
 */
export const Autocomplete = defineTeiExtension({
  name: AUTOCOMPLETE_EXTENSION,
  config: {
    suggest: null,
    words: AUTOCOMPLETE_WORDS,
    minLength: 2,
    debounce: 120,
  } as AutocompleteOptions,
  dependencies: [RichText],
  storage: (): AutocompleteStorage => ({
    suggestion: signal<string | null>(null),
    accept: () => false,
    dismiss: () => false,
  }),
  commands: {
    acceptSuggestion: {
      run: ({ storage }) => storage.accept(),
      can: ({ storage }) => storage.suggestion.peek() !== null,
    },
    dismissSuggestion: {
      run: ({ storage }) => storage.dismiss(),
      can: ({ storage }) => storage.suggestion.peek() !== null,
    },
  },
  messages: { 'autocomplete.accepted': 'Completed: {word}' },
  register: (ctx) => register(ctx as unknown as Ctx),
});
