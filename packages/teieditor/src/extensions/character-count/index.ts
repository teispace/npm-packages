import { effect, type ReadonlySignal, type Signal, signal } from '@lexical/extension';
import {
  $createOverflowNode,
  $isOverflowNode,
  OverflowExtension,
  type OverflowNode,
} from '@lexical/overflow';
import { $dfsWithSlots, $unwrapNode } from '@lexical/utils';
import {
  $createRangeSelection,
  $findMatchingParent,
  $getNodeByKey,
  $getPreviousSelection,
  $getRoot,
  $getSelection,
  $getSlotHost,
  $hasUpdateTag,
  $isElementNode,
  $isLeafNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_LOW,
  DELETE_CHARACTER_COMMAND,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
  type RangeSelection,
  RootNode,
  type TextNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';

/** What the document (or the selection) holds. */
export interface CharacterStats {
  /** Characters as people see them (graphemes: 👍🏽 is one), paragraph breaks not counted. */
  characters: number;
  /** The same, without spaces. */
  charactersNoSpaces: number;
  words: number;
  /** Blocks with text in them; each list item counts. */
  paragraphs: number;
  /** Minutes to read, rounded up, at `wordsPerMinute`. */
  readingMinutes: number;
}

export type CountMode = 'characters' | 'words';

export interface CharacterCountOptions {
  /** The most the document may hold, in `mode` units; `null` for no limit. */
  limit: number | null;
  /** What `limit` counts. Default `characters`. */
  mode: CountMode;
  /**
   * Stop typing and pasting past the limit (pasted text is cut to fit).
   * With `false`, anything goes in and what is over is marked. Content set
   * from code is never cut, only marked. Default true.
   */
  enforce: boolean;
  /** Count a non-collapsed selection too, into `storage.selection`. Default false. */
  countSelection: boolean;
  /** For `readingMinutes`. Default 230. */
  wordsPerMinute: number;
  /** The language words are split by; default the runtime's. */
  locale: string | undefined;
}

export interface CharacterCountStorage {
  /** The whole document's counts. */
  readonly stats: ReadonlySignal<CharacterStats>;
  /** The selection's counts while one is made (with `countSelection`), else `null`. */
  readonly selection: ReadonlySignal<CharacterStats | null>;
  /** Count now what is waiting for an idle moment (big changes are counted then). */
  flush(): void;
}

type Counts = Omit<CharacterStats, 'readingMinutes'>;

const ZERO: Counts = { characters: 0, charactersNoSpaces: 0, words: 0, paragraphs: 0 };

interface Segmenters {
  graphemes: Intl.Segmenter;
  words: Intl.Segmenter;
}

const segmenterCache = new Map<string, Segmenters | null>();

/** Segmenters for a language, made once; `null` where `Intl.Segmenter` is missing. */
function segmenters(locale: string | undefined): Segmenters | null {
  const id = locale ?? '';
  let found = segmenterCache.get(id);
  if (found === undefined) {
    found =
      typeof Intl.Segmenter === 'function'
        ? {
            graphemes: new Intl.Segmenter(locale, { granularity: 'grapheme' }),
            words: new Intl.Segmenter(locale, { granularity: 'word' }),
          }
        : null;
    segmenterCache.set(id, found);
  }
  return found;
}

// Without Intl.Segmenter: marks, joiners and skin tones join what they follow.
const JOINERS = /\p{M}|\u200d|\ufe0f|[\u{1f3fb}-\u{1f3ff}]/gu;
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’.-][\p{L}\p{N}\p{M}]+)*/gu;
const ASCII = /^[\x20-\x7e\n\t]*$/;
const NEWLINE = /^[\r\n]+$/;
const SPACE = /^\s+$/;

/** The graphemes of `text` with where each starts, newlines included. */
export function graphemes(text: string, locale?: string): { segment: string; index: number }[] {
  const seg = segmenters(locale);
  if (seg)
    return Array.from(seg.graphemes.segment(text), ({ segment, index }) => ({ segment, index }));
  const out: { segment: string; index: number }[] = [];
  let index = 0;
  for (const char of text) {
    const last = out.at(-1);
    if (last && char.replace(JOINERS, '') === '') last.segment += char;
    else out.push({ segment: char, index });
    index += char.length;
  }
  return out;
}

/** Where each word of `text` starts. */
function wordStarts(text: string, locale?: string): number[] {
  const seg = segmenters(locale);
  if (seg) {
    const starts: number[] = [];
    for (const { index, isWordLike } of seg.words.segment(text)) if (isWordLike) starts.push(index);
    return starts;
  }
  return Array.from(text.matchAll(WORD), (m) => m.index ?? 0);
}

/** Count a piece of text: characters, words and paragraphs (separated by a blank line). */
export function countText(text: string, locale?: string): Counts {
  let characters = 0;
  let charactersNoSpaces = 0;
  if (ASCII.test(text)) {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 10) continue;
      characters++;
      if (code !== 32 && code !== 9) charactersNoSpaces++;
    }
  } else {
    for (const { segment } of graphemes(text, locale)) {
      if (NEWLINE.test(segment)) continue;
      characters++;
      if (!SPACE.test(segment)) charactersNoSpaces++;
    }
  }
  let paragraphs = 0;
  for (const part of text.split('\n\n')) if (part.trim()) paragraphs++;
  return { characters, charactersNoSpaces, words: wordStarts(text, locale).length, paragraphs };
}

const withMinutes = (counts: Counts, wordsPerMinute: number): CharacterStats => ({
  ...counts,
  readingMinutes: counts.words ? Math.ceil(counts.words / Math.max(1, wordsPerMinute)) : 0,
});

const add = (a: Counts, b: Counts, sign: 1 | -1): Counts => ({
  characters: a.characters + sign * b.characters,
  charactersNoSpaces: a.charactersNoSpaces + sign * b.charactersNoSpaces,
  words: a.words + sign * b.words,
  paragraphs: a.paragraphs + sign * b.paragraphs,
});

const unitOf = (mode: CountMode): 'characters' | 'words' =>
  mode === 'words' ? 'words' : 'characters';

/** Characters (graphemes, not newlines) or words in `text`. */
function countUnits(text: string, mode: CountMode, locale?: string): number {
  if (mode === 'words') return wordStarts(text, locale).length;
  let count = 0;
  for (const { segment } of graphemes(text, locale)) if (!NEWLINE.test(segment)) count++;
  return count;
}

/** Where the unit after the first `limit` starts in `text`, or `text.length`. */
function overflowOffset(text: string, limit: number, mode: CountMode, locale?: string): number {
  if (mode === 'words') return wordStarts(text, locale)[limit] ?? text.length;
  let count = 0;
  for (const { segment, index } of graphemes(text, locale)) {
    if (NEWLINE.test(segment)) continue;
    if (count === limit) return index;
    count++;
  }
  return text.length;
}

/** Changes to more blocks than this at once are counted when the browser is idle. */
const IDLE_THRESHOLD = 256;
/** A selection over more nodes than this is counted when idle. */
const IDLE_SELECTION_NODES = 1000;
/** The tag of the update that marks overflowing text. */
const OVERFLOW_TAG = 'tei-character-limit';

type Idle = (callback: () => void) => () => void;
const whenIdle: Idle = (callback) => {
  const win = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (win.requestIdleCallback && win.cancelIdleCallback) {
    const id = win.requestIdleCallback(callback, { timeout: 300 });
    return () => win.cancelIdleCallback?.(id);
  }
  const id = setTimeout(callback, 60);
  return () => clearTimeout(id);
};

/**
 * Word and character counts, and an optional length limit. Counts are
 * signals in `storage` (`stats`, and `selection` with `countSelection`):
 * graphemes and words by `Intl.Segmenter`, so 👍🏽 is one character and
 * Thai and Japanese split into words. Only the blocks an edit touched are
 * counted again; a change to very many at once (a paste, new content) is
 * counted when the browser is idle.
 *
 * With `limit`, typing and pasting stop at it (a paste is cut to fit,
 * never inside a character), and text over it, from content set by code
 * or with `enforce: false`, is marked with the theme's `characterLimit`
 * class. In React, `<WordCount>` shows the counts and the limit.
 */
export const CharacterCount = defineTeiExtension({
  name: '@teispace/teieditor/character-count',
  config: {
    limit: null,
    mode: 'characters',
    enforce: true,
    countSelection: false,
    wordsPerMinute: 230,
    locale: undefined,
  } as CharacterCountOptions,
  dependencies: [OverflowExtension],
  storage: ({ options }): CharacterCountStorage => ({
    stats: signal(withMinutes(ZERO, options.wordsPerMinute)),
    selection: signal<CharacterStats | null>(null),
    flush: () => {},
  }),
  messages: {
    'wordCount.label': 'Document statistics',
    'wordCount.words.one': '{count} word',
    'wordCount.words.other': '{count} words',
    'wordCount.characters.one': '{count} character',
    'wordCount.characters.other': '{count} characters',
    'wordCount.charactersNoSpaces.one': '{count} character without spaces',
    'wordCount.charactersNoSpaces.other': '{count} characters without spaces',
    'wordCount.paragraphs.one': '{count} paragraph',
    'wordCount.paragraphs.other': '{count} paragraphs',
    'wordCount.readingMinutes.one': '{count} min read',
    'wordCount.readingMinutes.other': '{count} min read',
    'wordCount.selected': '{count} selected',
    'wordCount.limit': '{count} / {limit}',
    'wordCount.limit.characters': '{count} of {limit} characters',
    'wordCount.limit.words': '{count} of {limit} words',
    'wordCount.near': '{count} left',
    'wordCount.over': 'Over the limit by {count}',
    'wordCount.reached': 'Limit reached',
  },
  register: ({ editor, lexical, storage }) => {
    const output = editor.extension(CharacterCount)?.output;
    if (!output) return;
    const options = output.options;
    const stats = storage.stats as Signal<CharacterStats>;
    const selectionStats = storage.selection as Signal<CharacterStats | null>;

    // The committed document's counts, by top-level block.
    const blocks = new Map<NodeKey, Counts>();
    let totals: Counts = ZERO;
    let pending = new Set<NodeKey>();
    let full = true;
    let selectionDue = false;
    let cancel: (() => void) | null = null;
    let wasOver = false;

    const locale = () => options.locale.peek();
    const $countNode = (node: LexicalNode) => countText(node.getTextContent(), locale());

    /** Count the blocks waiting, in the committed state. */
    const flush = () => {
      cancel?.();
      cancel = null;
      lexical.getEditorState().read(
        () => {
          const root = $getRoot();
          if (!full) {
            for (const key of pending) {
              if (key === 'root') continue;
              const node = $getNodeByKey(key);
              const old = blocks.get(key);
              const top = node?.getParent()?.getKey() === 'root';
              if (old && !top) {
                totals = add(totals, old, -1);
                blocks.delete(key);
              }
              if (node && top) {
                const next = $countNode(node);
                totals = add(add(totals, old ?? ZERO, -1), next, 1);
                blocks.set(key, next);
              }
            }
            // Anything an update did not mark (a whole new state): start again.
            if (blocks.size !== root.getChildrenSize()) full = true;
          }
          if (full) {
            blocks.clear();
            totals = ZERO;
            for (const child of root.getChildren()) {
              const counts = $countNode(child);
              blocks.set(child.getKey(), counts);
              totals = add(totals, counts, 1);
            }
          }
          if (selectionDue) {
            const selection = $getSelection();
            selectionStats.value =
              options.countSelection.peek() &&
              $isRangeSelection(selection) &&
              !selection.isCollapsed()
                ? withMinutes(
                    countText(selection.getTextContent(), locale()),
                    options.wordsPerMinute.peek(),
                  )
                : null;
          }
        },
        { editor: lexical },
      );
      pending = new Set();
      full = false;
      selectionDue = false;
      const next = withMinutes(totals, options.wordsPerMinute.peek());
      const prev = stats.peek();
      if (
        prev.characters !== next.characters ||
        prev.charactersNoSpaces !== next.charactersNoSpaces ||
        prev.words !== next.words ||
        prev.paragraphs !== next.paragraphs ||
        prev.readingMinutes !== next.readingMinutes
      )
        stats.value = next;
    };
    (storage as { flush: () => void }).flush = flush;

    // -- The limit ------------------------------------------------------------

    /**
     * Take back what went in past the limit: the last `excess` units before
     * the caret. When typing (the caret was in the same text before), never
     * further back than where it was: what was there before stays.
     */
    const $trim = (selection: RangeSelection, excess: number, mode: CountMode, typed: boolean) => {
      const anchor = selection.anchor;
      let node: TextNode | null = null;
      let end = 0;
      const at = anchor.getNode();
      if ($isTextNode(at)) {
        node = at;
        end = anchor.offset;
      } else {
        const before = $isElementNode(at) ? at.getChildAtIndex(anchor.offset - 1) : at;
        node = before ? ($lastText(before) ?? $previousText(before)) : $previousText(at);
        end = node?.getTextContentSize() ?? 0;
      }
      const previous = $getPreviousSelection();
      const floor =
        typed &&
        $isRangeSelection(previous) &&
        previous.isCollapsed() &&
        previous.anchor.key === anchor.key &&
        previous.anchor.offset <= anchor.offset &&
        anchor.type === 'text'
          ? previous.anchor.offset
          : null;
      let start: { node: TextNode; offset: number } | null = null;
      let remaining = excess;
      while (node && remaining > 0) {
        const text = node.getTextContent().slice(0, end);
        const starts =
          mode === 'words'
            ? wordStarts(text, locale())
            : graphemes(text, locale())
                .filter((g) => !NEWLINE.test(g.segment))
                .map((g) => g.index);
        for (let i = starts.length - 1; i >= 0 && remaining > 0; i--) {
          start = { node, offset: starts[i] as number };
          remaining--;
        }
        if (remaining > 0) {
          node = $previousText(node);
          end = node?.getTextContentSize() ?? 0;
        }
      }
      if (!start) return;
      if (floor !== null && (start.node.getKey() !== anchor.key || start.offset < floor)) {
        start = { node: anchor.getNode() as TextNode, offset: floor };
      }
      const range = $createRangeSelection();
      range.anchor.set(start.node.getKey(), start.offset, 'text');
      range.focus.set(anchor.key, anchor.offset, anchor.type);
      range.removeText();
      $setSelection(range);
    };

    // What a composition may grow to: the count allowed when it began.
    let ceiling: number | null = null;
    const enforceLimit = lexical.registerNodeTransform(RootNode, () => {
      const limit = options.limit.peek();
      if (limit === null || !options.enforce.peek()) {
        ceiling = null;
        return;
      }
      // Undo, redo and other people's edits are never cut.
      if ($hasUpdateTag(HISTORIC_TAG) || $hasUpdateTag(COLLABORATION_TAG)) return;
      const mode = options.mode.peek();
      if (pending.size || full) flush();
      // Content already over (set by code) may shrink, never grow.
      const allowedNow = Math.max(limit, totals[unitOf(mode)]);
      // An input method's text is left alone until it is done.
      if (lexical.isComposing()) {
        ceiling ??= allowedNow;
        return;
      }
      const composed = ceiling !== null;
      const allowed = ceiling ?? allowedNow;
      ceiling = null;
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
      // The whole text: a limited document is short, and transforms are
      // not told which blocks changed.
      const now = countUnits($getRoot().getTextContent(), mode, locale());
      if (now > allowed) $trim(selection, now - allowed, mode, !composed);
    });

    /** Mark the text past the limit, and unmark what is no longer past it. */
    const markOverflow = () => {
      const limit = options.limit.peek();
      const unit = unitOf(options.mode.peek());
      const over = limit !== null && totals[unit] > limit;
      if (!over && !wasOver) return;
      wasOver = over;
      lexical.update(
        () => {
          const text = $getRoot().getTextContent();
          $wrapOverflowedNodes(
            limit === null
              ? text.length
              : overflowOffset(text, limit, options.mode.peek(), locale()),
          );
        },
        { tag: [HISTORY_MERGE_TAG, OVERFLOW_TAG], discrete: true },
      );
    };

    const onUpdate = lexical.registerUpdateListener(({ dirtyElements, dirtyLeaves, tags }) => {
      const content = dirtyElements.size > 0 || dirtyLeaves.size > 0;
      if (options.countSelection.peek()) selectionDue = true;
      if (content) {
        // A whole new state (setEditorState) marks only the root.
        if (dirtyLeaves.size === 0 && dirtyElements.size === 1) full = true;
        for (const key of dirtyElements.keys()) pending.add(key);
        for (const key of dirtyLeaves) pending.add(key);
      }
      if (!content && !selectionDue) return;
      const big = full || pending.size > IDLE_THRESHOLD;
      const selectionBig =
        selectionDue &&
        lexical.getEditorState().read(() => {
          const selection = $getSelection();
          return (
            $isRangeSelection(selection) &&
            !selection.isCollapsed() &&
            selection.anchor.getNode().getTopLevelElement()?.getKey() !==
              selection.focus.getNode().getTopLevelElement()?.getKey() &&
            selection.getNodes().length > IDLE_SELECTION_NODES
          );
        });
      // A limit needs the count at once.
      if (options.limit.peek() !== null || (!big && !selectionBig)) {
        flush();
        if (content && !tags.has(OVERFLOW_TAG) && !lexical.isComposing()) markOverflow();
      } else cancel ??= whenIdle(flush);
    });

    // The options can change while the editor runs.
    const offOptions = effect(() => {
      options.limit.value;
      options.mode.value;
      options.locale.value;
      options.wordsPerMinute.value;
      options.countSelection.value;
      full = true;
      selectionDue = true;
      flush();
      markOverflow();
    });

    return mergeRegister(
      onUpdate,
      offOptions,
      enforceLimit,
      // Deleting into marked text: no empty block left behind (Lexical's way).
      lexical.registerCommand(
        DELETE_CHARACTER_COMMAND,
        (isBackward) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return false;
          const overflow = selection.anchor.getNode().getParent();
          if (!$isOverflowNode(overflow)) return false;
          const block = overflow.getParent();
          const after = block?.getNextSibling() ?? null;
          selection.deleteCharacter(isBackward);
          if (block?.isEmpty()) block.remove();
          else if ($isElementNode(after) && after.isEmpty()) after.remove();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      () => cancel?.(),
    );
  },
});

/** The last text node in a node, itself included. */
function $lastText(node: LexicalNode): TextNode | null {
  if ($isTextNode(node)) return node;
  if (!$isElementNode(node)) return null;
  for (let child = node.getLastChild(); child; child = child.getPreviousSibling()) {
    const found = $lastText(child);
    if (found) return found;
  }
  return null;
}

/** The text node before a node in document order. */
function $previousText(node: LexicalNode): TextNode | null {
  for (let at: LexicalNode | null = node; at; at = at.getParent()) {
    for (let prev = at.getPreviousSibling(); prev; prev = prev.getPreviousSibling()) {
      const found = $lastText(prev);
      if (found) return found;
    }
  }
  return null;
}

/** The counts signal of an editor with {@link CharacterCount}, if installed. */
export function getCharacterCount(editor: TeiEditor): CharacterCountStorage | undefined {
  return editor.extension(CharacterCount)?.output.storage as CharacterCountStorage | undefined;
}

// -- Marking overflow ---------------------------------------------------------
// After Lexical's `useCharacterLimit` (MIT), without React: everything past
// `offset` in the root's text content is wrapped in OverflowNodes, which
// draw with the theme's `characterLimit` class; what is back under is unwrapped.

/** Wrap the text past `offset` (in root text content) in OverflowNodes; unwrap what is not past it. */
export function $wrapOverflowedNodes(offset: number): void {
  const nodes = $dfsWithSlots();
  let accumulated = 0;
  for (const { node } of nodes) {
    // A block's text content ends in a blank line before the next block.
    const previousSibling = node.getPreviousSibling();
    if ($isElementNode(previousSibling) && !previousSibling.isInline()) accumulated += 2;
    const slotLeaf = $isLeafNode(node) && $getSlotHost(node) !== null;
    if ($isOverflowNode(node)) {
      const before = accumulated;
      if (accumulated + node.getTextContentSize() <= offset) {
        const parent = node.getParent();
        const prev = node.getPreviousSibling();
        const next = node.getNextSibling();
        $unwrapNode(node);
        const selection = $getSelection();
        if (
          $isRangeSelection(selection) &&
          (!selection.anchor.getNode().isAttached() || !selection.focus.getNode().isAttached())
        ) {
          if ($isTextNode(prev)) prev.select();
          else if ($isTextNode(next)) next.select();
          else parent?.select();
        }
      } else if (before < offset) {
        const first = node.getFirstDescendant();
        const firstSize = first?.getTextContentSize() ?? 0;
        if (($isTextNode(first) && first.isSimpleText()) || before + firstSize <= offset) {
          $unwrapNode(node);
        }
      }
    } else if (slotLeaf) {
      accumulated += node.getTextContentSize();
    } else if ($isLeafNode(node) && !$findMatchingParent(node, $isOverflowNode)) {
      const before = accumulated;
      accumulated += node.getTextContentSize();
      if (accumulated > offset && !$isOverflowNode(node.getParent())) {
        const selection = $getSelection();
        const overflow =
          before < offset && $isTextNode(node) && node.isSimpleText()
            ? $wrap(node.splitText(offset - before)[1] as LexicalNode)
            : $wrap(node);
        if (selection) $setSelection(selection);
        $mergePrevious(overflow);
        const next = overflow.getNextSibling();
        if ($isOverflowNode(next)) $mergePrevious(next);
      }
    }
  }
}

function $wrap(node: LexicalNode): OverflowNode {
  const overflow = $createOverflowNode();
  node.replace(overflow);
  overflow.append(node);
  return overflow;
}

function $mergePrevious(overflow: OverflowNode): void {
  const previous = overflow.getPreviousSibling();
  if (!$isOverflowNode(previous)) return;
  const first = overflow.getFirstChild();
  const moved = previous.getChildren();
  if (first === null) overflow.append(...moved);
  else for (const child of moved) first.insertBefore(child);
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    for (const point of [selection.anchor, selection.focus]) {
      const at = point.getNode();
      if (at.is(previous)) point.set(overflow.getKey(), point.offset, 'element');
      else if (at.is(overflow))
        point.set(overflow.getKey(), moved.length + point.offset, 'element');
    }
  }
  previous.remove();
}
