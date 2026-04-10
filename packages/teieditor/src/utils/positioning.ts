import { useCallback, useEffect } from 'react';

/**
 * Calculate floating element position relative to an anchor rect.
 * Used by bubble menu, link editor, slash menu, table menu, code bar.
 */
export function computeFloatingPosition(
  anchorRect: DOMRect,
  floatingElem: HTMLElement,
  placement: 'top' | 'bottom' = 'bottom',
  offset: number = 8,
): { top: number; left: number } {
  const floatingRect = floatingElem.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let top: number;
  let left: number;

  if (placement === 'top') {
    top = anchorRect.top - floatingRect.height - offset;
    // Flip to bottom if not enough space above
    if (top < 0) {
      top = anchorRect.bottom + offset;
    }
  } else {
    top = anchorRect.bottom + offset;
    // Flip to top if not enough space below
    if (top + floatingRect.height > viewportHeight) {
      top = anchorRect.top - floatingRect.height - offset;
    }
  }

  // Center horizontally relative to anchor
  left = anchorRect.left + anchorRect.width / 2 - floatingRect.width / 2;
  // Clamp to viewport
  left = Math.max(8, Math.min(left, viewportWidth - floatingRect.width - 8));

  return { top, left };
}

/**
 * Hook to position a floating element relative to an anchor rect.
 * Handles scroll/resize updates and viewport clamping.
 */
export function useFloatingPosition(opts: {
  anchorRect: DOMRect | null;
  floatingRef: React.RefObject<HTMLElement | null>;
  placement?: 'top' | 'bottom';
  offset?: number;
  visible: boolean;
}): void {
  const { anchorRect, floatingRef, placement = 'bottom', offset = 8, visible } = opts;

  const updatePosition = useCallback(() => {
    const floatingElem = floatingRef.current;
    if (!anchorRect || !floatingElem || !visible) {
      if (floatingElem) {
        floatingElem.style.opacity = '0';
        floatingElem.style.transform = 'translate(-10000px, -10000px)';
      }
      return;
    }

    const { top, left } = computeFloatingPosition(anchorRect, floatingElem, placement, offset);
    floatingElem.style.position = 'fixed';
    floatingElem.style.top = `${top}px`;
    floatingElem.style.left = `${left}px`;
    floatingElem.style.opacity = '1';
    floatingElem.style.transform = 'none';
  }, [anchorRect, floatingRef, placement, offset, visible]);

  useEffect(() => {
    updatePosition();

    if (!visible) return;

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [updatePosition, visible]);
}

/**
 * Get the DOMRect of the current native selection range.
 */
export function getSelectionRect(): DOMRect | null {
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return null;
  const range = domSelection.getRangeAt(0);
  return range.getBoundingClientRect();
}
