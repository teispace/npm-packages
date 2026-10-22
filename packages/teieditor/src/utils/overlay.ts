/**
 * Run `fn` once in the next animation frame, however often it is asked
 * for before then. Falls back to a timer where there are no frames.
 */
export function frameScheduler(fn: () => void): { schedule: () => void; cancel: () => void } {
  let pending: number | ReturnType<typeof setTimeout> | null = null;
  const hasFrames = typeof requestAnimationFrame === 'function';
  const run = () => {
    pending = null;
    fn();
  };
  return {
    schedule() {
      if (pending !== null) return;
      pending = hasFrames ? requestAnimationFrame(run) : setTimeout(run, 16);
    },
    cancel() {
      if (pending === null) return;
      if (hasFrames) cancelAnimationFrame(pending as number);
      else clearTimeout(pending);
      pending = null;
    },
  };
}

/**
 * A layer for marks drawn over the document (invisible characters, page
 * numbers): beside the root, never inside it, where Lexical would take it
 * for content. Hidden from assistive technology, out of the selection and
 * the pointer's way. Place children at `rect - origin(layer)`.
 */
export function createOverlay(root: HTMLElement, className: string): HTMLElement {
  const layer = root.ownerDocument.createElement('div');
  layer.className = className;
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('data-tei-overlay', '');
  (root.parentElement ?? root.ownerDocument.body).append(layer);
  return layer;
}

/** Put a mark at a position in its layer, through the CSSOM (nothing for `style-src`). */
export function place(el: HTMLElement, x: number, y: number): void {
  el.style.transform = `translate(${Math.round(x * 10) / 10}px, ${Math.round(y * 10) / 10}px)`;
}
