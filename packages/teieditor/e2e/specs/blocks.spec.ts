import type { Locator } from '@playwright/test';
import { expect, type Harness, settled, test } from './fixtures';

const DOC =
  '<h2>Plan</h2><p>First</p><ul><li>One</li><li>Two<ul><li>Two a</li></ul></li><li>Three</li></ul><p>Last</p>';

const handle = (tei: Harness) => tei.page.locator('[data-tei-control="block-handle"]');
const grip = (tei: Harness) => tei.page.locator('[data-tei-control="block-grip"]');
const add = (tei: Harness) => tei.page.locator('[data-tei-control="block-add"]');
const line = (tei: Harness) => tei.page.locator('[data-tei-control="block-drop"]');
const ghost = (tei: Harness) => tei.page.locator('[data-tei-control="block-ghost"]');
const menu = (tei: Harness) => tei.page.locator('[data-tei-control="block-menu"]');
const block = (tei: Harness, text: string) =>
  tei.content
    .locator('h2, p, li:not(:has(> ul, > ol))')
    .filter({ hasText: new RegExp(`^${text}$`) });

/** The document, a line per block: its tag (a list item's list's), indented by nesting. */
const outline = (tei: Harness) =>
  tei.content.evaluate((root) => {
    const lines: string[] = [];
    const walk = (el: Element, depth: number) => {
      for (const child of el.children) {
        if (child.tagName === 'UL' || child.tagName === 'OL') walk(child, depth + 1);
        else if (child.tagName === 'LI' && child.firstElementChild?.matches('ul, ol')) {
          walk(child, depth);
        } else {
          const tag = child.tagName === 'LI' ? (child.parentElement?.tagName ?? '') : child.tagName;
          lines.push(
            `${'  '.repeat(Math.max(depth - 1, 0))}${tag.toLowerCase()} ${child.textContent}`,
          );
        }
      }
    };
    walk(root, 0);
    return lines;
  });

async function open(tei: Harness, flags: string[] = []) {
  await tei.page.setViewportSize({ width: 900, height: 700 });
  await tei.open({ content: DOC, flags: ['blocks', 'plain', ...flags] });
}

/** Point at a block, and wait for its handle: level with its first line. */
async function hover(tei: Harness, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error('no block');
  await tei.page.mouse.move(box.x + 20, box.y + box.height / 2);
  await expect(async () => {
    const at = await grip(tei).boundingBox();
    expect(at).not.toBeNull();
    const middle = (at?.y ?? 0) + (at?.height ?? 0) / 2;
    expect(middle).toBeGreaterThan(box.y);
    expect(middle).toBeLessThan(box.y + Math.min(box.height, 32));
  }).toPass();
}

/** Press the handle of `from` and drag it to `place` of `to`; `drop: false` stops before letting go. */
async function drag(
  tei: Harness,
  from: Locator,
  to: Locator,
  place: 'before' | 'after',
  { drop = true } = {},
) {
  await hover(tei, from);
  const at = await grip(tei).boundingBox();
  const box = await to.boundingBox();
  if (!at || !box) throw new Error('nothing to drag');
  await tei.page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await tei.page.mouse.down();
  const y = box.y + box.height * (place === 'before' ? 0.25 : 0.75);
  await tei.page.mouse.move(at.x + 40, y, { steps: 8 });
  await expect(line(tei)).toBeVisible();
  if (drop) await tei.page.mouse.up();
}

test.describe('block handle', () => {
  test('follows the pointer, level with each block, and stays on the way to it', async ({
    tei,
  }) => {
    await open(tei);
    await expect(handle(tei)).toHaveCount(0);
    await hover(tei, block(tei, 'First'));
    await hover(tei, block(tei, 'Two a'));
    // Its edge clears the list's markers.
    const item = await block(tei, 'Two a').boundingBox();
    const at = await handle(tei).boundingBox();
    expect((at?.x ?? 0) + (at?.width ?? 0)).toBeLessThan((item?.x ?? 0) - 12);
    // Over the gutter to the handle: it stays.
    await grip(tei).hover();
    await tei.page.waitForTimeout(300);
    await expect(handle(tei)).toBeVisible();
    // Away from the editor: it goes.
    await tei.page.mouse.move(5, 690);
    await expect(handle(tei)).toHaveCount(0);
  });

  test('reserves its gutter: content never shifts as it shows', async ({ tei }) => {
    await open(tei);
    const before = await block(tei, 'First').boundingBox();
    await hover(tei, block(tei, 'First'));
    expect(await block(tei, 'First').boundingBox()).toEqual(before);
    const frame = await tei.page.getByTestId('editor').boundingBox();
    const at = await handle(tei).boundingBox();
    expect(at?.x).toBeGreaterThanOrEqual(frame?.x ?? 0);
  });

  test('drags a paragraph below the last block, showing a line and a still copy', async ({
    tei,
  }) => {
    await open(tei);
    await drag(tei, block(tei, 'First'), block(tei, 'Last'), 'after', { drop: false });
    await expect(block(tei, 'First')).toHaveAttribute('data-tei-dragging', '');
    await expect(ghost(tei)).toContainText('First');
    await expect(ghost(tei).locator('[contenteditable]')).toHaveCount(0);
    // The line sits under "Last".
    const last = await block(tei, 'Last').boundingBox();
    const at = await line(tei).boundingBox();
    expect(Math.abs((at?.y ?? 0) - ((last?.y ?? 0) + (last?.height ?? 0)))).toBeLessThan(6);
    await tei.page.mouse.up();
    await expect(line(tei)).toHaveCount(0);
    await expect(ghost(tei)).toHaveCount(0);
    expect(await outline(tei)).toEqual([
      'h2 Plan',
      'ul One',
      'ul Two',
      '  ul Two a',
      'ul Three',
      'p Last',
      'p First',
    ]);
    // No menu from the click that ends a drag, and the moved block keeps the caret.
    await expect(menu(tei)).toHaveCount(0);
    await expect(block(tei, 'First')).not.toHaveAttribute('data-tei-dragging');
    // The caret at its start.
    await tei.page.keyboard.type('!');
    await expect(block(tei, '!First')).toHaveCount(1);
  });

  test('reorders list items, and an item takes its nested items with it', async ({ tei }) => {
    await open(tei);
    await drag(tei, block(tei, 'Two'), block(tei, 'Three'), 'after');
    expect(await outline(tei)).toEqual([
      'h2 Plan',
      'p First',
      'ul One',
      'ul Three',
      'ul Two',
      '  ul Two a',
      'p Last',
    ]);
  });

  test('a paragraph into a list becomes an item; an item out of it, its own list', async ({
    tei,
  }) => {
    await open(tei);
    await drag(tei, block(tei, 'First'), block(tei, 'One'), 'after');
    expect(await outline(tei)).toEqual([
      'h2 Plan',
      'ul One',
      'p First',
      'ul Two',
      '  ul Two a',
      'ul Three',
      'p Last',
    ]);
    await drag(tei, block(tei, 'Three'), block(tei, 'Plan'), 'before');
    expect(await outline(tei)).toEqual([
      'ul Three',
      'h2 Plan',
      'ul One',
      'p First',
      'ul Two',
      '  ul Two a',
      'p Last',
    ]);
  });

  test('no drop among its own nested items, and one undo puts it back', async ({ tei }) => {
    await open(tei);
    const start = await outline(tei);
    await hover(tei, block(tei, 'Two'));
    const at = await grip(tei).boundingBox();
    const nested = await block(tei, 'Two a').boundingBox();
    if (!at || !nested) throw new Error('nothing to drag');
    await tei.page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await tei.page.mouse.down();
    await tei.page.mouse.move(at.x + 40, nested.y + nested.height * 0.75, { steps: 8 });
    await expect(block(tei, 'Two')).toHaveAttribute('data-tei-dragging', '');
    await expect(line(tei)).toHaveCount(0);
    await tei.page.mouse.up();
    expect(await outline(tei)).toEqual(start);
    await drag(tei, block(tei, 'Plan'), block(tei, 'Last'), 'after');
    expect((await outline(tei)).at(-1)).toBe('h2 Plan');
    await tei.page.keyboard.press('ControlOrMeta+z');
    expect(await outline(tei)).toEqual(start);
  });

  test('Escape cancels a drag, and letting go then moves nothing', async ({ tei }) => {
    await open(tei);
    const start = await outline(tei);
    await drag(tei, block(tei, 'First'), block(tei, 'Last'), 'after', { drop: false });
    await tei.page.keyboard.press('Escape');
    await expect(line(tei)).toHaveCount(0);
    await expect(ghost(tei)).toHaveCount(0);
    await expect(tei.content.locator('[data-tei-dragging]')).toHaveCount(0);
    await tei.page.mouse.up();
    expect(await outline(tei)).toEqual(start);
    await expect(menu(tei)).toHaveCount(0);
  });

  test('scrolls the page while a block is held near its edge', async ({ tei, page }) => {
    await page.setViewportSize({ width: 900, height: 400 });
    await tei.open({ content: DOC, flags: ['blocks', 'plain', 'tall'] });
    await hover(tei, block(tei, 'First'));
    const at = await grip(tei).boundingBox();
    if (!at) throw new Error('no grip');
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + 40, 398, { steps: 6 });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(40);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  });

  test('a click opens its menu: turn into, duplicate, move, delete', async ({ tei }) => {
    await open(tei);
    await hover(tei, block(tei, 'First'));
    await grip(tei).click();
    await expect(menu(tei)).toBeVisible();
    await expect(grip(tei)).toHaveAttribute('aria-expanded', 'true');
    await expect(block(tei, 'First')).toHaveAttribute('data-tei-block-selected', '');
    // The handle stays on its block while the menu is open.
    await tei.page.mouse.move(5, 690);
    await tei.page.waitForTimeout(300);
    await expect(handle(tei)).toBeVisible();
    await menu(tei).locator('[data-id="duplicateBlock"]').click();
    await expect(menu(tei)).toHaveCount(0);
    await expect(block(tei, 'First')).toHaveCount(2);

    await hover(tei, block(tei, 'Last'));
    await grip(tei).click();
    const turnInto = menu(tei).locator('[data-id="turnInto"]');
    const types = tei.page.getByRole('menu', { name: 'Turn into' });
    await turnInto.click();
    await types.getByRole('menuitemradio', { name: 'Heading 1' }).click();
    expect((await outline(tei)).at(-1)).toBe('h1 Last');
    // Its icon is what the block is now.
    await hover(tei, tei.content.locator('h1'));
    await grip(tei).click();
    await turnInto.click();
    const now = types.getByRole('menuitemradio', { name: 'Heading 1' });
    await expect(now).toHaveAttribute('aria-checked', 'true');
    const icon = (row: Locator) => row.locator('svg').first().innerHTML();
    expect(await icon(turnInto)).toBe(await icon(now));
    await tei.page.keyboard.press('Escape');
    await tei.page.keyboard.press('Escape');

    await hover(tei, block(tei, 'Plan'));
    await grip(tei).click();
    await menu(tei).locator('[data-id="moveBlockDown"]').click();
    expect((await outline(tei)).slice(0, 2)).toEqual(['p First', 'h2 Plan']);

    await hover(tei, block(tei, 'Plan'));
    await grip(tei).click();
    await expect(menu(tei).locator('[data-id="deleteBlock"]')).toHaveAttribute(
      'data-variant',
      'danger',
    );
    await menu(tei).locator('[data-id="deleteBlock"]').click();
    await expect(block(tei, 'Plan')).toHaveCount(0);
  });

  test('the menu by keyboard: Escape closes it and gives the editor back', async ({ tei }) => {
    await open(tei);
    await hover(tei, block(tei, 'Three'));
    await grip(tei).focus();
    await tei.page.keyboard.press('Enter');
    await expect(menu(tei)).toBeVisible();
    await expect(menu(tei).getByRole('menu')).toBeFocused();
    await tei.page.keyboard.press('ArrowDown');
    await tei.page.keyboard.press('Enter');
    await expect(menu(tei)).toHaveCount(0);
    await expect(block(tei, 'Three')).toHaveCount(2);
    await hover(tei, block(tei, 'First'));
    await grip(tei).click();
    await tei.page.keyboard.press('Escape');
    await expect(menu(tei)).toHaveCount(0);
    await expect(tei.content).toBeFocused();
    await expect(tei.content.locator('[data-tei-block-selected]')).toHaveCount(0);
  });

  test('+ adds a block after with the slash menu open; Alt-click, before', async ({ tei }) => {
    await open(tei);
    await hover(tei, block(tei, 'First'));
    await add(tei).click();
    const slash = tei.page.locator('[data-tei-control="slash-menu"]');
    await expect(slash).toBeVisible();
    expect((await outline(tei)).slice(1, 3)).toEqual(['p First', 'p /']);
    await tei.page.keyboard.press('Escape');
    await hover(tei, block(tei, 'Plan'));
    await add(tei).click({ modifiers: ['Alt'] });
    await expect(slash).toBeVisible();
    expect((await outline(tei))[0]).toBe('p /');
  });

  test('keyboard moves and duplicates the caret’s block', async ({ tei }) => {
    await open(tei);
    await block(tei, 'First').click();
    await tei.page.keyboard.press('ControlOrMeta+Shift+ArrowUp');
    expect((await outline(tei)).slice(0, 2)).toEqual(['p First', 'h2 Plan']);
    await tei.page.keyboard.press('ControlOrMeta+Shift+ArrowDown');
    await tei.page.keyboard.press('ControlOrMeta+Shift+ArrowDown');
    expect((await outline(tei)).slice(1, 3)).toEqual(['ul One', 'p First']);
    await tei.page.keyboard.press('ControlOrMeta+d');
    await expect(block(tei, 'First')).toHaveCount(2);
    // The caret is in the copy, where it was.
    await tei.page.keyboard.type('!');
    expect((await outline(tei)).slice(1, 4)).toEqual(['ul One', 'p First', 'p First!']);
  });

  test('right to left: the handle at the right, the menu under it', async ({ tei }) => {
    await tei.page.setViewportSize({ width: 900, height: 700 });
    await tei.open({ content: '<p>שלום עולם</p><p>טקסט</p>', flags: ['blocks', 'plain', 'rtl'] });
    const first = block(tei, 'שלום עולם');
    await hover(tei, first);
    const box = await first.boundingBox();
    const at = await handle(tei).boundingBox();
    expect(at?.x).toBeGreaterThan((box?.x ?? 0) + (box?.width ?? 0) - 4);
    await grip(tei).click();
    await settled(tei.page);
    const list = await menu(tei).boundingBox();
    const g = await grip(tei).boundingBox();
    // bottom-end: their right edges line up.
    expect(
      Math.abs((list?.x ?? 0) + (list?.width ?? 0) - ((g?.x ?? 0) + (g?.width ?? 0))),
    ).toBeLessThan(2);
  });

  test('read-only: no handle', async ({ tei }) => {
    await open(tei);
    await tei.page.evaluate(() => window.__tei.editor.setEditable(false));
    const box = await block(tei, 'First').boundingBox();
    await tei.page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + 5);
    await tei.page.waitForTimeout(300);
    await expect(handle(tei)).toHaveCount(0);
  });

  test('on a phone, the caret’s block has the handle, and a tap opens its menu @mobile', async ({
    tei,
  }) => {
    await tei.open({ content: DOC, flags: ['blocks', 'plain'] });
    await expect(handle(tei)).toHaveCount(0);
    await block(tei, 'Three').tap();
    await expect(handle(tei)).toBeVisible();
    // No room for + beside it on a phone.
    await expect(add(tei)).toBeHidden();
    await settled(tei.page);
    const at = await grip(tei).boundingBox();
    expect(at?.width).toBeGreaterThanOrEqual(24);
    await grip(tei).tap();
    await expect(menu(tei)).toBeVisible();
    const list = await menu(tei).boundingBox();
    const width = tei.page.viewportSize()?.width ?? 0;
    expect((list?.x ?? 0) + (list?.width ?? 0)).toBeLessThanOrEqual(width);
    await menu(tei).locator('[data-id="moveBlockUp"]').tap();
    expect(await outline(tei)).toEqual([
      'h2 Plan',
      'p First',
      'ul One',
      'ul Three',
      'ul Two',
      '  ul Two a',
      'p Last',
    ]);
  });
});
