import { TableNode } from '@lexical/table';
import type { LexicalEditor, NodeKey } from 'lexical';

const SCROLL = 'tei-table-scroll';

/**
 * The edges of a scroll box with more content past them, in physical terms
 * (`left`, `right`), so CSS can fade them. Sub-pixel scroll positions count
 * as at the edge.
 */
export function overflowEdges(
  box: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>,
): string {
  const max = box.scrollWidth - box.clientWidth;
  // Fits: no edges, whatever scroll position is left from when it did not.
  if (max <= 1) return '';
  // RTL boxes scroll from 0 down to -max.
  const left = Math.abs(box.scrollLeft);
  const rtl = box.scrollLeft < 0;
  const before = left > 1;
  const after = left < max - 1;
  const edges: string[] = [];
  if (rtl ? after : before) edges.push('left');
  if (rtl ? before : after) edges.push('right');
  return edges.join(' ');
}

function update(box: HTMLElement): void {
  const edges = overflowEdges(box);
  if (edges) box.dataset.teiOverflow = edges;
  else delete box.dataset.teiOverflow;
}

/**
 * Keeps `data-tei-overflow` on every table's scroll box current as it
 * scrolls, resizes or changes. Returns the cleanup.
 */
export function registerTableOverflow(editor: LexicalEditor): () => void {
  const boxes = new Map<NodeKey, { box: HTMLElement; stop: () => void }>();
  const onScroll = (event: Event) => update(event.currentTarget as HTMLElement);
  const resize =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLElement;
            update(target.classList.contains(SCROLL) ? target : (target.parentElement ?? target));
          }
        });

  const track = (key: NodeKey) => {
    const element = editor.getElementByKey(key);
    const box = element?.classList.contains(SCROLL)
      ? element
      : element?.closest<HTMLElement>(`.${SCROLL}`);
    const current = boxes.get(key);
    if (current?.box === box) {
      if (box) update(box);
      return;
    }
    current?.stop();
    boxes.delete(key);
    if (!box) return;
    box.addEventListener('scroll', onScroll, { passive: true });
    resize?.observe(box);
    const table = box.querySelector('table');
    if (table) resize?.observe(table);
    boxes.set(key, {
      box,
      stop: () => {
        box.removeEventListener('scroll', onScroll);
        resize?.unobserve(box);
        if (table) resize?.unobserve(table);
        delete box.dataset.teiOverflow;
      },
    });
    update(box);
  };

  const stopMutations = editor.registerMutationListener(
    TableNode,
    (mutations) => {
      for (const [key, mutation] of mutations) {
        if (mutation === 'destroyed') {
          boxes.get(key)?.stop();
          boxes.delete(key);
        } else track(key);
      }
    },
    { skipInitialization: false },
  );

  return () => {
    stopMutations();
    for (const { stop } of boxes.values()) stop();
    boxes.clear();
    resize?.disconnect();
  };
}
