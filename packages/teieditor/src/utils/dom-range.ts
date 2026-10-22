import { getDOMTextNode, type LexicalEditor, type NodeKey } from 'lexical';

/** A selection end saved by key, so it can be found again after the selection moved. */
export interface SavedPoint {
  key: NodeKey;
  offset: number;
  type: 'text' | 'element';
}

function domPoint(lexical: LexicalEditor, point: SavedPoint): [Node, number] | null {
  const element = lexical.getElementByKey(point.key);
  if (!element) return null;
  if (point.type === 'text') {
    const text = getDOMTextNode(element);
    return text ? [text, Math.min(point.offset, text.length)] : null;
  }
  return [element, Math.min(point.offset, element.childNodes.length)];
}

/**
 * The DOM range between two saved points, forwards; `null` when either is
 * not rendered (or the editor has no root).
 */
export function savedPointsRange(
  lexical: LexicalEditor,
  a: SavedPoint,
  b: SavedPoint,
): Range | null {
  const doc = lexical.getRootElement()?.ownerDocument;
  const start = domPoint(lexical, a);
  const end = domPoint(lexical, b);
  if (!doc || !start || !end) return null;
  const range = doc.createRange();
  try {
    range.setStart(...start);
    range.setEnd(...end);
    if (range.collapsed && (start[0] !== end[0] || start[1] !== end[1])) {
      // `b` was before `a`: the range collapsed onto `b`. Turn it round.
      range.setStart(...end);
      range.setEnd(...start);
    }
  } catch {
    return null;
  }
  return range;
}

type HighlightLike = {
  add(range: Range): unknown;
  delete(range: Range): unknown;
  clear(): unknown;
  priority: number;
};

/**
 * A named CSS Custom Highlight, shared by every editor on the page; `null`
 * where the browser has no Highlight API (nothing is painted there).
 */
export function highlightNamed(name: string): HighlightLike | null {
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
