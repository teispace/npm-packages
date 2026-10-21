'use client';

import type { TeiEditor } from '../core/editor.js';
import type { VirtualElement } from './ui/floating.js';

const EMPTY = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };

/**
 * A floating anchor at the editor's text selection, for menus and popovers
 * that sit against it. The DOM range is copied when called, so the anchor
 * stays where the selection was after focus moves into the popover (and
 * the page's own selection with it), and follows the text as it scrolls.
 * `null` when the selection is not in this editor.
 */
export function selectionAnchor(editor: TeiEditor): VirtualElement | null {
  const root = editor.lexical.getRootElement();
  const selection = root?.ownerDocument.getSelection();
  if (!root || !selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  return rangeAnchor(range.cloneRange(), root);
}

/** A floating anchor at a DOM range. */
export function rangeAnchor(range: Range, context: Element): VirtualElement {
  return {
    contextElement: context,
    getBoundingClientRect() {
      const rect = range.getBoundingClientRect();
      if (rect.width || rect.height) return rect;
      // A caret on an empty line has no box; its line's element does.
      const node = range.startContainer;
      const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
      return element?.getBoundingClientRect() ?? (EMPTY as DOMRect);
    },
    getClientRects: () => range.getClientRects(),
  };
}
