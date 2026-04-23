let lastPos: { x: number; y: number } | null = null;
let installed = false;

function handler(e: PointerEvent): void {
  lastPos = { x: e.clientX, y: e.clientY };
}

/**
 * Install a global pointerdown listener that remembers the last click
 * position. Idempotent — safe to call from every provider mount. The
 * captured position is used as the default origin for circular view
 * transitions so the theme reveal expands from the point the user tapped.
 */
export function ensureCursorTracker(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointerdown', handler, { capture: true, passive: true });
}

/** Get the last observed pointerdown position, or `null` if none yet. */
export function getLastPointerPosition(): { x: number; y: number } | null {
  return lastPos;
}

/** Test-only: clear the cached position. */
export function resetCursorTracker(): void {
  lastPos = null;
}
