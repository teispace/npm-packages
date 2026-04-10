'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef, useState } from 'react';

/**
 * Table cell resizer plugin.
 * Adds drag-to-resize functionality on table column borders.
 */
export function TableCellResizerPlugin() {
  const [editor] = useLexicalComposerContext();
  const [dragging, setDragging] = useState(false);
  const dragState = useRef({
    startX: 0,
    cell: null as HTMLTableCellElement | null,
    initialWidth: 0,
  });

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    let resizeCursor = false;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragging) return;

      const target = e.target as HTMLElement;
      const cell = target.closest('td, th') as HTMLTableCellElement | null;
      if (!cell) {
        if (resizeCursor) {
          root.style.cursor = '';
          resizeCursor = false;
        }
        return;
      }

      const rect = cell.getBoundingClientRect();
      const isNearRightEdge = Math.abs(e.clientX - rect.right) < 5;
      const isNearBottomEdge = Math.abs(e.clientY - rect.bottom) < 5;

      if (isNearRightEdge) {
        root.style.cursor = 'col-resize';
        resizeCursor = true;
      } else if (isNearBottomEdge) {
        root.style.cursor = 'row-resize';
        resizeCursor = true;
      } else if (resizeCursor) {
        root.style.cursor = '';
        resizeCursor = false;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest('td, th') as HTMLTableCellElement | null;
      if (!cell) return;

      const rect = cell.getBoundingClientRect();
      const isNearRightEdge = Math.abs(e.clientX - rect.right) < 5;

      if (isNearRightEdge) {
        e.preventDefault();
        setDragging(true);
        dragState.current = {
          startX: e.clientX,
          cell,
          initialWidth: cell.offsetWidth,
        };
      }
    };

    const handleMouseUp = () => {
      if (dragging) {
        setDragging(false);
        root.style.cursor = '';
        dragState.current.cell = null;
      }
    };

    const handleDrag = (e: MouseEvent) => {
      if (!dragging || !dragState.current.cell) return;
      e.preventDefault();

      const dx = e.clientX - dragState.current.startX;
      const newWidth = Math.max(50, dragState.current.initialWidth + dx);
      dragState.current.cell.style.width = `${newWidth}px`;
      dragState.current.cell.style.minWidth = `${newWidth}px`;
    };

    root.addEventListener('mousemove', handleMouseMove);
    root.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      root.removeEventListener('mousemove', handleMouseMove);
      root.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleMouseUp);
      root.style.cursor = '';
    };
  }, [editor, dragging]);

  return null;
}
