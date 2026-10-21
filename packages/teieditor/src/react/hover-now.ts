/**
 * Hand `onOver` the element under the pointer in `root` now: the
 * `pointerover` a listener added late (a part that loads after the editor)
 * never saw. Nothing on a touch screen, where nothing is hovered.
 */
export function hoverNow(root: HTMLElement, onOver: (event: PointerEvent) => void): void {
  // A tap leaves :hover on what it touched; that is not a pointer over it.
  if (!root.ownerDocument.defaultView?.matchMedia?.('(hover: hover)').matches) return;
  const hovered = root.querySelectorAll(':hover');
  const target = hovered[hovered.length - 1];
  if (target) onOver({ target, pointerType: 'mouse' } as unknown as PointerEvent);
}
