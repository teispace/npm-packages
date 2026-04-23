'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $copyNode,
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  COPY_COMMAND,
  CUT_COMMAND,
  PASTE_COMMAND,
} from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePointFloating } from '@teispace/teieditor/utils';

interface MenuPoint {
  x: number;
  y: number;
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

// Inline SVG icons to avoid needing all icons imported
function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ScissorsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

/**
 * General right-click context menu for the editor.
 * Shows block actions: copy, cut, paste, duplicate, delete block.
 * With proper icons and keyboard shortcut hints.
 */
export function ContextMenu() {
  const [editor] = useLexicalComposerContext();
  const [visible, setVisible] = useState(false);
  const [point, setPoint] = useState<MenuPoint | null>(null);
  const [targetNodeKey, setTargetNodeKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  usePointFloating({ point, floatingRef: menuRef, visible });

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleContextMenu = (e: MouseEvent) => {
      // Don't intercept if target is inside a table (table menu handles that)
      if ((e.target as HTMLElement).closest('td, th')) return;

      e.preventDefault();

      editor.getEditorState().read(() => {
        const node = $getNearestNodeFromDOMNode(e.target as HTMLElement);
        if (node) setTargetNodeKey(node.getKey());
      });

      setPoint({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };

    root.addEventListener('contextmenu', handleContextMenu);
    return () => root.removeEventListener('contextmenu', handleContextMenu);
  }, [editor]);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setVisible(false);
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

  const itemClass =
    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent))]';
  const shortcutClass = 'ml-auto text-[10px] text-[hsl(var(--tei-muted-fg))]';

  return createPortal(
    <div
      ref={menuRef}
      className="tei-context-menu z-50 min-w-[180px] rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] p-1 shadow-lg transition-opacity"
      role="menu"
      aria-label="Block context menu"
    >
      <button type="button" role="menuitem" onClick={handleCopy} className={itemClass}>
        <CopyIcon />
        Copy
        <span className={shortcutClass}>{MOD}+C</span>
      </button>
      <button type="button" role="menuitem" onClick={handleCut} className={itemClass}>
        <ScissorsIcon />
        Cut
        <span className={shortcutClass}>{MOD}+X</span>
      </button>
      <button type="button" role="menuitem" onClick={handlePaste} className={itemClass}>
        <ClipboardIcon />
        Paste
        <span className={shortcutClass}>{MOD}+V</span>
      </button>
      <div className="my-1 h-px bg-[hsl(var(--tei-border))]" />
      <button type="button" role="menuitem" onClick={handleDuplicate} className={itemClass}>
        <DuplicateIcon />
        Duplicate block
        <span className={shortcutClass}>{MOD}+D</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handleDeleteBlock}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[hsl(var(--tei-danger))] hover:bg-[hsl(var(--tei-danger-bg))]"
      >
        <TrashIcon />
        Delete block
      </button>
    </div>,
    document.body,
  );
}
