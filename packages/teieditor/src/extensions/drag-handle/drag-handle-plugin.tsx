import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { DraggableBlockPlugin_EXPERIMENTAL } from '@lexical/react/LexicalDraggableBlockPlugin';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Default UI components (minimal — registry overrides these)
// ---------------------------------------------------------------------------

function DefaultDragHandle({ onAddClick }: { onAddClick?: () => void }) {
  return (
    <div className="tei-drag-handle flex items-center gap-0.5 transition-opacity">
      {/* Add block button */}
      {onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[hsl(var(--tei-muted-fg))] hover:bg-[hsl(var(--tei-accent))] hover:text-[hsl(var(--tei-fg))]"
          title="Add block below"
          aria-label="Add block below"
        >
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
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}
      {/* Drag grip */}
      <div
        className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-[hsl(var(--tei-drag-handle))] hover:bg-[hsl(var(--tei-accent))] hover:text-[hsl(var(--tei-fg))] active:cursor-grabbing"
        title="Drag to move block"
        aria-label="Drag to move block"
      >
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
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      </div>
    </div>
  );
}

function DefaultTargetLine() {
  return (
    <div className="tei-drag-target pointer-events-none h-0.5 rounded bg-[hsl(var(--tei-primary))] opacity-70" />
  );
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface DragHandlePluginProps {
  /** Anchor element (editor container). Defaults to the editor's root. */
  anchorElem?: HTMLElement;
  /** Called when the "+" button is clicked — typically opens the slash menu. */
  onAddClick?: (targetElement: HTMLElement) => void;
}

/**
 * Block-level drag & drop using Lexical's built-in experimental plugin.
 * Shows a grip handle near the left edge of blocks and moves them on drag.
 *
 * Resolves the `anchorElem` automatically from the editor's root — without
 * it, `DraggableBlockPlugin_EXPERIMENTAL` has nothing to observe and the
 * handle never appears.
 */
export function DragHandlePlugin({
  anchorElem,
  onAddClick,
}: DragHandlePluginProps = {}): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const targetLineRef = useRef<HTMLDivElement>(null);
  const [resolvedAnchor, setResolvedAnchor] = useState<HTMLElement | null>(anchorElem ?? null);

  // Auto-resolve anchor from the editor root if not provided. Retry briefly
  // because the root element may not be mounted on the first paint.
  useEffect(() => {
    if (anchorElem) {
      setResolvedAnchor(anchorElem);
      return;
    }
    let cancelled = false;
    const find = () => {
      if (cancelled) return;
      const root = editor.getRootElement();
      const parent = root?.parentElement ?? null;
      if (parent) {
        setResolvedAnchor(parent);
      } else {
        requestAnimationFrame(find);
      }
    };
    find();
    return () => {
      cancelled = true;
    };
  }, [editor, anchorElem]);

  const handleAddClick = useCallback(() => {
    // Focus the editor, insert a paragraph if needed, then trigger the slash
    // menu by dispatching a synthetic "/" keystroke. The slash-command plugin
    // listens for "/" in text input and opens its popup.
    editor.focus();
    const root = editor.getRootElement();
    if (!root) return;
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true });
    root.dispatchEvent(event);
  }, [editor]);

  if (!resolvedAnchor) return null;

  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={resolvedAnchor}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      menuComponent={
        <div ref={menuRef} className="absolute left-0 top-0 z-30">
          <DefaultDragHandle onAddClick={onAddClick ? () => handleAddClick() : handleAddClick} />
        </div>
      }
      targetLineComponent={
        <div ref={targetLineRef} className="absolute left-0 right-0 pointer-events-none z-30">
          <DefaultTargetLine />
        </div>
      }
      isOnMenu={(element) => {
        return !!element.closest('.tei-drag-handle');
      }}
    />
  );
}
