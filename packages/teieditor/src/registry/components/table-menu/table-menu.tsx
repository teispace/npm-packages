'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $getTableCellNodeFromLexicalNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
} from '@lexical/table';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconPlus, IconTrash } from '../../ui/icons';

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * Right-click context menu for table cells.
 * Shows insert/delete row/column actions.
 */
export function TableMenu() {
  const [editor] = useLexicalComposerContext();
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  // Listen for right-click on table cells
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleContextMenu = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('td, th');
      if (!target) {
        setVisible(false);
        return;
      }

      // Verify it's actually a Lexical table cell
      let isTableCell = false;
      editor.getEditorState().read(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) {
          const cell = $getTableCellNodeFromLexicalNode(sel.anchor.getNode());
          if (cell) isTableCell = true;
        }
      });

      if (!isTableCell) return;

      e.preventDefault();
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

  const execAction = useCallback(
    (action: () => void) => {
      editor.update(action);
      setVisible(false);
    },
    [editor],
  );

  const deleteTable = useCallback(() => {
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      const cell = $getTableCellNodeFromLexicalNode(sel.anchor.getNode());
      if (!cell) return;
      const table = $getTableNodeFromLexicalNodeOrThrow(cell);
      table.remove();
    });
    setVisible(false);
  }, [editor]);

  if (!visible || typeof window === 'undefined') return null;

  const ITEMS = [
    {
      label: 'Insert row above',
      icon: <IconPlus size={14} />,
      action: () => execAction(() => $insertTableRow__EXPERIMENTAL(false)),
    },
    {
      label: 'Insert row below',
      icon: <IconPlus size={14} />,
      action: () => execAction(() => $insertTableRow__EXPERIMENTAL(true)),
    },
    {
      label: 'Insert column left',
      icon: <IconPlus size={14} />,
      action: () => execAction(() => $insertTableColumn__EXPERIMENTAL(false)),
    },
    {
      label: 'Insert column right',
      icon: <IconPlus size={14} />,
      action: () => execAction(() => $insertTableColumn__EXPERIMENTAL(true)),
    },
    { type: 'separator' as const },
    {
      label: 'Delete row',
      icon: <IconTrash size={14} />,
      action: () => execAction(() => $deleteTableRow__EXPERIMENTAL()),
      danger: true,
    },
    {
      label: 'Delete column',
      icon: <IconTrash size={14} />,
      action: () => execAction(() => $deleteTableColumn__EXPERIMENTAL()),
      danger: true,
    },
    { type: 'separator' as const },
    {
      label: 'Delete table',
      icon: <IconTrash size={14} />,
      action: deleteTable,
      danger: true,
    },
  ];

  return createPortal(
    <div
      ref={menuRef}
      className="tei-table-menu fixed z-50 min-w-[180px] rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] p-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
      role="menu"
    >
      {ITEMS.map((item, i) =>
        'type' in item && item.type === 'separator' ? (
          <div key={`sep-${i}`} className="my-1 h-px bg-[hsl(var(--tei-border))]" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={'action' in item ? item.action : undefined}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              'danger' in item && item.danger
                ? 'text-[hsl(var(--tei-danger))] hover:bg-[hsl(var(--tei-danger-bg))]'
                : 'text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent))]'
            }`}
          >
            {'icon' in item && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>
            )}
            {'label' in item && item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
