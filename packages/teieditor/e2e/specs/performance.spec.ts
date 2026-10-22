import type { Locator, Page } from '@playwright/test';
import { expect, settled, test } from './fixtures';

/**
 * A long document stays quick to type in: 10,000 paragraphs, every
 * extension the harness installs, and the full UI. Chromium only, for the
 * Event Timing API: each key's entry spans from the key to the frame that
 * shows it, so it is the latency a person feels.
 *
 * Timings depend on the machine, so the editor is held to plain Lexical
 * measured in the same run, on the same document. Tagged `@perf`: left out
 * of the parallel run, it runs alone (`yarn test:perf`), as timings only
 * mean something on a machine doing nothing else.
 */
const PARAGRAPHS = 10_000;
const TEXT = ' typed while the document is long';
const LINE = (i: number) => `Paragraph ${i + 1}: the quick brown fox jumps over the lazy dog.`;

interface Latency {
  p95: number;
  max: number;
  slow: number;
}

/** Types at the end of the middle paragraph; the keys' latencies. */
async function typeInto(page: Page, content: Locator): Promise<Latency> {
  // The middle of the document, where every block around is live.
  const middle = content.locator('p').nth(PARAGRAPHS / 2);
  await middle.click();
  // Not End: on a Mac it scrolls the page instead of moving the caret.
  await middle.evaluate((p) => {
    let text: Node = p;
    while (text.lastChild) text = text.lastChild;
    getSelection()?.collapse(text, text.textContent?.length ?? 0);
  });
  await settled(page);

  await page.evaluate(() => {
    const entries: number[] = [];
    (window as unknown as { __latency: number[] }).__latency = entries;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'keydown') entries.push(entry.duration);
      }
    }).observe({
      type: 'event',
      durationThreshold: 16,
      buffered: false,
    } as PerformanceObserverInit);
  });
  await page.keyboard.type(TEXT, { delay: 40 });
  await settled(page);
  await expect(middle).toContainText(TEXT.trim());

  // Only keys over 16ms are reported; the rest were within a frame.
  const slow = await page.evaluate(() => (window as unknown as { __latency: number[] }).__latency);
  const sorted = [...slow].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(TEXT.length * 0.95) - (TEXT.length - sorted.length)] ?? 0;
  return { p95, max: sorted.at(-1) ?? 0, slow: slow.length };
}

test.describe('performance', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Event Timing is Chromium’s');

  test('typing in a 10,000-paragraph document stays close to plain Lexical @perf', async ({
    tei,
  }) => {
    test.setTimeout(180_000);
    const { page } = tei;
    const lines = Array.from({ length: PARAGRAPHS }, (_, i) => LINE(i));

    // Plain Lexical, nothing of ours: what this machine does at best.
    await page.goto('/bare.html');
    await page.evaluate((texts) => {
      const editor = (window as unknown as { __bare: import('lexical').LexicalEditor }).__bare;
      const paragraph = (text: string) => ({
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        children: [
          { type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' },
        ],
      });
      const root = {
        type: 'root',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: texts.map(paragraph),
      };
      editor.setEditorState(editor.parseEditorState({ root } as never));
    }, lines);
    const bareContent = page.getByTestId('bare');
    await expect(bareContent.locator('p')).toHaveCount(PARAGRAPHS);
    const bare = await typeInto(page, bareContent);

    await tei.open();
    const loadMs = await page.evaluate(
      (html) => {
        const start = performance.now();
        window.__tei.editor.setContent(html);
        return performance.now() - start;
      },
      lines.map((line) => `<p>${line}</p>`).join(''),
    );
    await settled(page);
    await expect(tei.content.locator('p')).toHaveCount(PARAGRAPHS);
    const ours = await typeInto(page, tei.content);

    console.log(
      `10k paragraphs: set in ${Math.round(loadMs)}ms. Keys over 16ms, p95, max: ` +
        `Lexical ${bare.slow}/${TEXT.length}, ${bare.p95}ms, ${bare.max}ms; ` +
        `teieditor ${ours.slow}/${TEXT.length}, ${ours.p95}ms, ${ours.max}ms`,
    );
    // At most a frame and a half over plain Lexical at the 95th percentile,
    // and no key that feels stuck.
    expect(ours.p95).toBeLessThanOrEqual(bare.p95 + 24);
    expect(ours.max).toBeLessThan(Math.max(100, bare.max * 2));
    expect(loadMs).toBeLessThan(5_000);
  });
});
