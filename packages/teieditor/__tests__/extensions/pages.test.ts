import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setExtensionOptions } from '../../src/core/define.js';
import { PageBreak } from '../../src/extensions/page-break/index.js';
import { PAGE_SIZES, type PageBlock, Pages, paginate } from '../../src/extensions/pages/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const block = (height: number, extra: Partial<PageBlock> = {}): PageBlock => ({
  height,
  marginTop: 0,
  marginBottom: 0,
  pageBreak: false,
  ...extra,
});

describe('paginate', () => {
  it('moves a block that would cross the page end to the next page', () => {
    // Pages of 100 with a gap of 20: content at 0–100, 120–220, 240–340.
    const { shifts, pages } = paginate([block(40), block(40), block(40), block(40)], 100, 120);
    expect(shifts).toEqual([null, null, 40, null]);
    expect(pages).toBe(2);
  });

  it('collapses margins between blocks, as CSS does', () => {
    const { shifts } = paginate(
      [block(40, { marginBottom: 10 }), block(40, { marginTop: 16 }), block(10, { marginTop: 8 })],
      100,
      120,
    );
    // 0–40, 56–96, then 104 would end at 114 > 100: moved to 120.
    expect(shifts).toEqual([null, null, 24]);
  });

  it('starts a new page after a page break, and lets an oversized block run on', () => {
    expect(
      paginate([block(10), block(5, { pageBreak: true }), block(10)], 100, 120).shifts,
    ).toEqual([null, null, 105]);
    // A block taller than a page stays first on its page; the next one goes after it.
    const tall = paginate([block(230), block(10)], 100, 120);
    expect(tall.shifts).toEqual([null, 10]);
    expect(tall.pages).toBe(3);
    // Ending inside a later page's content area, the next block follows it there.
    expect(paginate([block(250), block(10)], 100, 120).shifts).toEqual([null, null]);
    expect(paginate([], 100, 120).pages).toBe(1);
  });

  it('handles 10,000 blocks quickly', () => {
    const blocks = Array.from({ length: 10_000 }, (_, i) => block(20 + (i % 7)));
    const start = performance.now();
    const { pages } = paginate(blocks, 930, 1146);
    expect(performance.now() - start).toBeLessThan(50);
    expect(pages).toBeGreaterThan(200);
  });
});

// jsdom lays nothing out: the observer is driven by hand.
class FakeObserver {
  static all: FakeObserver[] = [];
  targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    FakeObserver.all.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  /** Report heights for the observed blocks, in order. */
  report(heights: number[]) {
    const entries = [...this.targets].map((target, i) => ({
      target,
      borderBoxSize: [{ blockSize: heights[i] ?? 0, inlineSize: 0 }],
    }));
    this.callback(entries as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const editors: TeiEditor[] = [];
beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeObserver);
});
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function make(content: string) {
  const editor = createTeiEditor({ extensions: [StarterKit, PageBreak, Pages], content });
  editors.push(editor);
  const host = document.createElement('div');
  const root = document.createElement('div');
  root.contentEditable = 'true';
  host.append(root);
  document.body.append(host);
  editor.lexical.setRootElement(root);
  return { editor, root };
}

/** The observer watching blocks (the other watches the root). */
const blocks = () => FakeObserver.all.find((o) => [...o.targets].some((t) => t.tagName === 'P'));

describe('Pages', () => {
  it('lays the blocks on sheets, shifting only the first block of each, and numbers them', async () => {
    const { editor, root } = make('<p>a</p><p>b</p><p>c</p>');
    expect(editor.isActive('pages')).toBe(false);
    editor.commands.togglePages();
    expect(editor.isActive('pages')).toBe(true);
    expect(root.getAttribute('data-tei-pages')).toBe('a4');
    expect(root.style.getPropertyValue('--tei-page-width')).toBe(`${PAGE_SIZES.a4.width}px`);
    await frame();
    blocks()?.report([400, 400, 400]);
    await frame();
    const paragraphs = [...root.querySelectorAll('p')];
    expect(paragraphs.map((p) => p.hasAttribute('data-tei-page-shift'))).toEqual([
      false,
      false,
      true,
    ]);
    const period = PAGE_SIZES.a4.height + 24;
    expect(paragraphs[2]?.style.getPropertyValue('--tei-page-shift')).toBe(`${period - 800}px`);
    expect(root.style.getPropertyValue('--tei-page-count')).toBe('2');
    const numbers = [...document.querySelectorAll('.tei-page-number')];
    expect(numbers.map((n) => n.textContent)).toEqual(['1 / 2', '2 / 2']);
    expect(document.querySelector('.tei-page-numbers')?.getAttribute('aria-hidden')).toBe('true');
    // Never in the document.
    expect(editor.getHTML()).toBe('<p>a</p><p>b</p><p>c</p>');

    // A block that shrinks: it all fits on one sheet again.
    blocks()?.report([100, 100, 100]);
    await frame();
    expect(root.querySelector('[data-tei-page-shift]')).toBeNull();
    expect(root.style.getPropertyValue('--tei-page-count')).toBe('1');
    expect(
      [...document.querySelectorAll<HTMLElement>('.tei-page-number')].filter((n) => !n.hidden),
    ).toHaveLength(1);

    editor.commands.togglePages();
    expect(root.hasAttribute('data-tei-pages')).toBe(false);
    expect(root.style.getPropertyValue('--tei-page-width')).toBe('');
    expect(document.querySelector('.tei-page-numbers')).toBeNull();
    expect(FakeObserver.all.every((o) => o.targets.size === 0)).toBe(true);
  });

  it('starts a sheet after a page break, and follows blocks added and removed', async () => {
    const { editor, root } = make('<p>a</p><hr data-tei-page-break><p>b</p>');
    editor.commands.togglePages();
    await frame();
    blocks()?.report([20, 20, 20]);
    await frame();
    const b = root.querySelectorAll('p')[1];
    expect(b?.hasAttribute('data-tei-page-shift')).toBe(true);
    expect(root.style.getPropertyValue('--tei-page-count')).toBe('2');

    editor.setContent('<p>x</p><p>y</p>');
    await frame();
    // The new blocks are watched, the old ones let go.
    expect([...(blocks()?.targets ?? [])].map((t) => t.textContent)).toEqual(['x', 'y']);
    blocks()?.report([20, 20]);
    await frame();
    expect(root.style.getPropertyValue('--tei-page-count')).toBe('1');
  });

  it('takes sizes, margins and numbering as options, live', async () => {
    const { editor, root } = make('<p>a</p>');
    setExtensionOptions(editor, Pages, {
      enabled: true,
      size: 'letter',
      margins: { top: 10, right: 20, bottom: 30, left: 40 },
      pageNumbers: false,
    });
    expect(root.getAttribute('data-tei-pages')).toBe('letter');
    expect(root.style.getPropertyValue('--tei-page-margin-left')).toBe('40px');
    await frame();
    blocks()?.report([20]);
    await frame();
    expect(document.querySelector('.tei-page-number')).toBeNull();
    setExtensionOptions(editor, Pages, { size: { width: 500, height: 700 } });
    expect(root.getAttribute('data-tei-pages')).toBe('custom');
    expect(root.style.getPropertyValue('--tei-page-height')).toBe('700px');
  });
});
