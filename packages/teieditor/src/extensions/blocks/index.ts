import {
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListItemNode,
  type ListNode,
} from '@lexical/list';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isRootNode,
  $parseSerializedNode,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type SerializedLexicalNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { $selectNode } from '../../core/slot-host.js';
import { arrowDown, arrowUp, copy, grip, plus, trash } from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';

/** Where a block goes, beside another. */
export type BlockPlace = 'before' | 'after';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Move a block (with what is nested under it) before or after another. */
    moveBlock: [key: NodeKey, target: NodeKey, place: BlockPlace];
    /** Move the block at the caret (or with `key`) up past the one before it. */
    moveBlockUp: [key?: NodeKey];
    /** Move the block at the caret (or with `key`) down past the one after it. */
    moveBlockDown: [key?: NodeKey];
    /** A copy of the block, after it. */
    duplicateBlock: [key?: NodeKey];
    /** Take the block out, the caret going to the next one. */
    deleteBlock: [key?: NodeKey];
    /**
     * A new line after the block (before it, with `place`), with the caret
     * in it; `text` starts it (`'/'` opens the slash menu).
     */
    insertBlock: [key?: NodeKey, place?: BlockPlace, text?: string];
    /** Select the block: the caret at its start, or the block itself when it holds no text. */
    selectBlock: [key: NodeKey];
  }
}

// -- What a block is ----------------------------------------------------------

/** A list item that only holds the list nested under the item before it. */
function isHolder(node: LexicalNode | null | undefined): node is ListItemNode {
  if (!$isListItemNode(node)) return false;
  const children = node.getChildren();
  return children.length === 1 && $isListNode(children[0]);
}

/** The holder of what is nested under a list item, if it has one. */
function $holderOf(node: LexicalNode): ListItemNode | null {
  const next = node.getNextSibling();
  return $isListItemNode(node) && isHolder(next) ? next : null;
}

/** The list a list item is in, at the top of the document. */
function $topList(item: ListItemNode): ListNode | null {
  let list: LexicalNode | null = item.getParent();
  while ($isListNode(list) && $isListItemNode(list.getParent())) {
    list = list.getParent()?.getParent() ?? null;
  }
  return $isListNode(list) && $isRootNode(list.getParent()) ? list : null;
}

/**
 * The block a node is in: a list item (each its own block, as in a list
 * of ideas), or a child of the document. Inside a table, the table.
 */
export function $blockOf(node: LexicalNode | null): LexicalNode | null {
  let current = node;
  while (current) {
    const parent = current.getParent();
    if (parent === null) return null;
    if ($isListItemNode(current) && !isHolder(current) && $topList(current)) return current;
    if ($isRootNode(parent)) return $isListNode(current) ? null : current;
    current = parent;
  }
  return null;
}

/** Every block, in document order (list items at any depth). */
export function $blocks(): LexicalNode[] {
  const out: LexicalNode[] = [];
  const visit = (node: LexicalNode) => {
    if ($isListNode(node)) {
      for (const item of node.getChildren()) {
        if (isHolder(item)) visit(item.getFirstChild() as ListNode);
        else out.push(item);
      }
    } else out.push(node);
  };
  for (const child of $getRoot().getChildren()) visit(child);
  return out;
}

/** The block with this key, else the one the selection is in. */
export function $getBlock(key?: NodeKey): LexicalNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return node && $blockOf(node)?.is(node) ? node : null;
  }
  const selection = $getSelection();
  if ($isRangeSelection(selection)) return $blockOf(selection.anchor.getNode());
  if ($isNodeSelection(selection)) return $blockOf(selection.getNodes()[0] ?? null);
  return null;
}

/** A block and what moves with it: the list nested under a list item. */
const $unit = (block: LexicalNode): LexicalNode[] => {
  const holder = $holderOf(block);
  return holder ? [block, holder] : [block];
};

/** Lists left empty by a move go, and the items that held them. */
function $tidy(parent: LexicalNode | null): void {
  let list = parent;
  while ($isListNode(list) && list.isEmpty()) {
    const holder = list.getParent();
    list.remove();
    if ($isListItemNode(holder) && holder.isEmpty()) {
      list = holder.getParent();
      holder.remove();
    } else list = null;
  }
}

/**
 * Put `nodes` (a block and what moves with it) before or after `target`.
 * List items join a list beside a list item, or form one of their own
 * beside any other block; any other block beside a list item splits the
 * list round it. Lists of a kind left side by side join up.
 */
function $place(nodes: LexicalNode[], target: LexicalNode, place: BlockPlace): void {
  const [first] = nodes;
  if (!first) return;
  if ($isListItemNode(target)) {
    const anchor = place === 'after' ? ($holderOf(target) ?? target) : target;
    if ($isListItemNode(first)) {
      if (place === 'before') for (const node of nodes) anchor.insertBefore(node);
      else for (const node of [...nodes].reverse()) anchor.insertAfter(node);
      return;
    }
    // Split the list at the top of the document where the target is.
    let top: LexicalNode = target;
    while (!$isRootNode(top.getParent()?.getParent())) {
      const up = top.getParent()?.getParent();
      if (!up) break;
      top = up;
    }
    const list = top.getParent() as ListNode;
    const cut = place === 'before' ? top : (($holderOf(top) ?? top).getNextSibling() ?? null);
    if (cut === null) list.insertAfter(first);
    else if (cut.is(list.getFirstChild())) list.insertBefore(first);
    else {
      // A numbered list's second half counts on from its first.
      const before = cut.getPreviousSiblings().filter((n) => !isHolder(n)).length;
      const type = list.getListType();
      const rest = $createListNode(type, type === 'number' ? list.getStart() + before : 1);
      rest.append(cut, ...cut.getNextSiblings());
      list.insertAfter(rest);
      list.insertAfter(first);
    }
    return;
  }
  if ($isListItemNode(first)) {
    const list = $createListNode((first.getParent() as ListNode).getListType());
    list.append(...nodes);
    if (place === 'before') target.insertBefore(list);
    else target.insertAfter(list);
    return;
  }
  if (place === 'before') target.insertBefore(first);
  else target.insertAfter(first);
}

/** The node in `copies` at the place `point` is in `unit`: they have the same shape. */
function $copyPath(
  unit: LexicalNode[],
  copies: LexicalNode[],
  point: { getNode(): LexicalNode },
): LexicalNode | null {
  const path: number[] = [];
  let node: LexicalNode | null = point.getNode();
  while (node && !unit.some((part) => part.is(node))) {
    path.unshift(node.getIndexWithinParent());
    node = node.getParent();
  }
  let copy: LexicalNode | null | undefined = node
    ? copies[unit.findIndex((part) => part.is(node))]
    : null;
  for (const index of path) copy = $isElementNode(copy) ? copy.getChildAtIndex(index) : null;
  return copy ?? null;
}

/** The list item a nested list hangs from. */
function $ownerOf(list: LexicalNode | null): ListItemNode | null {
  const holder = list?.getParent();
  const owner = isHolder(holder) ? holder.getPreviousSibling() : null;
  return $isListItemNode(owner) ? owner : null;
}

/** A child of the document as a block: a list stands for its first or last item. */
function $edgeBlock(node: LexicalNode | null, end: 'first' | 'last'): LexicalNode | null {
  if (!$isListNode(node)) return node;
  const item = end === 'first' ? node.getFirstChild() : node.getLastChild();
  if (!isHolder(item)) return item;
  return end === 'first' ? $edgeBlock(item.getFirstChild(), 'first') : item.getPreviousSibling();
}

/**
 * Where one step up or down takes a block: past its neighbour at the same
 * level, with what is nested under that; at either end of a nested list,
 * out of it beside the item it hangs from. The items of a list at the top
 * of the document are the neighbours of the blocks round it.
 */
function $step(block: LexicalNode, up: boolean): { target: LexicalNode; place: BlockPlace } | null {
  const place: BlockPlace = up ? 'before' : 'after';
  let neighbour: LexicalNode | null;
  if ($isListItemNode(block)) {
    let sibling = up ? block.getPreviousSibling() : ($holderOf(block) ?? block).getNextSibling();
    if (up && isHolder(sibling)) sibling = sibling.getPreviousSibling();
    if ($isListItemNode(sibling)) return { target: sibling, place };
    const list = block.getParent();
    const owner = $ownerOf(list);
    if (owner) return { target: owner, place };
    neighbour = up ? (list?.getPreviousSibling() ?? null) : (list?.getNextSibling() ?? null);
  } else {
    neighbour = up ? block.getPreviousSibling() : block.getNextSibling();
  }
  const target = $edgeBlock(neighbour, up ? 'last' : 'first');
  return target ? { target, place } : null;
}

/** Move a block before or after another, with what is nested under it. */
export function $moveBlock(block: LexicalNode, target: LexicalNode, place: BlockPlace): boolean {
  const nodes = $unit(block);
  if (nodes.some((node) => node.is(target) || ($isElementNode(node) && node.isParentOf(target)))) {
    return false;
  }
  const from = block.getParent();
  $place(nodes, target, place);
  $tidy(from);
  return true;
}

/** A node and everything in it, as JSON. */
function $exportDeep(node: LexicalNode): SerializedLexicalNode {
  const json = node.exportJSON();
  if ($isElementNode(node)) {
    (json as SerializedElementNode).children = node.getChildren().map($exportDeep);
  }
  return json;
}

/** The caret at a block's start, or the block selected when it holds no text. */
function $selectBlock(block: LexicalNode): void {
  if ($isDecoratorNode(block)) $selectNode(block);
  else if ($isElementNode(block)) block.selectStart();
}

/** The block after a block's unit, in document order, if any. */
function $nextBlock(block: LexicalNode): LexicalNode | null {
  const blocks = $blocks();
  const unit = $unit(block);
  const inside = (node: LexicalNode) =>
    unit.some((u) => u.is(node) || ($isElementNode(u) && u.isParentOf(node)));
  const at = blocks.findIndex((b) => b.is(block));
  return blocks.slice(at + 1).find((b) => !inside(b)) ?? null;
}

function $previousBlock(block: LexicalNode): LexicalNode | null {
  const blocks = $blocks();
  const at = blocks.findIndex((b) => b.is(block));
  return at > 0 ? (blocks[at - 1] ?? null) : null;
}

/**
 * Blocks as things you can move: up and down from the keyboard, by key from
 * a drag, duplicated, deleted, and a new line beside any of them. In React,
 * `<Editor>` adds the handle beside each block (drag it, or click it for
 * the block's menu) and its + button.
 */
export const Blocks = defineTeiExtension({
  name: '@teispace/teieditor/blocks',
  dependencies: [RichText],
  commands: {
    moveBlock: {
      run: (_ctx, key: NodeKey, target: NodeKey, place: BlockPlace) => {
        const block = $getBlock(key);
        const to = $getBlock(target);
        if (!block || !to || (place !== 'before' && place !== 'after')) return false;
        return $moveBlock(block, to, place);
      },
      can: (_ctx, key?: NodeKey, target?: NodeKey) =>
        key === undefined ||
        ($getBlock(key) !== null && (target === undefined || $getBlock(target) !== null)),
    },
    moveBlockUp: {
      run: (_ctx, key?: NodeKey) => {
        const block = $getBlock(key);
        const to = block && $step(block, true);
        return Boolean(block && to && $moveBlock(block, to.target, to.place));
      },
      can: (_ctx, key?: NodeKey) => {
        const block = $getBlock(key);
        return Boolean(block && $step(block, true));
      },
    },
    moveBlockDown: {
      run: (_ctx, key?: NodeKey) => {
        const block = $getBlock(key);
        const to = block && $step(block, false);
        return Boolean(block && to && $moveBlock(block, to.target, to.place));
      },
      can: (_ctx, key?: NodeKey) => {
        const block = $getBlock(key);
        return Boolean(block && $step(block, false));
      },
    },
    duplicateBlock: {
      run: (_ctx, key?: NodeKey) => {
        const block = $getBlock(key);
        if (!block) return false;
        const unit = $unit(block);
        const copies = unit.map((node) => $parseSerializedNode($exportDeep(node)));
        let at = unit.at(-1) as LexicalNode;
        for (const copy of copies) {
          at.insertAfter(copy);
          at = copy;
        }
        // A selection in the block goes to the same place in the copy; else the copy is selected.
        const selection = $getSelection();
        const anchor = $isRangeSelection(selection) && $copyPath(unit, copies, selection.anchor);
        const focus = $isRangeSelection(selection) && $copyPath(unit, copies, selection.focus);
        if ($isRangeSelection(selection) && anchor && focus) {
          selection.anchor.set(anchor.getKey(), selection.anchor.offset, selection.anchor.type);
          selection.focus.set(focus.getKey(), selection.focus.offset, selection.focus.type);
        } else if (copies[0]) $selectBlock(copies[0]);
      },
      can: (_ctx, key?: NodeKey) => $getBlock(key) !== null,
    },
    deleteBlock: {
      run: (_ctx, key?: NodeKey) => {
        const block = $getBlock(key);
        if (!block) return false;
        const next = $nextBlock(block) ?? $previousBlock(block);
        const from = block.getParent();
        for (const node of $unit(block)) node.remove(true);
        $tidy(from);
        const root = $getRoot();
        if (root.isEmpty()) root.append($createParagraphNode()).selectStart();
        else if (next?.isAttached()) $selectBlock(next);
      },
      can: (_ctx, key?: NodeKey) => $getBlock(key) !== null,
    },
    insertBlock: {
      run: (_ctx, key?: NodeKey, place: BlockPlace = 'after', text?: string) => {
        const block = $getBlock(key);
        if (!block) return false;
        const line = $createParagraphNode();
        $place([line], block, place === 'before' ? 'before' : 'after');
        line.selectStart();
        if (typeof text === 'string' && text) $getSelection()?.insertText(text);
      },
      can: (_ctx, key?: NodeKey) => $getBlock(key) !== null,
    },
    selectBlock: {
      run: (_ctx, key: NodeKey) => {
        const block = $getBlock(key);
        if (!block) return false;
        $selectBlock(block);
      },
      can: (_ctx, key?: NodeKey) => key === undefined || $getBlock(key) !== null,
    },
  },
  keymap: {
    moveBlockUp: { key: 'Mod-Shift-ArrowUp', command: 'moveBlockUp', description: 'Move block up' },
    moveBlockDown: {
      key: 'Mod-Shift-ArrowDown',
      command: 'moveBlockDown',
      description: 'Move block down',
    },
    duplicateBlock: { key: 'Mod-d', command: 'duplicateBlock', description: 'Duplicate block' },
  },
  icons: { grip, plus, copy, arrowUp, arrowDown, trash },
  messages: {
    'block.handle': 'Drag to move, click for options',
    'block.add': 'Add a block below ({alt}-click: above)',
    'block.menu': 'Block',
    'block.turnInto': 'Turn into',
    'block.duplicate': 'Duplicate',
    'block.moveUp': 'Move up',
    'block.moveDown': 'Move down',
    'block.delete': 'Delete',
    'block.moved': 'Block moved',
  },
  items: [
    {
      id: 'duplicateBlock',
      label: 'block.duplicate',
      icon: 'copy',
      in: ['blockMenu'],
      group: 'block',
      order: 0,
      shortcut: 'duplicateBlock',
      command: 'duplicateBlock',
    },
    {
      id: 'moveBlockUp',
      label: 'block.moveUp',
      icon: 'arrowUp',
      in: ['blockMenu'],
      group: 'block',
      order: 1,
      shortcut: 'moveBlockUp',
      command: 'moveBlockUp',
    },
    {
      id: 'moveBlockDown',
      label: 'block.moveDown',
      icon: 'arrowDown',
      in: ['blockMenu'],
      group: 'block',
      order: 2,
      shortcut: 'moveBlockDown',
      command: 'moveBlockDown',
    },
    {
      id: 'deleteBlock',
      label: 'block.delete',
      icon: 'trash',
      in: ['blockMenu'],
      group: 'delete',
      order: 0,
      command: 'deleteBlock',
    },
  ],
});
