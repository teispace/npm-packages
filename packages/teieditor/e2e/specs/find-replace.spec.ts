import { expect, type Harness, settled, test } from './fixtures';

const bar = (tei: Harness) => tei.page.locator('[data-tei-control="find-replace"]');
const field = (tei: Harness) => bar(tei).getByLabel('Find', { exact: true });
const status = (tei: Harness) => bar(tei).locator('.tei-find-status');

const TEXT = '<p>he<strong>llo</strong> world</p><p>say hello</p>';

async function open(tei: Harness, content = TEXT, flags: string[] = []) {
  await tei.page.setViewportSize({ width: 900, height: 700 });
  await tei.open({ content, flags: ['find', 'plain', ...flags] });
}

/** Sizes of the find highlights; `null` where the browser has no Highlight API. */
const painted = (tei: Harness) =>
  tei.page.evaluate(() => {
    const registry = (globalThis as unknown as { CSS?: { highlights?: Map<string, Set<Range>> } })
      .CSS?.highlights;
    if (!registry || typeof (globalThis as { Highlight?: unknown }).Highlight === 'undefined')
      return null;
    const current = [...(registry.get('tei-find-current') ?? [])];
    return {
      all: registry.get('tei-find')?.size ?? 0,
      current: current.map((range) => range.toString()),
    };
  });

/** The editor's selected text, if the editor has focus. */
const selected = (tei: Harness) =>
  tei.page.evaluate(() => {
    const root = document.querySelector('[data-tei-content]');
    return document.activeElement === root ? (getSelection()?.toString() ?? '') : null;
  });

test.describe('find and replace', () => {
  test('⌘F opens the bar; it finds across formatting and Enter steps on', async ({ tei }) => {
    await open(tei);
    const before = await tei.html();
    await tei.caretAtEnd();
    await tei.page.keyboard.press('ControlOrMeta+f');
    await expect(bar(tei)).toBeVisible();
    await expect(field(tei)).toBeFocused();
    await tei.page.keyboard.type('hello');
    await expect(status(tei)).toHaveText('1 of 2');
    const paint = await painted(tei);
    if (paint) expect(paint).toEqual({ all: 2, current: ['hello'] });
    await tei.page.keyboard.press('Enter');
    await expect(status(tei)).toHaveText('2 of 2');
    // Stepping never takes focus from the field.
    await expect(field(tei)).toBeFocused();
    await tei.page.keyboard.press('Shift+Enter');
    await expect(status(tei)).toHaveText('1 of 2');
    // Nothing was written into the document.
    expect(await tei.html()).toBe(before);
    await expect(tei.content.locator('mark')).toHaveCount(0);
  });

  test('Escape closes it and selects the current match', async ({ tei }) => {
    await open(tei);
    await tei.caretAtEnd();
    await tei.page.keyboard.press('ControlOrMeta+f');
    await tei.page.keyboard.type('world');
    await expect(status(tei)).toHaveText('1 of 1');
    await tei.page.keyboard.press('Escape');
    await expect(bar(tei)).toHaveCount(0);
    await expect.poll(() => selected(tei)).toBe('world');
    await tei.page.keyboard.type('there');
    expect(await tei.text()).toBe('hello there\n\nsay hello');
    if (await painted(tei)) expect(await painted(tei)).toEqual({ all: 0, current: [] });
  });

  test('replace one, then all, as one undo step', async ({ tei }) => {
    await open(tei, '<p>cat cat</p><p>a <em>c</em>at</p>');
    await tei.caretAtEnd();
    await tei.page.keyboard.press('ControlOrMeta+f');
    await tei.page.keyboard.type('cat');
    await expect(status(tei)).toHaveText('1 of 3');
    await bar(tei).getByRole('button', { name: 'Toggle replace' }).click();
    const replace = bar(tei).getByLabel('Replace with');
    await expect(replace).toBeFocused();
    await tei.page.keyboard.type('dog');
    await tei.page.keyboard.press('Enter');
    expect(await tei.text()).toBe('dog cat\n\na cat');
    await expect(status(tei)).toHaveText('1 of 2');
    await expect(replace).toBeFocused();
    await bar(tei).getByRole('button', { name: 'Replace all' }).click();
    expect(await tei.text()).toBe('dog dog\n\na dog');
    await expect(status(tei)).toHaveText('No results');
    // The first node's formatting: the italic `c` became an italic `dog`.
    await expect(tei.content.locator('em')).toHaveText('dog');
    await bar(tei).getByRole('button', { name: 'Close' }).click();
    await tei.page.keyboard.press('ControlOrMeta+z');
    expect(await tei.text()).toBe('dog cat\n\na cat');
  });

  test('regular expressions: groups in the replacement, bad ones say so', async ({ tei }) => {
    await open(tei, '<p>Smith, John</p>');
    await tei.caretAtEnd();
    await tei.page.keyboard.press('ControlOrMeta+f');
    await bar(tei).getByRole('button', { name: 'Use regular expression' }).click();
    await expect(bar(tei).getByRole('button', { name: 'Use regular expression' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await field(tei).fill('(\\w+');
    await expect(status(tei)).toHaveText('Invalid regular expression');
    await expect(field(tei)).toHaveAttribute('aria-invalid', 'true');
    await field(tei).fill('(\\w+), (\\w+)');
    await expect(status(tei)).toHaveText('1 of 1');
    await bar(tei).getByRole('button', { name: 'Toggle replace' }).click();
    await bar(tei).getByLabel('Replace with').fill('$2 $1');
    await bar(tei).getByRole('button', { name: 'Replace all' }).click();
    expect(await tei.text()).toBe('John Smith');
  });

  test('a match in a closed section opens it', async ({ tei }) => {
    await open(tei, '<p>key</p><details><summary>More</summary><p>hidden key</p></details>', [
      'extras',
    ]);
    const body = tei.content.locator('[data-tei-collapsible-content]');
    await expect(body).toBeHidden();
    await tei.caretAtEnd();
    await tei.page.keyboard.press('ControlOrMeta+f');
    await tei.page.keyboard.type('key');
    await expect(status(tei)).toHaveText('1 of 2');
    await tei.page.keyboard.press('Enter');
    await expect(status(tei)).toHaveText('2 of 2');
    await expect(body).toBeVisible();
    await expect(field(tei)).toBeFocused();
  });

  test('it sits in the document’s top inline-end corner, and fits a phone', async ({ tei }) => {
    await open(tei);
    await tei.caretAtEnd();
    await tei.page.keyboard.press('ControlOrMeta+f');
    await settled(tei.page);
    const doc = await tei.content.boundingBox();
    const box = await bar(tei).boundingBox();
    if (!doc || !box) throw new Error('not rendered');
    expect(Math.abs(doc.x + doc.width - (box.x + box.width))).toBeLessThan(16);
    expect(box.y).toBeGreaterThanOrEqual(doc.y - 1);
    expect(box.y).toBeLessThan(doc.y + 24);

    await tei.page.setViewportSize({ width: 375, height: 700 });
    await settled(tei.page);
    const narrow = await bar(tei).boundingBox();
    if (!narrow) throw new Error('not rendered');
    expect(narrow.x).toBeGreaterThanOrEqual(0);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(375);
    const overflow = await tei.page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('right to left: the top-left corner', async ({ tei }) => {
    await open(tei, '<p>שלום עולם</p>', ['rtl']);
    await tei.caretAtEnd();
    await tei.page.keyboard.press('ControlOrMeta+f');
    await settled(tei.page);
    const doc = await tei.content.boundingBox();
    const box = await bar(tei).boundingBox();
    if (!doc || !box) throw new Error('not rendered');
    expect(Math.abs(box.x - doc.x)).toBeLessThan(16);
  });
});
