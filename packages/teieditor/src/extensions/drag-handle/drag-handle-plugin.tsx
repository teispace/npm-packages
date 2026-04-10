import { DraggableBlockPlugin_EXPERIMENTAL } from '@lexical/react/LexicalDraggableBlockPlugin';
import type { JSX } from 'react';
import { useRef } from 'react';

// ---------------------------------------------------------------------------
// Default UI components (minimal — registry overrides these)
// ---------------------------------------------------------------------------

function DefaultDragHandle({ onAddClick }: { onAddClick?: () => void }) {
  return (
    <div className="tei-drag-handle flex items-center gap-0.5 opacity-0 transition-opacity hover:opacity-100">
      {/* Add block button */}
      {onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[hsl(var(--tei-muted-fg))] hover:bg-[hsl(var(--tei-accent))] hover:text-[hsl(var(--tei-fg))]"
          title="Add block"
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
      <div className="flex h-6 w-6 cursor-grab items-center justify-center rounded active:cursor-grabbing">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[hsl(var(--tei-drag-handle))]"
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
  /** Anchor element (editor container). If not provided, uses document.body. */
  anchorElem?: HTMLElement;
}

/**
 * Block-level drag & drop using Lexical's built-in experimental plugin.
 * Shows a grip handle + "+" button on hover near the left edge of blocks.
 */
export function DragHandlePlugin({ anchorElem }: DragHandlePluginProps = {}): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const targetLineRef = useRef<HTMLDivElement>(null);

  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      menuComponent={
        <div ref={menuRef}>
          <DefaultDragHandle />
        </div>
      }
      targetLineComponent={
        <div ref={targetLineRef}>
          <DefaultTargetLine />
        </div>
      }
      isOnMenu={(element) => {
        return !!element.closest('.tei-drag-handle');
      }}
    />
  );
}
