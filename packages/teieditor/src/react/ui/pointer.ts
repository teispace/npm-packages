import type { PointerEvent } from 'react';

/**
 * Keep focus (and the editor's selection) where it is on a mouse or pen
 * press of a control. Never on touch: WebKit drops the tap's click when its
 * `pointerdown` is cancelled.
 */
export function keepFocus(event: PointerEvent): void {
  if (event.pointerType !== 'touch' && event.button === 0) event.preventDefault();
}
