import { batch, effect, type Signal, signal } from '@lexical/extension';
import {
  $addUpdateTag,
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $getSlot,
  $getSlotNames,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  $isSlotHost,
  $isTextNode,
  $setSelection,
  type ElementNode,
  getDOMTextNode,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
  type PointType,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
  type TextNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import {
  arrowDown,
  arrowUp,
  caseSensitive,
  chevronDown,
  chevronRight,
  close,
  regex,
  search,
  wholeWord,
} from '../../icons/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Open the find bar, the selection's text as the query when it is short. */
    openFind: [];
    /** Open the find bar with its replace row. */
    openReplace: [];
    /** Close it; the selection goes to the current match. */
    closeFind: [];
    findNext: [];
    findPrevious: [];
    replaceCurrent: [];
    /** Replace every match, as one undo step. */
    replaceAll: [];
    setFindQuery: [query: string];
    setFindOptions: [options: Partial<FindOptions>];
    setFindReplacement: [replacement: string];
  }
}

export interface FindOptions {
  /** Match `A` only to `A`. */
  caseSensitive: boolean;
  /** Only whole words: `cat` finds no `concat`. */
  wholeWord: boolean;
  /** The query is a regular expression; `$1` and `$<name>` in the replacement. */
  regex: boolean;
}

/** Where a match starts or ends: a text node and an offset in it. */
export interface FindPoint {
  key: NodeKey;
  offset: number;
}

export interface FindMatch {
  start: FindPoint;
  end: FindPoint;
  /** Every text node it covers, in order: one, unless it crosses formatting. */
  keys: readonly NodeKey[];
  /** The text it matched. */
  text: string;
  /** A regular expression's groups, for `$1` and `$<name>`. */
  groups?: readonly (string | undefined)[];
  named?: Readonly<Record<string, string | undefined>>;
}

export type FindMode = 'find' | 'replace';

/** `invalid`: the regular expression does not parse. `timeout`: it ran too long and stopped. */
export type FindError = 'invalid' | 'timeout';

export interface FindReplaceStorage {
  /** Whether the find bar is open, and with the replace row or not. */
  open: Signal<FindMode | false>;
  query: Signal<string>;
  replacement: Signal<string>;
  options: Signal<FindOptions>;
  /** In document order. Found only while open. */
  matches: Signal<readonly FindMatch[]>;
  /** The current match's index, or -1. */
  current: Signal<number>;
  error: Signal<FindError | null>;
  /** More matches than `maxMatches`: the count stops there. */
  limited: Signal<boolean>;
  /** `openFind`'s requests to the find bar (`<FindReplaceBar>`), which focuses its field. */
  ui: UiRequest;
}

export interface FindReplaceConfig {
  /** Most matches found. Default 10,000. */
  maxMatches: number;
  /** Longest a regular expression may search, in ms, before it stops. Default 250. */
  timeout: number;
  /** Documents with more blocks than this search again after edits pause. Default 2,000. */
  largeDocument: number;
  /** How long that pause is, in ms. Default 150. */
  debounce: number;
  /** Highlight names for `::highlight()`. */
  highlight: string;
  currentHighlight: string;
}

/** Inner state, out of the public storage. */
interface Engine {
  /** Matches by the key of a block holding only text, while that block is unchanged. */
  cache: Map<NodeKey, FindMatch[]>;
  blocks: number;
  /** Where the search starts: the selection when the bar opened. */
  origin: (FindPoint & { type: 'text' | 'element' }) | null;
  /** After a replace: the next match is the first after this. */
  after: FindPoint | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Scroll the current match into view at the next paint. */
  reveal: boolean;
}

const engines = new WeakMap<FindReplaceStorage, Engine>();
const engineOf = (storage: FindReplaceStorage) => engines.get(storage) as Engine;

const DEFAULT_OPTIONS: FindOptions = { caseSensitive: false, wholeWord: false, regex: false };

/** A literal string as a regular expression. */
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The query as a global regular expression, `null` for an empty query, or
 * `'invalid'`. Tries Unicode mode first (whole words then know every
 * script), then the legacy syntax a few patterns need.
 */
export function findPattern(query: string, options: FindOptions): RegExp | null | 'invalid' {
  if (!query) return null;
  const source = options.regex ? query : escapeRegExp(query);
  const flags = options.caseSensitive ? 'g' : 'gi';
  for (const unicode of ['u', '']) {
    try {
      // Checked alone first: `a)(b` must not become valid inside a wrapper.
      new RegExp(source, flags + unicode);
      if (!options.wholeWord) return new RegExp(source, flags + unicode);
      const word = unicode ? '[\\p{L}\\p{N}\\p{M}_]' : '\\w';
      return new RegExp(`(?<!${word})(?:${source})(?!${word})`, flags + unicode);
    } catch {}
  }
  return 'invalid';
}

/**
 * Whether a regular expression repeats a group that itself repeats
 * (`(a+)+`, `(?:a*)*`): the shape that backtracks exponentially. One
 * `exec` cannot be interrupted, so such a pattern is refused up front.
 */
export function isRiskyPattern(source: string): boolean {
  // For each open group: whether something inside it repeats.
  const groups: boolean[] = [];
  let repeats = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\') i++;
    else if (char === '[') {
      // A class is one atom: skip to its end.
      for (i++; i < source.length && source[i] !== ']'; i++) if (source[i] === '\\') i++;
    } else if (char === '(') {
      groups.push(repeats);
      repeats = false;
    } else if (char === ')') {
      const inner: boolean = repeats;
      repeats = (groups.pop() ?? false) || inner;
      const next = source[i + 1];
      const unbounded =
        next === '*' || next === '+' || (next === '{' && /^\{\d+,/.test(source.slice(i + 1)));
      if (inner && unbounded) return true;
    } else if (char === '*' || char === '+' || char === '{') repeats = true;
  }
  return false;
}

/**
 * A replacement with a match's groups: `$1`–`$99`, `$<name>`, `$&` (the
 * match) and `$$` (a dollar sign). Anything else stays as written.
 */
export function expandReplacement(template: string, match: FindMatch): string {
  return template.replace(/\$(\$|&|\d{1,2}|<([^>]*)>)/g, (all, token: string, name?: string) => {
    if (token === '$') return '$';
    if (token === '&') return match.text;
    if (name !== undefined)
      return match.named && name in match.named ? (match.named[name] ?? '') : all;
    const groups = match.groups ?? [];
    let index = Number(token);
    // `$12` with one group is `$1` then `2`.
    if (index > groups.length && token.length === 2) {
      index = Number(token[0]);
      if (index >= 1 && index <= groups.length) return (groups[index - 1] ?? '') + token[1];
      return all;
    }
    return index >= 1 && index <= groups.length ? (groups[index - 1] ?? '') : all;
  });
}

// -- Searching ----------------------------------------------------------------

interface Search {
  pattern: RegExp;
  timed: boolean;
  matches: FindMatch[];
  cache: Map<NodeKey, FindMatch[]>;
  old: Map<NodeKey, FindMatch[]>;
  max: number;
  deadline: number;
  steps: number;
  blocks: number;
  stopped: false | 'limit' | 'timeout';
}

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

/** Matches in one line of text: a block's text between line breaks and inline objects. */
function matchRun(text: string, segments: { key: NodeKey; start: number }[], s: Search): void {
  const re = s.pattern;
  re.lastIndex = 0;
  let seg = 0;
  for (let found = re.exec(text); found; found = re.exec(text)) {
    // A bad pattern backtracks for ever, or matches nothing everywhere: stop it.
    if (s.timed && (++s.steps & 63) === 0 && now() > s.deadline) {
      s.stopped = 'timeout';
      return;
    }
    const begin = found.index;
    const end = begin + found[0].length;
    if (end === begin) {
      const code = text.codePointAt(begin) ?? 0;
      re.lastIndex = begin + (code > 0xffff ? 2 : 1);
      continue;
    }
    while (seg + 1 < segments.length && (segments[seg + 1] as { start: number }).start <= begin)
      seg++;
    let last = seg;
    while (last + 1 < segments.length && (segments[last + 1] as { start: number }).start < end)
      last++;
    const first = segments[seg] as { key: NodeKey; start: number };
    const final = segments[last] as { key: NodeKey; start: number };
    const match: FindMatch = {
      start: { key: first.key, offset: begin - first.start },
      end: { key: final.key, offset: end - final.start },
      keys: segments.slice(seg, last + 1).map((segment) => segment.key),
      text: found[0],
    };
    if (found.length > 1) match.groups = found.slice(1);
    if (found.groups) match.named = { ...found.groups };
    s.matches.push(match);
    if (s.matches.length >= s.max) {
      s.stopped = 'limit';
      return;
    }
  }
}

/**
 * Search a node and everything in it: its children, in runs of text that
 * end at each block, line break and inline object (a match never crosses
 * them), then its slots (an image's caption). A block of text alone keeps
 * its matches until it changes.
 */
function $searchNode(node: LexicalNode, s: Search): void {
  if (s.stopped) return;
  const key = node.getKey();
  const cached = s.old.get(key);
  if (cached) {
    s.cache.set(key, cached);
    s.blocks++;
    for (const match of cached) s.matches.push(match);
    if (s.matches.length >= s.max) {
      s.matches.length = s.max;
      s.stopped = 'limit';
    }
    return;
  }
  const from = s.matches.length;
  let text = '';
  let segments: { key: NodeKey; start: number }[] = [];
  let leaf = true;
  const flush = () => {
    if (text && !s.stopped) matchRun(text, segments, s);
    text = '';
    segments = [];
  };
  const visit = (parent: ElementNode) => {
    for (let child = parent.getFirstChild(); child && !s.stopped; child = child.getNextSibling()) {
      if ($isTextNode(child)) {
        segments.push({ key: child.getKey(), start: text.length });
        text += child.getTextContent();
      } else if ($isElementNode(child) && child.isInline()) {
        visit(child);
      } else {
        flush();
        if ($isElementNode(child) || $isDecoratorNode(child)) {
          leaf = false;
          $searchNode(child, s);
        }
      }
    }
  };
  if ($isElementNode(node)) visit(node);
  flush();
  if ($isSlotHost(node)) {
    for (const name of $getSlotNames(node)) {
      leaf = false;
      const child = $getSlot(node, name);
      if (child) $searchNode(child, s);
    }
  }
  if ($isElementNode(node) && leaf) {
    s.blocks++;
    if (!s.stopped) s.cache.set(key, s.matches.slice(from));
  }
}

/** Whether match `m` starts at or after `point`, in document order. */
function $notBefore(m: FindMatch, point: FindPoint & { type?: 'text' | 'element' }): boolean {
  const selection = $createRangeSelection();
  selection.anchor.set(point.key, point.offset, point.type ?? 'text');
  selection.focus.set(m.start.key, m.start.offset, 'text');
  try {
    return !selection.isBackward();
  } catch {
    return true;
  }
}

/** The first match at or after `point`, wrapping to the first. */
function $firstFrom(matches: readonly FindMatch[], point: Parameters<typeof $notBefore>[1] | null) {
  if (matches.length === 0) return -1;
  if (!point || !$getNodeByKey(point.key)) return 0;
  let lo = 0;
  let hi = matches.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ($notBefore(matches[mid] as FindMatch, point)) hi = mid;
    else lo = mid + 1;
  }
  return lo === matches.length ? 0 : lo;
}

/**
 * Search the document and settle the current match. `fresh`: the query or
 * options changed, so start over from the origin; otherwise the document
 * changed, and the current match stays the one it was (or the nearest).
 */
function $search(storage: FindReplaceStorage, config: FindReplaceConfig, fresh: boolean): void {
  const engine = engineOf(storage);
  const query = storage.query.peek();
  const { regex: regexMode } = storage.options.peek();
  const pattern = storage.open.peek() ? findPattern(query, storage.options.peek()) : null;
  const risky = pattern instanceof RegExp && regexMode && isRiskyPattern(query);
  if (pattern === null || pattern === 'invalid' || risky) {
    engine.cache.clear();
    batch(() => {
      storage.matches.value = [];
      storage.current.value = -1;
      storage.limited.value = false;
      storage.error.value = risky ? 'timeout' : pattern === 'invalid' ? 'invalid' : null;
    });
    return;
  }
  const s: Search = {
    pattern,
    timed: regexMode,
    matches: [],
    cache: new Map(),
    old: fresh ? new Map() : engine.cache,
    max: Math.max(1, config.maxMatches),
    deadline: now() + config.timeout,
    steps: 0,
    blocks: 0,
    stopped: false,
  };
  $searchNode($getRoot(), s);
  engine.cache = s.stopped === 'timeout' ? new Map() : s.cache;
  engine.blocks = s.blocks;
  const previous = storage.matches.peek()[storage.current.peek()];
  let current: number;
  if (fresh) current = $firstFrom(s.matches, engine.origin);
  else if (engine.after) {
    current = $firstFrom(s.matches, engine.after);
    engine.after = null;
    engine.reveal = true;
  } else if (previous && s.matches.includes(previous)) current = s.matches.indexOf(previous);
  else current = $firstFrom(s.matches, previous?.start ?? engine.origin);
  batch(() => {
    storage.matches.value = s.matches;
    storage.current.value = current;
    storage.limited.value = s.stopped === 'limit';
    storage.error.value = s.stopped === 'timeout' ? 'timeout' : null;
  });
}

// -- Replacing ----------------------------------------------------------------

/** The text nodes of a match, if it is still there as found. */
function $nodesOf(match: FindMatch) {
  const nodes = match.keys.map((key) => $getNodeByKey(key));
  if (!nodes.every((node) => $isTextNode(node) && node.isAttached())) return null;
  const texts = nodes.map((node) => (node as LexicalNode).getTextContent());
  const last = texts.length - 1;
  const found =
    last === 0
      ? (texts[0] as string).slice(match.start.offset, match.end.offset)
      : (texts[0] as string).slice(match.start.offset) +
        texts.slice(1, last).join('') +
        (texts[last] as string).slice(0, match.end.offset);
  return found === match.text ? (nodes as TextNode[]) : null;
}

/**
 * Put `text` where the match is. It takes the first text node's
 * formatting: the rest of the match is cut from the nodes after it.
 */
function $replaceMatch(match: FindMatch, text: string): boolean {
  const nodes = $nodesOf(match);
  if (!nodes) return false;
  const [first, ...rest] = nodes;
  if (!first) return false;
  const last = rest.pop();
  if (!last) {
    first.spliceText(match.start.offset, match.end.offset - match.start.offset, text);
    return true;
  }
  first.spliceText(match.start.offset, first.getTextContentSize() - match.start.offset, text);
  for (const node of [...rest, ...(last.getTextContentSize() === match.end.offset ? [last] : [])]) {
    const parent = node.getParent();
    node.remove();
    // A link (or other inline element) left empty goes too.
    if ($isElementNode(parent) && parent.isInline() && parent.isEmpty()) parent.remove();
  }
  if (last.isAttached()) last.spliceText(0, match.end.offset, '');
  return true;
}

/** A selection left pointing past the end of its text (it was replaced) moves to `to`. */
function $keepSelectionValid(to: FindPoint): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  const valid = (point: PointType) => {
    const node = point.getNode();
    return (
      node.isAttached() &&
      point.offset <=
        ($isTextNode(node)
          ? node.getTextContentSize()
          : $isElementNode(node)
            ? node.getChildrenSize()
            : 1)
    );
  };
  let ok = false;
  try {
    ok = valid(selection.anchor) && valid(selection.focus);
  } catch {}
  if (ok) return;
  const node = $getNodeByKey(to.key);
  if ($isTextNode(node)) {
    const offset = Math.min(to.offset, node.getTextContentSize());
    selection.anchor.set(to.key, offset, 'text');
    selection.focus.set(to.key, offset, 'text');
  } else $setSelection(null);
}

/** Replacing must not move focus out of the find bar, or scroll to the caret. */
function $quietEdit(): void {
  $addUpdateTag(SKIP_DOM_SELECTION_TAG);
  $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
  $addUpdateTag(HISTORY_PUSH_TAG);
}

// -- Highlights ---------------------------------------------------------------

type HighlightLike = {
  add(range: Range): unknown;
  delete(range: Range): unknown;
  priority: number;
};

/** A named highlight, shared by every editor on the page; `null` where there is no API. */
function highlightNamed(name: string): HighlightLike | null {
  const registry = (globalThis as { CSS?: { highlights?: Map<string, HighlightLike> } }).CSS
    ?.highlights;
  const Highlight = (globalThis as { Highlight?: new () => HighlightLike }).Highlight;
  if (!registry || !Highlight) return null;
  let highlight = registry.get(name);
  if (!highlight) {
    highlight = new Highlight();
    registry.set(name, highlight);
  }
  return highlight;
}

/** The DOM text and offset for a point, if it is rendered. */
function domPoint(lexical: LexicalEditor, point: FindPoint): [Text, number] | null {
  const text = getDOMTextNode(lexical.getElementByKey(point.key));
  return text ? [text, Math.min(point.offset, text.length)] : null;
}

/**
 * Paints the matches with the CSS Custom Highlight API: nothing in the
 * document changes, so nothing can be saved or undone. Ranges are kept for
 * matches that did not change.
 */
function painter(lexical: LexicalEditor, config: FindReplaceConfig) {
  let ranges = new Map<FindMatch, Range>();
  let current: Range | null = null;
  const clear = () => paint([], -1);
  const paint = (matches: readonly FindMatch[], index: number) => {
    if (matches.length === 0 && ranges.size === 0 && !current) return;
    const all = highlightNamed(config.highlight);
    const now = highlightNamed(config.currentHighlight);
    if (!all || !now) return;
    const next = new Map<FindMatch, Range>();
    const doc = lexical.getRootElement()?.ownerDocument;
    for (const match of matches) {
      let range = ranges.get(match);
      if (!range?.startContainer.isConnected) {
        range = undefined;
        const start = doc && domPoint(lexical, match.start);
        const end = doc && domPoint(lexical, match.end);
        if (doc && start && end) {
          range = doc.createRange();
          try {
            range.setStart(...start);
            range.setEnd(...end);
          } catch {
            range = undefined;
          }
        }
      }
      if (range) next.set(match, range);
    }
    for (const [match, range] of ranges) if (next.get(match) !== range) all.delete(range);
    for (const [match, range] of next) if (ranges.get(match) !== range) all.add(range);
    ranges = next;
    if (current) now.delete(current);
    const match = matches[index];
    current = (match && next.get(match)) ?? null;
    now.priority = 1;
    if (current) now.add(current);
  };
  return { paint, clear };
}

/**
 * Show the current match: open what hides it (a closed section, through
 * the `beforematch` event the browser's own find in page fires on
 * `hidden="until-found"`), then scroll it into view without taking focus.
 */
function reveal(lexical: LexicalEditor, match: FindMatch): void {
  const root = lexical.getRootElement();
  const element = lexical.getElementByKey(match.start.key);
  if (!root || !element) return;
  let opened = false;
  for (let el = element.parentElement; el && el !== root; el = el.parentElement) {
    if (el.getAttribute('hidden') === 'until-found') {
      el.dispatchEvent(new Event('beforematch', { bubbles: false }));
      opened = true;
    }
  }
  // Commit what that opened, now, without moving the selection (and focus) into the document.
  if (opened) lexical.update(() => $addUpdateTag(SKIP_DOM_SELECTION_TAG), { discrete: true });
  (lexical.getElementByKey(match.start.key) ?? element).scrollIntoView?.({
    block: 'nearest',
    inline: 'nearest',
  });
}

// -- The extension ------------------------------------------------------------

const storageOf = (editor: TeiEditor) =>
  editor.extension(FindReplace)?.output.storage as FindReplaceStorage | undefined;

/** Open the bar: the selection's text, when short and on one line, becomes the query. */
function $open(storage: FindReplaceStorage, config: FindReplaceConfig, mode: FindMode): boolean {
  if (!hasUi(storage.ui)) return false;
  const engine = engineOf(storage);
  const selection = $getSelection();
  let query = storage.query.peek();
  engine.origin = null;
  if ($isRangeSelection(selection)) {
    const [start] = selection.isBackward()
      ? [selection.focus, selection.anchor]
      : [selection.anchor, selection.focus];
    engine.origin = { key: start.key, offset: start.offset, type: start.type };
    const text = selection.getTextContent();
    if (text && text.length <= 200 && !/[\n\r]/.test(text)) {
      query = storage.options.peek().regex ? escapeRegExp(text) : text;
    }
  }
  batch(() => {
    const was = storage.open.peek();
    storage.open.value = mode === 'replace' || was === 'replace' ? 'replace' : 'find';
    storage.query.value = query;
    engine.reveal = true;
    $search(storage, config, true);
  });
  requestUi(storage.ui);
  return true;
}

/** Step to the next match (or the previous), wrapping. */
function step(lexical: LexicalEditor, storage: FindReplaceStorage, by: 1 | -1): boolean {
  const matches = storage.matches.peek();
  const count = matches.length;
  if (count === 0) return false;
  const current = storage.current.peek();
  const next = current < 0 ? (by > 0 ? 0 : count - 1) : (current + by + count) % count;
  const match = matches[next] as FindMatch;
  if (next === current) queueMicrotask(() => reveal(lexical, match));
  else {
    engineOf(storage).reveal = true;
    storage.current.value = next;
  }
  return true;
}

/**
 * Find and replace: across formatting (`he**llo**` is found as `hello`),
 * never across blocks; match case, whole words and regular expressions
 * (`$1` in the replacement), in tables, callouts, closed sections (opened
 * to show a match) and captions. Matches are painted with the CSS Custom
 * Highlight API, so the document never changes until you replace. Headless:
 * its state is in signals for any UI; `<FindReplaceBar>` is the built-in one.
 * ⌘F finds, ⌘⌥F replaces, ⌘G and ⇧⌘G step through matches.
 */
export const FindReplace = defineTeiExtension({
  name: '@teispace/teieditor/find-replace',
  config: {
    maxMatches: 10_000,
    timeout: 250,
    largeDocument: 2_000,
    debounce: 150,
    highlight: 'tei-find',
    currentHighlight: 'tei-find-current',
  } as FindReplaceConfig,
  storage: (): FindReplaceStorage => {
    const storage: FindReplaceStorage = {
      open: signal<FindMode | false>(false),
      query: signal(''),
      replacement: signal(''),
      options: signal(DEFAULT_OPTIONS),
      matches: signal<readonly FindMatch[]>([]),
      current: signal(-1),
      error: signal<FindError | null>(null),
      limited: signal(false),
      ui: uiRequest(),
    };
    engines.set(storage, {
      cache: new Map(),
      blocks: 0,
      origin: null,
      after: null,
      timer: undefined,
      reveal: false,
    });
    return storage;
  },
  register: ({ lexical, storage, options }) => {
    const engine = engineOf(storage);
    const { paint, clear } = painter(lexical, options);
    const run = (fresh: boolean) =>
      lexical.getEditorState().read(() => $search(storage, options, fresh), { editor: lexical });
    return mergeRegister(
      effect(() => {
        const matches = storage.matches.value;
        const current = storage.current.value;
        if (!storage.open.value) {
          clear();
          return;
        }
        paint(matches, current);
        const match = matches[current];
        if (engine.reveal && match) {
          engine.reveal = false;
          // After the update that moved it has finished.
          queueMicrotask(() => {
            if (storage.matches.peek()[storage.current.peek()] === match) reveal(lexical, match);
          });
        }
      }),
      // Closed: forget the matches.
      effect(() => {
        if (storage.open.value) return;
        clearTimeout(engine.timer);
        engine.cache.clear();
        storage.matches.value = [];
        storage.current.value = -1;
      }),
      lexical.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if (!storage.open.peek() || !storage.query.peek()) return;
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        for (const key of dirtyElements.keys()) engine.cache.delete(key);
        clearTimeout(engine.timer);
        // Large documents wait for a pause in typing; a replace never waits.
        if (engine.after || engine.blocks <= options.largeDocument) run(false);
        else engine.timer = setTimeout(() => run(false), options.debounce);
      }),
      lexical.registerRootListener(() => {
        clear();
        paint(storage.matches.peek(), storage.current.peek());
      }),
      () => {
        clearTimeout(engine.timer);
        clear();
      },
    );
  },
  commands: {
    openFind: {
      run: ({ storage, options }) => $open(storage, options, 'find'),
      can: ({ storage }) => hasUi(storage.ui),
    },
    openReplace: {
      run: ({ storage, options, editor }) =>
        editor.isEditable ? $open(storage, options, 'replace') : $open(storage, options, 'find'),
      can: ({ storage }) => hasUi(storage.ui),
    },
    closeFind: {
      run: ({ storage }) => {
        if (!storage.open.peek()) return false;
        const match = storage.matches.peek()[storage.current.peek()];
        if (match && $nodesOf(match)) {
          const selection = $createRangeSelection();
          selection.anchor.set(match.start.key, match.start.offset, 'text');
          selection.focus.set(match.end.key, match.end.offset, 'text');
          $setSelection(selection);
        } else {
          // Put the selection back in the page: the field had it.
          const selection = $getSelection();
          if (selection) selection.dirty = true;
        }
        storage.open.value = false;
      },
      can: ({ storage }) => storage.open.peek() !== false,
    },
    findNext: {
      run: ({ storage, lexical }) => step(lexical, storage, 1),
      can: ({ storage }) => storage.matches.peek().length > 0,
    },
    findPrevious: {
      run: ({ storage, lexical }) => step(lexical, storage, -1),
      can: ({ storage }) => storage.matches.peek().length > 0,
    },
    setFindQuery: {
      run: ({ storage, options }, query: string) => {
        if (typeof query !== 'string') return false;
        engineOf(storage).reveal = true;
        batch(() => {
          storage.query.value = query;
          $search(storage, options, true);
        });
      },
    },
    setFindOptions: {
      run: ({ storage, options }, next: Partial<FindOptions>) => {
        engineOf(storage).reveal = true;
        batch(() => {
          storage.options.value = { ...storage.options.peek(), ...next };
          $search(storage, options, true);
        });
      },
    },
    setFindReplacement: {
      run: ({ storage }, replacement: string) => {
        if (typeof replacement !== 'string') return false;
        storage.replacement.value = replacement;
      },
    },
    replaceCurrent: {
      run: ({ storage, editor }) => {
        const match = storage.matches.peek()[storage.current.peek()];
        if (!editor.isEditable || !match) return false;
        const text = storage.options.peek().regex
          ? expandReplacement(storage.replacement.peek(), match)
          : storage.replacement.peek();
        $quietEdit();
        if (!$replaceMatch(match, text)) return false;
        const after = { key: match.start.key, offset: match.start.offset + text.length };
        $keepSelectionValid(after);
        engineOf(storage).after = after;
      },
      can: ({ storage, editor }) =>
        editor.isEditable && storage.matches.peek()[storage.current.peek()] !== undefined,
    },
    replaceAll: {
      run: ({ storage, editor }) => {
        const matches = storage.matches.peek();
        if (!editor.isEditable || matches.length === 0) return false;
        const regexMode = storage.options.peek().regex;
        const template = storage.replacement.peek();
        $quietEdit();
        let count = 0;
        let to: FindPoint | null = null;
        // Last first: replacing one leaves the offsets of those before it as they were.
        for (let i = matches.length - 1; i >= 0; i--) {
          const match = matches[i] as FindMatch;
          const text = regexMode ? expandReplacement(template, match) : template;
          if ($replaceMatch(match, text)) {
            count++;
            to ??= { key: match.start.key, offset: match.start.offset + text.length };
          }
        }
        if (to) $keepSelectionValid(to);
        if (count === 0) return false;
        editor.announce(editor.t('find.replaced', { count }));
      },
      can: ({ storage, editor }) => editor.isEditable && storage.matches.peek().length > 0,
    },
  },
  keymap: {
    find: { key: 'Mod-f', command: 'openFind', description: 'Find' },
    replace: { key: 'Mod-Alt-f', command: 'openReplace', description: 'Find and replace' },
    findNext: { key: ['Mod-g', 'F3'], command: 'findNext', description: 'Next match' },
    findPrevious: {
      key: ['Mod-Shift-g', 'Shift-F3'],
      command: 'findPrevious',
      description: 'Previous match',
    },
  },
  icons: {
    search,
    caseSensitive,
    wholeWord,
    regex,
    arrowUp,
    arrowDown,
    close,
    chevronDown,
    chevronRight,
  },
  messages: {
    'find.label': 'Find and replace',
    'find.find': 'Find',
    'find.replace': 'Replace',
    'find.replaceWith': 'Replace with',
    'find.toggleReplace': 'Toggle replace',
    'find.caseSensitive': 'Match case',
    'find.wholeWord': 'Match whole word',
    'find.regex': 'Use regular expression',
    'find.previous': 'Previous match',
    'find.next': 'Next match',
    'find.close': 'Close',
    'find.replaceOne': 'Replace',
    'find.replaceAll': 'Replace all',
    'find.count': '{current} of {total}',
    'find.none': 'No results',
    'find.invalid': 'Invalid regular expression',
    'find.timeout': 'Search stopped: the expression is too slow',
    'find.replaced': 'Replaced {count}',
  },
  items: [
    {
      id: 'find',
      label: 'find.find',
      icon: 'search',
      in: ['toolbar'],
      group: 'advanced',
      order: 90,
      shortcut: 'find',
      command: 'openFind',
    },
  ],
});

/** The find state of an editor, if FindReplace is installed. */
export const getFindStorage = storageOf;
