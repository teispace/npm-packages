import {
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  type BaseSelection,
  type ElementNode,
  type LexicalNode,
  type TextFormatType,
} from 'lexical';

/**
 * The block a node sits in: its ancestor (or itself) directly under the
 * root or a shadow root such as a table cell. For a list item that is the
 * outermost list.
 */
export function $blockOf(node: LexicalNode): ElementNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    const parent: ElementNode | null = current.getParent();
    if (parent === null) return null;
    if ($isRootOrShadowRoot(parent)) return $isElementNode(current) ? current : null;
    current = parent;
  }
  return null;
}

/** Every distinct block the selection touches, in document order. */
export function $selectedBlocks(selection: BaseSelection | null = $getSelection()): ElementNode[] {
  if (!selection) return [];
  const nodes = selection.getNodes();
  if ($isRangeSelection(selection) && nodes.length === 0) nodes.push(selection.anchor.getNode());
  const seen = new Set<string>();
  const blocks: ElementNode[] = [];
  for (const node of nodes) {
    const block = $blockOf(node);
    if (block && !seen.has(block.getKey())) {
      seen.add(block.getKey());
      blocks.push(block);
    }
  }
  return blocks;
}

/** Whether there is a selection and every block in it passes `test`. */
export function $everyBlock(test: (block: ElementNode) => boolean): boolean {
  const blocks = $selectedBlocks();
  return blocks.length > 0 && blocks.every(test);
}

/** Whether the selection (range or table) has a text format. */
export function $hasFormat(format: TextFormatType): boolean {
  const selection = $getSelection();
  if (!selection || $isNodeSelection(selection)) return false;
  return (
    'hasFormat' in selection &&
    (selection as { hasFormat(f: TextFormatType): boolean }).hasFormat(format)
  );
}

/** Whether there is a selection text commands can act on. */
export function $canFormat(): boolean {
  const selection = $getSelection();
  return selection !== null && !$isNodeSelection(selection);
}

/** Whether inline styles can go on the selection: text, and none of it in code. */
export function $canStyleText(): boolean {
  return (
    $isRangeSelection($getSelection()) && $selectedBlocks().every((b) => b.getType() !== 'code')
  );
}
