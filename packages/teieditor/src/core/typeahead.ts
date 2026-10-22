import {
  $getEditor,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import { $blockOf } from '../utils/selection.js';

/**
 * What opens a typeahead and what its query may hold: `/` for blocks, `:`
 * for emoji, `@` for people. The slash menu, emoji and mentions all match
 * through this, so they agree on where a trigger counts.
 */
export interface TypeaheadPattern {
  /** The character(s) that open it. */
  trigger: string;
  /**
   * Whether a character may be in the query. Default: anything but
   * whitespace and the trigger.
   */
  allow?: (char: string) => boolean;
  /** Let the query hold single spaces (not first, never two in a row). Default false. */
  spaces?: boolean;
  /** The fewest characters after the trigger. Default 0. */
  minLength?: number;
  /** The most characters after the trigger. Default 40. */
  maxLength?: number;
}

/** A trigger and its query, before the caret. */
export interface TypeaheadMatch {
  trigger: string;
  /** What follows the trigger, up to the caret. */
  query: string;
  /** The text node it is in. */
  key: NodeKey;
  /** The trigger's offset in that node. */
  offset: number;
  /** The caret's offset in that node. */
  end: number;
}

/** Same trigger, same place, same query. */
export const sameTypeahead = (a: TypeaheadMatch | null, b: TypeaheadMatch | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.key === b.key &&
    a.offset === b.offset &&
    a.end === b.end &&
    a.query === b.query &&
    a.trigger === b.trigger);

const isComposing = (): boolean => {
  try {
    return $getEditor().isComposing();
  } catch {
    return false;
  }
};

/**
 * The trigger before a collapsed caret, at the start of the text or after
 * whitespace, with a query that fits the pattern. `null` while an IME is
 * composing (the text is not final), in code, and in token text (a mention).
 */
export function $matchTypeahead(pattern: TypeaheadPattern): TypeaheadMatch | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || isComposing()) return null;
  const node = selection.anchor.getNode();
  if (!$isTextNode(node) || !node.isSimpleText() || node.hasFormat('code')) return null;
  if ($blockOf(node)?.getType() === 'code') return null;
  const { trigger, spaces = false, minLength = 0, maxLength = 40 } = pattern;
  const allow = pattern.allow ?? ((char: string) => !/\s/.test(char) && !trigger.includes(char));
  const end = selection.anchor.offset;
  const before = node.getTextContent().slice(0, end);
  const floor = Math.max(0, before.length - trigger.length - maxLength);
  for (let at = before.length - trigger.length; at >= floor; at--) {
    if (before.startsWith(trigger, at)) {
      if (at > 0 && !/\s/.test(before[at - 1] as string)) return null;
      const query = before.slice(at + trigger.length);
      if (query.length < minLength || query.startsWith(' ')) return null;
      return { trigger, query, key: node.getKey(), offset: at, end };
    }
    const char = before[at + trigger.length - 1] as string;
    if (char === ' ' && spaces) {
      // Two in a row is prose, not a search.
      if (before[at + trigger.length - 2] === ' ') return null;
      continue;
    }
    if (!allow(char)) return null;
  }
  return null;
}

/** The match nearest the caret among several patterns, with the pattern's index. */
export function $matchAnyTypeahead(
  patterns: readonly TypeaheadPattern[],
): [index: number, match: TypeaheadMatch] | null {
  let best: [number, TypeaheadMatch] | null = null;
  patterns.forEach((pattern, index) => {
    const match = $matchTypeahead(pattern);
    if (match && (!best || match.offset > best[1].offset)) best = [index, match];
  });
  return best;
}

/**
 * Take out the trigger and its query (up to the caret, which may have
 * moved on since the match), and put `replacement` in their place: text,
 * or nodes, with the caret after them. `false` when the trigger is gone.
 */
export function $replaceTypeahead(
  match: TypeaheadMatch,
  replacement: string | readonly LexicalNode[],
): boolean {
  const node = $getNodeByKey(match.key);
  if (!$isTextNode(node)) return false;
  const text = node.getTextContent();
  if (!text.startsWith(match.trigger, match.offset)) return false;
  const selection = $getSelection();
  const caret =
    $isRangeSelection(selection) && selection.anchor.key === match.key
      ? selection.anchor.offset
      : match.end;
  const end = Math.min(Math.max(caret, match.offset + match.trigger.length), text.length);
  if (typeof replacement === 'string') {
    node.spliceText(match.offset, end - match.offset, replacement, true);
    return true;
  }
  const parts = node.splitText(match.offset, end);
  const matched = match.offset === 0 ? parts[0] : parts[1];
  if (!matched) return false;
  const [first, ...rest] = replacement;
  if (!first) {
    const after = matched.getNextSibling();
    const previous = matched.getPreviousSibling();
    matched.remove();
    if ($isTextNode(previous)) previous.select();
    else if ($isTextNode(after)) after.select(0, 0);
    return true;
  }
  matched.replace(first);
  let last = first;
  for (const next of rest) {
    last.insertAfter(next);
    last = next;
  }
  if ($isTextNode(last) && last.isSimpleText()) last.select();
  else last.selectNext(0, 0);
  return true;
}

/**
 * The trigger as a DOM range, for placing a list against it: it stays put
 * as the query grows. `null` when it is not rendered.
 */
export function typeaheadRange(lexical: LexicalEditor, match: TypeaheadMatch): Range | null {
  const element = lexical.getElementByKey(match.key);
  const text = element && firstText(element);
  if (!element || !text) return null;
  const range = element.ownerDocument.createRange();
  const offset = Math.min(match.offset, text.length);
  range.setStart(text, offset);
  range.setEnd(text, Math.min(offset + match.trigger.length, text.length));
  return range;
}

function firstText(node: Node): Text | null {
  if (node.nodeType === 3) return node as Text;
  for (const child of Array.from(node.childNodes)) {
    const text = firstText(child);
    if (text) return text;
  }
  return null;
}
