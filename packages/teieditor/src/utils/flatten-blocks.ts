import { $isBlockLevel } from '@lexical/html';
import { $createLineBreakNode, $isElementNode, type LexicalNode } from 'lexical';

/**
 * Children for a block that holds only text (a quote, a heading): blocks
 * among them (`<blockquote><p>a</p><p>b</p></blockquote>`) give up their
 * text, each on its own line, as a list item's do.
 */
export function $flattenBlocks(children: readonly LexicalNode[]): LexicalNode[] {
  if (!children.some($isBlockLevel)) return [...children];
  const lines: LexicalNode[][] = [];
  let run: LexicalNode[] = [];
  const flush = () => {
    if (run.length > 0) lines.push(run);
    run = [];
  };
  for (const child of children) {
    if (!$isBlockLevel(child)) run.push(child);
    else {
      flush();
      // A block's own blocks (a list's items) each get a line too.
      const inner = $isElementNode(child) ? $flattenBlocks(child.getChildren()) : [child];
      if (inner.length > 0) lines.push(inner);
    }
  }
  flush();
  return lines.flatMap((line, i) => (i === 0 ? line : [$createLineBreakNode(), ...line]));
}

/**
 * The element a rule made, with text-only children: for rules over
 * Lexical's own (`<blockquote>`, `<h1>`).
 */
export function $flattenImported(nodes: readonly LexicalNode[]): LexicalNode[] {
  for (const node of nodes) {
    if (!$isElementNode(node) || node.isShadowRoot()) continue;
    const children = node.getChildren();
    if (!children.some($isBlockLevel)) continue;
    node.splice(0, children.length, $flattenBlocks(children));
  }
  return [...nodes];
}
