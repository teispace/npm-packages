'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Direction bitmask
const Direction = {
  east: 1 << 0,
  south: 1 << 1,
  west: 1 << 2,
  north: 1 << 3,
} as const;

const HANDLES = [
  {
    dir: Direction.north,
    cursor: 'n-resize',
    pos: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
  },
  {
    dir: Direction.north | Direction.east,
    cursor: 'ne-resize',
    pos: 'top-0 right-0 translate-x-1/2 -translate-y-1/2',
  },
  {
    dir: Direction.east,
    cursor: 'e-resize',
    pos: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2',
  },
  {
    dir: Direction.south | Direction.east,
    cursor: 'se-resize',
    pos: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2',
  },
  {
    dir: Direction.south,
    cursor: 's-resize',
    pos: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
  },
  {
    dir: Direction.south | Direction.west,
    cursor: 'sw-resize',
    pos: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2',
  },
  {
    dir: Direction.west,
    cursor: 'w-resize',
    pos: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2',
  },
  {
    dir: Direction.north | Direction.west,
    cursor: 'nw-resize',
    pos: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2',
  },
];

const MIN_SIZE = 50;

export interface ImageResizerProps {
  /** Current image width. */
  width: number;
  /** Current image height. */
  height: number;
  /** Max width (usually editor container width). */
  maxWidth?: number;
  /** Called on resize end with new dimensions. */
  onResize: (width: number, height: number) => void;
  /** Children (the image element). */
  children: React.ReactNode;
}

/**
 * 8-directional image resize handles.
 * Wraps the image and shows handles when parent is selected.
 */
export function ImageResizer({
  width,
  height,
  maxWidth = 800,
  onResize,
  children,
}: ImageResizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0, dir: 0 });
  const [resizing, setResizing] = useState(false);

  const handlePointerDown = useCallback(
    (dir: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startRef.current = { x: e.clientX, y: e.clientY, w: width, h: height, dir };
      setResizing(true);
    },
    [width, height],
  );

  useEffect(() => {
    if (!resizing) return;

    const handlePointerMove = (e: PointerEvent) => {
      const { x, y, w, h, dir } = startRef.current;
      const dx = e.clientX - x;
      const dy = e.clientY - y;
      const aspectRatio = w / h;

      let newW = w;
      let newH = h;

      const isCorner =
        (dir & Direction.north && dir & Direction.east) ||
        (dir & Direction.north && dir & Direction.west) ||
        (dir & Direction.south && dir & Direction.east) ||
        (dir & Direction.south && dir & Direction.west);

      if (dir & Direction.east) newW = w + dx;
      if (dir & Direction.west) newW = w - dx;
      if (dir & Direction.south) newH = h + dy;
      if (dir & Direction.north) newH = h - dy;

      // Maintain aspect ratio on corner drags
      if (isCorner) {
        if (Math.abs(dx) > Math.abs(dy)) {
          newH = newW / aspectRatio;
        } else {
          newW = newH * aspectRatio;
        }
      }

      // Clamp
      newW = Math.max(MIN_SIZE, Math.min(newW, maxWidth));
      newH = Math.max(MIN_SIZE, newH);

      onResize(Math.round(newW), Math.round(newH));
    };

    const handlePointerUp = () => {
      setResizing(false);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [resizing, maxWidth, onResize]);

  return (
    <div ref={containerRef} className="tei-image-resizer relative inline-block">
      {children}

      {/* Resize handles */}
      {HANDLES.map(({ dir, cursor, pos }) => (
        <div
          key={dir}
          onPointerDown={handlePointerDown(dir)}
          className={`absolute h-3 w-3 rounded-full border-2 border-[hsl(var(--tei-primary))] bg-[hsl(var(--tei-bg))] ${pos}`}
          style={{ cursor }}
        />
      ))}
    </div>
  );
}
