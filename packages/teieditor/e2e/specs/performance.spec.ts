import { expect, settled, test } from './fixtures';

/**
 * A long document stays quick to type in: 10,000 paragraphs, every
 * extension the harness installs, and the full UI. Chromium only, for the
 * Event Timing API: each key's entry spans from the key to the frame that
 * shows it, so it is the latency a person feels.
 */
const PARAGRAPHS = 10_000;

test.describe('performance', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Event Timing is Chromium’s');

  test('typing in a 10,000-paragraph document stays within a frame or two', async ({ tei }) => {
    test.setTimeout(120_000);
    await tei.open();
    const loadMs = await tei.page.evaluate((count) => {
      const html = Array.from(
        { length: count },
        (_, i) => `<p>Paragraph ${i + 1}: the quick brown fox jumps over the lazy dog.</p>`,
      ).join('');
      const start = performance.now();
      window.__tei.editor.setContent(html);
      return performance.now() - start;
    }, PARAGRAPHS);
    await settled(tei.page);
    expect(await tei.content.locator('p').count()).toBe(PARAGRAPHS);

    // Into the middle of the document, where every block around is live.
    await tei.content
      .locator('p')
      .nth(PARAGRAPHS / 2)
      .click();
    await tei.page.keyboard.press('End');
    await settled(tei.page);

    await tei.page.evaluate(() => {
      const entries: number[] = [];
      (window as unknown as { __latency: number[] }).__latency = entries;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'keydown') {
            entries.push(entry.duration);
          }
        }
      }).observe({
        type: 'event',
        durationThreshold: 16,
        buffered: false,
      } as PerformanceObserverInit);
    });
    const text = ' typed while the document is long';
    await tei.page.keyboard.type(text, { delay: 40 });
    await settled(tei.page);
    expect(
      await tei.content
        .locator('p')
        .nth(PARAGRAPHS / 2)
        .textContent(),
    ).toContain(text.trim());

    // Only keys over 16ms are reported; the rest were within a frame.
    const slow = await tei.page.evaluate(
      () => (window as unknown as { __latency: number[] }).__latency,
    );
    const sorted = [...slow].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(text.length * 0.95) - (text.length - sorted.length)] ?? 0;
    console.log(
      `10k paragraphs: set in ${Math.round(loadMs)}ms; ${slow.length}/${text.length} keys over 16ms, p95 ${p95}ms, max ${sorted.at(-1) ?? 0}ms`,
    );
    // Two frames at 60 Hz, at the 95th percentile, and no key that feels stuck.
    expect(p95).toBeLessThanOrEqual(33);
    expect(sorted.at(-1) ?? 0).toBeLessThan(100);
    expect(loadMs).toBeLessThan(5_000);
  });
});
