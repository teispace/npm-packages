import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  DROP_COMMAND,
  type LexicalEditor,
  type NodeKey,
} from 'lexical';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBlockElement(
  _anchorElem: HTMLElement,
  editor: LexicalEditor,
  event: MouseEvent,
): HTMLElement | null {
  const editorRoot = editor.getRootElement();
  if (!editorRoot) return null;

  // Walk from the hovered element up to find a direct child of the editor root
  let target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
  while (target && target.parentElement !== editorRoot) {
    target = target.parentElement;
  }
  return target;
}

function getNodeKeyFromDOM(editor: LexicalEditor, element: HTMLElement): NodeKey | null {
  let key: NodeKey | null = null;
  editor.getEditorState().read(() => {
    const node = $getNearestNodeFromDOMNode(element);
    if (node) key = node.getKey();
  });
  return key;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function DragHandlePlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const draggedNodeKey = useRef<NodeKey | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const editorRoot = editor.getRootElement();
      if (!editorRoot) return;

      const rootRect = editorRoot.getBoundingClientRect();
      // Only show handle when hovering near the left edge
      if (
        event.clientX < rootRect.left - 4 ||
        event.clientX > rootRect.left + 40 ||
        event.clientY < rootRect.top ||
        event.clientY > rootRect.bottom
      ) {
        setVisible(false);
        return;
      }

      const blockElem = getBlockElement(editorRoot, editor, event);
      if (!blockElem) {
        setVisible(false);
        return;
      }

      const blockRect = blockElem.getBoundingClientRect();
      setPosition({
        top: blockRect.top + 2,
        left: rootRect.left - 28,
      });
      setVisible(true);

      const key = getNodeKeyFromDOM(editor, blockElem);
      draggedNodeKey.current = key;
    },
    [editor],
  );

  // Track mouse move on the editor container
  useEffect(() => {
    const editorRoot = editor.getRootElement();
    if (!editorRoot) return;

    const container = editorRoot.parentElement;
    if (!container) return;

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', () => setVisible(false));

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', () => setVisible(false));
    };
  }, [editor, handleMouseMove]);

  // Handle drag start
  const handleDragStart = useCallback((event: React.DragEvent) => {
    if (!draggedNodeKey.current) return;

    // Set drag data
    event.dataTransfer.setData('text/plain', '');
    event.dataTransfer.effectAllowed = 'move';

    // Store the key for drop handling
    event.dataTransfer.setData('application/x-tei-drag', draggedNodeKey.current);
  }, []);

  // Handle drop via Lexical command
  useEffect(() => {
    return editor.registerCommand(
      DROP_COMMAND,
      (event: DragEvent) => {
        const dragData = event.dataTransfer?.getData('application/x-tei-drag');
        if (!dragData) return false;

        event.preventDefault();

        const editorRoot = editor.getRootElement();
        if (!editorRoot) return false;

        // Find drop target
        const target = document.elementFromPoint(
          event.clientX,
          event.clientY,
        ) as HTMLElement | null;
        if (!target) return false;

        let dropTarget = target;
        while (dropTarget && dropTarget.parentElement !== editorRoot) {
          dropTarget = dropTarget.parentElement!;
        }
        if (!dropTarget) return false;

        editor.update(() => {
          const dragNode = $getNodeByKey(dragData);
          const dropNode = $getNearestNodeFromDOMNode(dropTarget);
          if (!dragNode || !dropNode || dragNode === dropNode) return;

          // Determine if we should insert before or after
          const dropRect = dropTarget.getBoundingClientRect();
          const midY = dropRect.top + dropRect.height / 2;

          dragNode.remove();
          if (event.clientY < midY) {
            dropNode.insertBefore(dragNode);
          } else {
            dropNode.insertAfter(dragNode);
          }
        });

        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div
      ref={handleRef}
      className={`tei-drag-handle fixed z-40 flex h-6 w-6 cursor-grab items-center justify-center rounded transition-opacity ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{ top: position.top, left: position.left }}
      draggable
      onDragStart={handleDragStart}
      aria-label="Drag to reorder"
      title="Drag to reorder"
    >
      <span
        className="text-muted-foreground/60 hover:text-muted-foreground text-sm select-none"
        aria-hidden
      >
        ⠿
      </span>
    </div>,
    document.body,
  );
}
