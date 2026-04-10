'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $copyNode,
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COPY_COMMAND,
  CUT_COMMAND,
  PASTE_COMMAND,
} from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCopy, IconTrash } from '../../ui/icons';

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * General right-click context menu for the editor.
 * Shows block actions: copy, cut, paste, delete block.
 */
export function ContextMenu() {
  const [editor] = useLexicalComposerContext();
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const [targetNodeKey, setTargetNodeKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleContextMenu = (e: MouseEvent) => {
      // Don't intercept if target is inside a table (table menu handles that)
      if ((e.target as HTMLElement).closest('td, th')) return;

      e.preventDefault();

      // Find the nearest block node
      editor.getEditorState().read(() => {
        const node = $getNearestNodeFromDOMNode(e.target as HTMLElement);
        if (node) {
          setTargetNodeKey(node.getKey());
        }
      });

      setPosition({ top: e.clientY, left: e.clientX });
      setVisible(true);
    };

    root.addEventListener('contextmenu', handleContextMenu);
    return () => root.removeEventListener('contextmenu', handleContextMenu);
  }, [editor]);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible]);

  const handleCopy = useCallback(() => {
    editor.dispatchCommand(COPY_COMMAND, null as any);
    setVisible(false);
  }, [editor]);

  const handleCut = useCallback(() => {
    editor.dispatchCommand(CUT_COMMAND, null as any);
    setVisible(false);
  }, [editor]);

  const handlePaste = useCallback(() => {
    editor.dispatchCommand(PASTE_COMMAND, null as any);
    setVisible(false);
  }, [editor]);

  const handleDeleteBlock = useCallback(() => {
    if (!targetNodeKey) return;
    editor.update(() => {
      const node = $getNodeByKey(targetNodeKey);
      if (node) {
        const parent = node.getParent();
        node.remove();
        // If parent is now empty, add a paragraph
        if (parent && parent.getChildrenSize() === 0) {
          parent.append($createParagraphNode());
        }
      }
    });
    setVisible(false);
  }, [editor, targetNodeKey]);

  const handleDuplicate = useCallback(() => {
    if (!targetNodeKey) return;
    editor.update(() => {
      const node = $getNodeByKey(targetNodeKey);
      if (node) {
        const clone = $copyNode(node);
        node.insertAfter(clone);
      }
    });
    setVisible(false);
  }, [editor, targetNodeKey]);

  if (!visible || typeof window === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      className="tei-context-menu fixed z-50 min-w-[160px] rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] p-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        onClick={handleCopy}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent))]"
      >
        <IconCopy size={14} />
        Copy
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handleCut}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent))]"
      >
        <IconCopy size={14} />
        Cut
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handlePaste}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent))]"
      >
        <IconCopy size={14} />
        Paste
      </button>
      <div className="my-1 h-px bg-[hsl(var(--tei-border))]" />
      <button
        type="button"
        role="menuitem"
        onClick={handleDuplicate}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent))]"
      >
        <IconCopy size={14} />
        Duplicate block
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handleDeleteBlock}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        <IconTrash size={14} />
        Delete block
      </button>
    </div>,
    document.body,
  );
}
