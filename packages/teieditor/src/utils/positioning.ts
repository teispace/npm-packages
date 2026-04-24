import { useCallback, useEffect } from 'react';

export type Placement = 'top' | 'bottom' | 'auto';

interface Viewport {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
}

/**
 * Return the active viewport — prefers `visualViewport` when available so
 * floating UI survives mobile soft-keyboard open, iOS Safari toolbar changes,
 * and pinch-zoom. Falls back to window dims elsewhere.
 */
function getViewport(): Viewport {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, offsetLeft: 0, offsetTop: 0 };
  }
  const v = window.visualViewport;
  if (v) {
    return { width: v.width, height: v.height, offsetLeft: v.offsetLeft, offsetTop: v.offsetTop };
  }
  return { width: window.innerWidth, height: window.innerHeight, offsetLeft: 0, offsetTop: 0 };
}

/**
 * Calculate floating element position relative to an anchor rect.
 *
 * - `placement: 'top' | 'bottom'` anchors to that side; flips if there isn't
 *   enough room.
 * - `placement: 'auto'` chooses the side with more space — good for menus
 *   that should "just fit" wherever they appear.
 *
 * All values are in viewport (fixed-positioning) coordinates.
 */
export function computeFloatingPosition(
  anchorRect: DOMRect,
  floatingElem: HTMLElement,
  placement: Placement = 'bottom',
  offset: number = 8,
): { top: number; left: number; placement: 'top' | 'bottom' } {
  const floatingRect = floatingElem.getBoundingClientRect();
  const v = getViewport();
  const margin = 8;

  const spaceAbove = anchorRect.top - v.offsetTop;
  const spaceBelow = v.height + v.offsetTop - anchorRect.bottom;
  const needed = floatingRect.height + offset + margin;

  // Resolve 'auto' to whichever side fits (preferring bottom when space is equal).
  let resolved: 'top' | 'bottom';
  if (placement === 'auto') {
    resolved = spaceBelow >= needed || spaceBelow >= spaceAbove ? 'bottom' : 'top';
  } else {
    resolved = placement;
    if (resolved === 'top' && spaceAbove < needed && spaceBelow >= needed) resolved = 'bottom';
    else if (resolved === 'bottom' && spaceBelow < needed && spaceAbove >= needed) resolved = 'top';
  }

  let top =
    resolved === 'top' ? anchorRect.top - floatingRect.height - offset : anchorRect.bottom + offset;

  // Final vertical clamp so the element stays on-screen even when neither
  // side had enough room.
  top = Math.max(
    v.offsetTop + margin,
    Math.min(top, v.offsetTop + v.height - floatingRect.height - margin),
  );

  // Horizontally center on the anchor, then clamp to the viewport.
  let left = anchorRect.left + anchorRect.width / 2 - floatingRect.width / 2;
  left = Math.max(
    v.offsetLeft + margin,
    Math.min(left, v.offsetLeft + v.width - floatingRect.width - margin),
  );

  return { top, left, placement: resolved };
}

/**
 * Position a floating element at a specific viewport point (context menus,
 * right-click popovers). Flips the element into view when the point is near
 * a viewport edge so the menu never falls off-screen.
 */
export function computePointPosition(
  point: { x: number; y: number },
  floatingElem: HTMLElement,
): { top: number; left: number } {
  const floatingRect = floatingElem.getBoundingClientRect();
  const v = getViewport();
  const margin = 8;

  let top = point.y;
  if (top + floatingRect.height > v.offsetTop + v.height - margin) {
    top = Math.max(v.offsetTop + margin, point.y - floatingRect.height);
  }

  let left = point.x;
  if (left + floatingRect.width > v.offsetLeft + v.width - margin) {
    left = Math.max(v.offsetLeft + margin, point.x - floatingRect.width);
  }

  return { top, left };
}

// Use `visibility: hidden` so the element still has measurable dimensions
// (opacity alone keeps layout but some browsers short-circuit measurement
// when paired with off-screen translates). `pointer-events: none` prevents
// the hidden element from intercepting clicks.
function setHidden(el: HTMLElement): void {
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '0';
  el.style.visibility = 'hidden';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
}

function setVisible(el: HTMLElement, top: number, left: number): void {
  el.style.position = 'fixed';
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
  el.style.visibility = 'visible';
  el.style.opacity = '1';
  el.style.pointerEvents = '';
}

/**
 * Hook to position a floating element relative to an anchor rect.
 * Handles scroll, resize, and visualViewport updates (mobile keyboard / zoom).
 */
export function useFloatingPosition(opts: {
  anchorRect: DOMRect | null;
  floatingRef: React.RefObject<HTMLElement | null>;
  placement?: Placement;
  offset?: number;
  visible: boolean;
}): void {
  const { anchorRect, floatingRef, placement = 'bottom', offset = 8, visible } = opts;

  const updatePosition = useCallback(() => {
    const el = floatingRef.current;
    if (!el) return;
    if (!anchorRect || !visible) {
      setHidden(el);
      return;
    }
    const { top, left } = computeFloatingPosition(anchorRect, el, placement, offset);
    setVisible(el, top, left);
  }, [anchorRect, floatingRef, placement, offset, visible]);

  useEffect(() => {
    updatePosition();
    if (!visible) return;

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('scroll', updatePosition);
    vv?.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      vv?.removeEventListener('scroll', updatePosition);
      vv?.removeEventListener('resize', updatePosition);
    };
  }, [updatePosition, visible]);
}

/**
 * Hook to position a floating element at a specific viewport point
 * (for right-click/context-menu UX). Repositions on scroll so the menu
 * doesn't drift away from the content the user clicked on.
 */
export function usePointFloating(opts: {
  point: { x: number; y: number } | null;
  floatingRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
}): void {
  const { point, floatingRef, visible } = opts;

  const updatePosition = useCallback(() => {
    const el = floatingRef.current;
    if (!el) return;
    if (!point || !visible) {
      setHidden(el);
      return;
    }
    const { top, left } = computePointPosition(point, el);
    setVisible(el, top, left);
  }, [point, floatingRef, visible]);

  useEffect(() => {
    updatePosition();
    if (!visible) return;

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('scroll', updatePosition);
    vv?.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      vv?.removeEventListener('scroll', updatePosition);
      vv?.removeEventListener('resize', updatePosition);
    };
  }, [updatePosition, visible]);
}

/**
 * Get the DOMRect of the current native selection range.
 */
export function getSelectionRect(): DOMRect | null {
  if (typeof window === 'undefined') return null;
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return null;
  const range = domSelection.getRangeAt(0);
  return range.getBoundingClientRect();
}
