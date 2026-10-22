import { effect } from '@lexical/extension';
import { $getRoot, type LexicalEditor, mergeRegister, type NodeKey } from 'lexical';
import { defineTeiExtension, setExtensionOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import { pages as pagesIcon } from '../../icons/index.js';
import { createOverlay, frameScheduler, place } from '../../utils/overlay.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Show the document on pages, or as one long sheet again. */
    togglePages: [];
  }
  interface TeiActiveStates {
    pages: [];
  }
}

/** A sheet: a paper name, or a size in CSS pixels (96 to the inch). */
export type PageSize = 'a4' | 'letter' | { width: number; height: number };

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PagesOptions {
  /** Whether the pages view is on. Off by default; `togglePages` flips it. */
  enabled: boolean;
  /** The sheet. Default `'a4'`. */
  size: PageSize;
  /** Space inside each sheet's edges, in CSS pixels. Default an inch all round. */
  margins: PageMargins;
  /** Space between sheets, in CSS pixels. Default 24. */
  gap: number;
  /** A number at the foot of each sheet. Default true. */
  pageNumbers: boolean;
}

/** Paper sizes in CSS pixels. */
export const PAGE_SIZES: Readonly<Record<'a4' | 'letter', { width: number; height: number }>> = {
  a4: { width: (210 * 96) / 25.4, height: (297 * 96) / 25.4 },
  letter: { width: 816, height: 1056 },
};

/** A top-level block as pagination sees it. */
export interface PageBlock {
  /** Border-box height. */
  height: number;
  marginTop: number;
  marginBottom: number;
  /** A page break: the next block starts a new page. */
  pageBreak: boolean;
}

/**
 * Lay blocks on pages: a block that would run past its page's content
 * area starts the next page instead (unless it is first on its page, as a
 * block taller than a page is), and so does the block after a page break.
 * `shifts[i]` is the margin that moves block `i` to the top of its page,
 * or `null` where it stays put. Positions are from the top of the first
 * page's content area; page `k`'s starts at `k * period`.
 */
export function paginate(
  blocks: readonly PageBlock[],
  contentHeight: number,
  period: number,
): { shifts: (number | null)[]; pages: number } {
  const shifts: (number | null)[] = [];
  let cursor = 0;
  let below = 0;
  let page = 0;
  let force = false;
  blocks.forEach((block, i) => {
    let start = cursor + (i === 0 ? block.marginTop : Math.max(below, block.marginTop));
    let shift: number | null = null;
    const top = page * period;
    if (i > 0 && (force || (start + block.height > top + contentHeight && cursor > top))) {
      page += 1;
      start = page * period;
      shift = start - cursor;
    }
    shifts.push(shift);
    cursor = start + block.height;
    below = block.marginBottom;
    // A block taller than its page runs on; the next block starts after it.
    page = Math.max(page, Math.floor(cursor / period));
    force = block.pageBreak;
  });
  return { shifts, pages: page + 1 };
}

interface Tracked extends PageBlock {
  el: HTMLElement;
  key: NodeKey;
  /** Measured by the observer yet. */
  measured: boolean;
  /** The shift written to the element, so only changes are written. */
  applied: number | null | undefined;
}

const px = (value: string) => Number.parseFloat(value) || 0;

function sizeOf(size: PageSize): { width: number; height: number } {
  return typeof size === 'string' ? PAGE_SIZES[size] : size;
}

const SHIFT = 'data-tei-page-shift';
const VARS = [
  '--tei-page-width',
  '--tei-page-height',
  '--tei-page-margin-top',
  '--tei-page-margin-right',
  '--tei-page-margin-bottom',
  '--tei-page-margin-left',
  '--tei-page-gap',
  '--tei-page-count',
];

function unshift(el: HTMLElement): void {
  el.removeAttribute(SHIFT);
  el.style.removeProperty('--tei-page-shift');
}

/**
 * The pages view, while on. Block heights come from a ResizeObserver, so
 * typing that does not change a block's height measures nothing, and one
 * that does measures that block only; laying out is arithmetic over the
 * cached heights, once a frame, writing only the shifts that changed.
 */
function showPages(editor: TeiEditor, lexical: LexicalEditor, options: PagesOptions): () => void {
  const { width, height } = sizeOf(options.size);
  const { margins, gap } = options;
  const contentHeight = height - margins.top - margins.bottom;
  const period = height + gap;
  let tracked: Tracked[] = [];
  const byEl = new Map<Element, Tracked>();
  const byKey = new Map<NodeKey, Tracked>();
  let stale = true;
  let layer: HTMLElement | null = null;
  const numbers: HTMLElement[] = [];
  let observer: ResizeObserver | null = null;
  let rootObserver: ResizeObserver | null = null;

  const measure = (item: Tracked, blockSize?: number) => {
    if (!item.measured) {
      const style = getComputedStyle(item.el);
      item.marginTop = px(style.marginTop);
      item.marginBottom = px(style.marginBottom);
    }
    item.height = blockSize ?? item.el.offsetHeight;
    item.measured = true;
  };

  /** Track the root's children as they are now. */
  const sync = () => {
    stale = false;
    const keys = lexical.getEditorState().read(() => $getRoot().getChildrenKeys());
    const next: Tracked[] = [];
    const seen = new Set<Element>();
    for (const key of keys) {
      const el = lexical.getElementByKey(key);
      if (!el) continue;
      seen.add(el);
      let item = byEl.get(el);
      if (!item) {
        item = {
          el,
          key,
          height: 0,
          marginTop: 0,
          marginBottom: 0,
          pageBreak: false,
          measured: false,
          applied: undefined,
        };
        byEl.set(el, item);
        if (observer) observer.observe(el);
        else measure(item);
      }
      item.key = key;
      item.pageBreak = el.hasAttribute('data-tei-page-break');
      next.push(item);
    }
    for (const [el, item] of byEl) {
      if (seen.has(el)) continue;
      observer?.unobserve(el);
      unshift(item.el);
      byEl.delete(el);
    }
    tracked = next;
    byKey.clear();
    for (const item of tracked) byKey.set(item.key, item);
  };

  const frame = frameScheduler(() => {
    const root = lexical.getRootElement();
    if (!root?.isConnected) return;
    if (stale) sync();
    // Without an observer, measure every block (no ResizeObserver: rare).
    if (!observer) for (const item of tracked) measure(item);
    if (tracked.some((item) => !item.measured)) return; // the observer reports soon
    const { shifts, pages } = paginate(tracked, contentHeight, period);
    // Reads before writes.
    const rootBox = root.getBoundingClientRect();
    if (options.pageNumbers && !layer?.isConnected) {
      layer = createOverlay(root, 'tei-page-numbers');
      numbers.length = 0;
    }
    const origin = layer?.getBoundingClientRect();
    tracked.forEach((item, i) => {
      const shift = shifts[i] ?? null;
      if (shift === item.applied) return;
      item.applied = shift;
      if (shift === null) unshift(item.el);
      else {
        item.el.setAttribute(SHIFT, '');
        item.el.style.setProperty('--tei-page-shift', `${shift}px`);
      }
    });
    root.style.setProperty('--tei-page-count', String(pages));
    if (!layer || !origin) return;
    for (let page = 0; page < pages; page++) {
      let label = numbers[page];
      if (!label) {
        label = root.ownerDocument.createElement('span');
        label.className = 'tei-page-number';
        numbers.push(label);
        layer.append(label);
      }
      label.hidden = false;
      label.textContent = editor.t('pages.number', { page: page + 1, total: pages });
      place(
        label,
        rootBox.left - origin.left + rootBox.width / 2,
        rootBox.top - origin.top + page * period + height - margins.bottom / 2,
      );
    }
    for (let i = pages; i < numbers.length; i++) (numbers[i] as HTMLElement).hidden = true;
  });

  const attach = (root: HTMLElement) => {
    root.setAttribute('data-tei-pages', typeof options.size === 'string' ? options.size : 'custom');
    const values = [width, height, margins.top, margins.right, margins.bottom, margins.left, gap];
    values.forEach((value, i) => root.style.setProperty(VARS[i] as string, `${value}px`));
    root.style.setProperty('--tei-page-count', '1');
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const item = byEl.get(entry.target);
          if (item) measure(item, entry.borderBoxSize?.[0]?.blockSize);
        }
        frame.schedule();
      });
      // The page numbers follow the sheet when it moves sideways.
      rootObserver = new ResizeObserver(frame.schedule);
      rootObserver.observe(root);
    }
    stale = true;
    frame.schedule();
  };

  const detach = (root: HTMLElement | null) => {
    observer?.disconnect();
    rootObserver?.disconnect();
    observer = rootObserver = null;
    for (const item of byEl.values()) unshift(item.el);
    byEl.clear();
    byKey.clear();
    tracked = [];
    layer?.remove();
    layer = null;
    if (!root) return;
    root.removeAttribute('data-tei-pages');
    for (const name of VARS) root.style.removeProperty(name);
  };

  return mergeRegister(
    lexical.registerRootListener((root, previous) => {
      detach(previous);
      if (root) attach(root);
    }),
    lexical.registerUpdateListener(({ dirtyElements }) => {
      // Blocks added, removed or moved; or one redrawn as a new element.
      let changed = dirtyElements.get('root') === true;
      for (const key of dirtyElements.keys()) {
        const item = byKey.get(key);
        if (!item) continue;
        if (lexical.getElementByKey(key) !== item.el) changed = true;
        // Lexical may have rewritten its style: write the shift again.
        else item.applied = undefined;
      }
      if (changed) stale = true;
      frame.schedule();
    }),
    () => {
      frame.cancel();
      detach(lexical.getRootElement());
    },
  );
}

/**
 * A print layout view: the document on page-sized sheets (A4, Letter or
 * your own), with margins, gaps between sheets and page numbers. Page
 * breaks (`PageBreak`, if installed) start a new sheet. Purely a view: the
 * document never changes, and printing the page gives the same sheets.
 */
export const Pages = defineTeiExtension({
  name: '@teispace/teieditor/pages',
  config: {
    enabled: false,
    size: 'a4',
    margins: { top: 96, right: 96, bottom: 96, left: 96 },
    gap: 24,
    pageNumbers: true,
  } as PagesOptions,
  commands: {
    togglePages: {
      run: ({ editor, options }) => {
        setExtensionOptions(editor, Pages, { enabled: !options.enabled });
      },
    },
  },
  active: { pages: ({ options }) => options.enabled },
  register: ({ editor, lexical, options }) =>
    effect(() =>
      options.enabled
        ? showPages(editor, lexical, {
            enabled: true,
            size: options.size,
            margins: options.margins,
            gap: options.gap,
            pageNumbers: options.pageNumbers,
          })
        : undefined,
    ),
  icons: { pages: pagesIcon },
  messages: { 'view.pages': 'Pages', 'pages.number': '{page} / {total}' },
  items: [
    {
      id: 'pages',
      label: 'view.pages',
      icon: 'pages',
      in: ['document'],
      group: 'view',
      order: 20,
      command: 'togglePages',
      active: 'pages',
    },
  ],
});
