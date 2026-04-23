'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $getTableCellNodeFromLexicalNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
  $isTableSelection,
  $mergeCells,
  $unmergeCell,
} from '@lexical/table';
import { usePointFloating } from '@teispace/teieditor/utils';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconPlus, IconTrash } from '../../ui/icons';

interface MenuPoint {
  x: number;
  y: number;
}

// Curated palette for cell backgrounds. Uses `--tei-*` hues so it stays
// coherent with the editor theme in both light and dark modes. `null`
// clears the color.
const CELL_COLORS: { label: string; value: string | null }[] = [
  { label: 'Default', value: null },
  { label: 'Red', value: '#fee2e2' },
  { label: 'Orange', value: '#fed7aa' },
  { label: 'Yellow', value: '#fef3c7' },
  { label: 'Green', value: '#d1fae5' },
  { label: 'Blue', value: '#dbeafe' },
  { label: 'Purple', value: '#ede9fe' },
  { label: 'Gray', value: '#e5e7eb' },
];

/**
 * Right-click menu for table cells. Supports:
 * - Insert/delete row & column
 * - Merge/unmerge selected cells (requires a TableSelection — shift-drag)
 * - Cell background color
 * - Delete entire table
 */
export function TableMenu() {
  const [editor] = useLexicalComposerContext();
  const [visible, setVisible] = useState(false);
  const [point, setPoint] = useState<MenuPoint | null>(null);
  const [hasMultiSelect, setHasMultiSelect] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  usePointFloating({ point, floatingRef: menuRef, visible });

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleContextMenu = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('td, th');
      if (!target) {
        setVisible(false);
        return;
      }

      let isTableCell = false;
      let multiCell = false;
      editor.getEditorState().read(() => {
        const sel = $getSelection();
        if ($isTableSelection(sel)) {
          isTableCell = true;
          multiCell =
            sel.getShape().fromX !== sel.getShape().toX ||
            sel.getShape().fromY !== sel.getShape().toY;
        } else if ($isRangeSelection(sel)) {
          const cell = $getTableCellNodeFromLexicalNode(sel.anchor.getNode());
          if (cell) isTableCell = true;
        }
      });

      if (!isTableCell) return;
      e.preventDefault();
      setHasMultiSelect(multiCell);
      setPoint({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };

    root.addEventListener('contextmenu', handleContextMenu);
    return () => root.removeEventListener('contextmenu', handleContextMenu);
  }, [editor]);

  useEffect(() => {
    if (!visible) return;
    const onMouse = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setVisible(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false);
    };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [visible]);

  const execAction = useCallback(
    (action: () => void) => {
      editor.update(action);
      setVisible(false);
    },
    [editor],
  );

  const setCellBackground = useCallback(
    (color: string | null) => {
      editor.update(() => {
        const sel = $getSelection();
        if ($isTableSelection(sel)) {
          for (const node of sel.getNodes()) {
            const cell = $getTableCellNodeFromLexicalNode(node);
            if (cell) cell.setBackgroundColor(color);
          }
        } else if ($isRangeSelection(sel)) {
          const cell = $getTableCellNodeFromLexicalNode(sel.anchor.getNode());
          if (cell) cell.setBackgroundColor(color);
        }
      });
      setVisible(false);
    },
    [editor],
  );

  const mergeSelected = useCallback(() => {
    editor.update(() => {
      const sel = $getSelection();
      if (!$isTableSelection(sel)) return;
      const nodes = sel.getNodes().filter((n) => $getTableCellNodeFromLexicalNode(n) !== null);
      const cells = nodes
        .map((n) => $getTableCellNodeFromLexicalNode(n))
        .filter((c): c is NonNullable<typeof c> => c !== null);
      // De-dupe — getNodes() returns all descendants
      const unique = Array.from(new Map(cells.map((c) => [c.getKey(), c])).values());
      if (unique.length >= 2) $mergeCells(unique);
    });
    setVisible(false);
  }, [editor]);

  const unmergeSelected = useCallback(() => {
    editor.update(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) {
        const cell = $getTableCellNodeFromLexicalNode(sel.anchor.getNode());
        if (cell) $unmergeCell();
      }
    });
    setVisible(false);
  }, [editor]);

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

  return createPortal(
    <div
      ref={menuRef}
      className="tei-table-menu z-50 min-w-[200px] rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] p-1 shadow-lg transition-opacity"
      role="menu"
      aria-label="Table cell actions"
    >
      <MenuItem
        onClick={() => execAction(() => $insertTableRow__EXPERIMENTAL(false))}
        icon={<IconPlus size={14} />}
      >
        Insert row above
      </MenuItem>
      <MenuItem
        onClick={() => execAction(() => $insertTableRow__EXPERIMENTAL(true))}
        icon={<IconPlus size={14} />}
      >
        Insert row below
      </MenuItem>
      <MenuItem
        onClick={() => execAction(() => $insertTableColumn__EXPERIMENTAL(false))}
        icon={<IconPlus size={14} />}
      >
        Insert column left
      </MenuItem>
      <MenuItem
        onClick={() => execAction(() => $insertTableColumn__EXPERIMENTAL(true))}
        icon={<IconPlus size={14} />}
      >
        Insert column right
      </MenuItem>

      <Separator />

      {hasMultiSelect && <MenuItem onClick={mergeSelected}>Merge cells</MenuItem>}
      <MenuItem onClick={unmergeSelected}>Unmerge cell</MenuItem>

      <Separator />

      <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--tei-muted-fg))]">
        Background
      </div>
      <div className="flex flex-wrap gap-1 px-2 pb-1.5 pt-0.5">
        {CELL_COLORS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setCellBackground(c.value)}
            title={c.label}
            aria-label={`Set cell background to ${c.label}`}
            className="h-5 w-5 rounded border border-[hsl(var(--tei-border))] transition-transform hover:scale-110"
            style={{
              background:
                c.value === null
                  ? 'repeating-linear-gradient(45deg, transparent, transparent 2px, hsl(var(--tei-muted)) 2px, hsl(var(--tei-muted)) 4px)'
                  : c.value,
            }}
          />
        ))}
      </div>

      <Separator />

      <MenuItem
        danger
        onClick={() => execAction(() => $deleteTableRow__EXPERIMENTAL())}
        icon={<IconTrash size={14} />}
      >
        Delete row
      </MenuItem>
      <MenuItem
        danger
        onClick={() => execAction(() => $deleteTableColumn__EXPERIMENTAL())}
        icon={<IconTrash size={14} />}
      >
        Delete column
      </MenuItem>
      <Separator />
      <MenuItem danger onClick={deleteTable} icon={<IconTrash size={14} />}>
        Delete table
      </MenuItem>
    </div>,
    document.body,
  );
}

function MenuItem({
  onClick,
  icon,
  danger = false,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        danger
          ? 'text-[hsl(var(--tei-danger))] hover:bg-[hsl(var(--tei-danger-bg))]'
          : 'text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent))]'
      }`}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      {children}
    </button>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-[hsl(var(--tei-border))]" />;
}
