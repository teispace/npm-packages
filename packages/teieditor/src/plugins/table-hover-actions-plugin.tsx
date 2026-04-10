'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getTableCellNodeFromLexicalNode,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
} from '@lexical/table';
import { $getNearestNodeFromDOMNode } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface HoverPosition {
  type: 'row' | 'column';
  x: number;
  y: number;
}

/**
 * Table hover actions plugin.
 * Shows "+" buttons on table edges for adding rows/columns.
 */
export function TableHoverActionsPlugin() {
  const [editor] = useLexicalComposerContext();
  const [hover, setHover] = useState<HoverPosition | null>(null);
  const [tableElement, setTableElement] = useState<HTMLTableElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleMouseMove = (e: MouseEvent) => {
      clearTimeout(timeoutRef.current);

      const table = (e.target as HTMLElement).closest('table') as HTMLTableElement | null;
      if (!table) {
        timeoutRef.current = setTimeout(() => setHover(null), 200);
        return;
      }

      setTableElement(table);
      const rect = table.getBoundingClientRect();

      // Near bottom edge → add row
      if (Math.abs(e.clientY - rect.bottom) < 12) {
        setHover({
          type: 'row',
          x: rect.left + rect.width / 2,
          y: rect.bottom,
        });
        return;
      }

      // Near right edge → add column
      if (Math.abs(e.clientX - rect.right) < 12) {
        setHover({
          type: 'column',
          x: rect.right,
          y: rect.top + rect.height / 2,
        });
        return;
      }

      setHover(null);
    };

    const handleMouseLeave = () => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setHover(null), 300);
    };

    root.addEventListener('mousemove', handleMouseMove);
    root.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      clearTimeout(timeoutRef.current);
      root.removeEventListener('mousemove', handleMouseMove);
      root.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor]);

  const handleAdd = useCallback(() => {
    if (!hover || !tableElement) return;

    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(tableElement);
      if (!node) return;

      // Find a cell in the table to use as anchor
      const firstCell = tableElement.querySelector('td, th');
      if (!firstCell) return;

      const cellNode = $getNearestNodeFromDOMNode(firstCell);
      if (!cellNode) return;

      const tableCellNode = $getTableCellNodeFromLexicalNode(cellNode);
      if (!tableCellNode) return;

      if (hover.type === 'row') {
        // Insert row at bottom
        $insertTableRow__EXPERIMENTAL(true);
      } else {
        // Insert column at right
        $insertTableColumn__EXPERIMENTAL(true);
      }
    });
    setHover(null);
  }, [editor, hover, tableElement]);

  if (!hover || typeof window === 'undefined') return null;

  return createPortal(
    <button
      type="button"
      onClick={handleAdd}
      onMouseEnter={() => clearTimeout(timeoutRef.current)}
      onMouseLeave={() => {
        timeoutRef.current = setTimeout(() => setHover(null), 200);
      }}
      className="tei-table-hover-action fixed z-40 flex h-5 items-center justify-center rounded border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] shadow-sm hover:bg-[hsl(var(--tei-accent))] transition-colors"
      style={{
        top: hover.y - 10,
        left: hover.x - (hover.type === 'row' ? 20 : 10),
        width: hover.type === 'row' ? 40 : 20,
        height: hover.type === 'row' ? 20 : 40,
      }}
      title={hover.type === 'row' ? 'Add row' : 'Add column'}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[hsl(var(--tei-muted-fg))]"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>,
    document.body,
  );
}
