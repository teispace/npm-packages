import { expect, type Harness, test } from './fixtures';

const columns = (tei: Harness) => tei.content.locator('.tei-columns');
const column = (tei: Harness) => tei.content.locator('.tei-column');
const control = (tei: Harness) => tei.content.locator('[data-tei-columns-control]');
const columnsMenu = (tei: Harness) => tei.page.locator('[data-tei-control="columns-menu"]');
const slash = (tei: Harness) => tei.page.locator('[data-tei-control="slash-menu"]');

const TWO =
  '<div data-tei-columns="1fr 2fr"><div data-tei-column="1"><p>Narrow</p></div><div data-tei-column="2"><p>Wide</p></div></div><p>After</p>';

async function open(tei: Harness, content: string, width = 900) {
  await tei.page.setViewportSize({ width, height: 700 });
  await tei.open({ content, flags: ['columns', 'plain'] });
}

/** Put the caret at the end of the block whose text is `text`. */
const caretAtEndOf = (tei: Harness, text: string) =>
  tei.content.evaluate((root, wanted) => {
    const block = [...root.querySelectorAll('p, li')].find((b) => b.textContent === wanted);
    if (!block) throw new Error(`no block ${wanted}`);
    (root as HTMLElement).focus();
    getSelection()?.selectAllChildren(block);
    getSelection()?.collapseToEnd();
  }, text);

/** The text of the block the caret is in, or `null` when the editor is not focused. */
const caretIn = (tei: Harness) =>
  tei.page.evaluate(() => {
    const root = document.querySelector('[data-tei-content]');
    const node = getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return document.activeElement === root ? (element?.closest('p')?.textContent ?? '') : null;
  });

test.describe('columns', () => {
  test('from the slash menu: Tab to the next column, Enter stays, ArrowDown leaves', async ({
    tei,
  }) => {
    await open(tei, '<p>Intro</p>');
    await caretAtEndOf(tei, 'Intro');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/columns');
    await expect(slash(tei).getByRole('menuitem').first()).toContainText('2 columns');
    await tei.page.keyboard.press('Enter');
    await expect(column(tei)).toHaveCount(2);
    await tei.page.keyboard.type('Left');
    await tei.page.keyboard.press('Tab');
    await tei.page.keyboard.type('Right');
    // Tab in the last column stays there.
    await tei.page.keyboard.press('Tab');
    await expect(tei.content).toBeFocused();
    // An empty last line: Enter stays in the column.
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('More');
    await expect(column(tei).nth(1).locator('p')).toHaveCount(3);
    await expect(column(tei).nth(1).locator('p').last()).toHaveText('More');
    await tei.page.keyboard.press('ArrowDown');
    await tei.page.keyboard.type('Below');
    expect(await tei.html()).toMatch(
      /^<p>Intro<\/p><div data-tei-columns="1fr 1fr"><div data-tei-column="1"><p>Left<\/p><\/div><div data-tei-column="1"><p>Right<\/p><p><br><\/p><p>More<\/p><\/div><\/div><p>Below<\/p>/,
    );
  });

  test('Shift-Tab steps back a column, its caret at the end', async ({ tei }) => {
    await open(tei, TWO);
    await caretAtEndOf(tei, 'Wide');
    await tei.page.keyboard.press('Shift+Tab');
    expect(await caretIn(tei)).toBe('Narrow');
    await tei.page.keyboard.type('!');
    await expect(column(tei).first()).toHaveText('Narrow!');
  });

  test('each column takes its share of the row; saved, the same boxes', async ({ tei }) => {
    await open(tei, TWO);
    const [narrow, wide] = await column(tei).evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
    );
    if (!narrow || !wide) throw new Error('not rendered');
    expect(Math.abs(narrow.y - wide.y)).toBeLessThan(1);
    expect(wide.width / narrow.width).toBeGreaterThan(1.8);
    expect(wide.width / narrow.width).toBeLessThan(2.05);
    // The saved HTML in a page as wide as the document, styled by `.tei-prose`: the same boxes.
    const saved = await tei.page.evaluate(
      (html) => {
        const content = document.querySelector('[data-tei-content]') as HTMLElement;
        const css = getComputedStyle(content);
        const inner =
          content.clientWidth -
          Number.parseFloat(css.paddingLeft) -
          Number.parseFloat(css.paddingRight);
        const page = document.createElement('div');
        page.className = 'tei-prose';
        page.style.setProperty('inline-size', `${inner}px`);
        page.innerHTML = window.__tei.trust(html);
        content.closest('.tei')?.append(page);
        const boxes = [...page.querySelectorAll('[data-tei-column]')].map((el) => {
          const box = el.getBoundingClientRect();
          return [box.width, box.height];
        });
        page.remove();
        return boxes;
      },
      await tei.html(),
    );
    const editor = await column(tei).evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        return [box.width, box.height];
      }),
    );
    expect(saved).toHaveLength(2);
    saved.forEach(([width, height], i) => {
      expect(Math.abs(width - (editor[i]?.[0] ?? 0))).toBeLessThan(0.5);
      expect(Math.abs(height - (editor[i]?.[1] ?? 0))).toBeLessThan(0.5);
    });
  });

  test('on a phone the columns stack', async ({ tei }) => {
    await open(tei, TWO, 375);
    const [narrow, wide] = await column(tei).evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
    );
    if (!narrow || !wide) throw new Error('not rendered');
    expect(Math.abs(narrow.x - wide.x)).toBeLessThan(1);
    expect(Math.abs(narrow.width - wide.width)).toBeLessThan(1);
    expect(wide.y).toBeGreaterThanOrEqual(narrow.y + narrow.height);
  });

  test('ArrowRight at the end of the last column goes on after the block', async ({ tei }) => {
    await open(tei, TWO);
    await caretAtEndOf(tei, 'Wide');
    await tei.page.keyboard.press('ArrowRight');
    await tei.page.keyboard.type('X');
    await expect(tei.content.locator(':scope > p')).toHaveText('XAfter');
  });

  test('the control shows on hover, and its menu changes the layout', async ({ tei }) => {
    await open(tei, TWO);
    await expect(control(tei)).toBeHidden();
    await columns(tei).hover();
    await expect(control(tei)).toBeVisible();
    await control(tei).click();
    const menu = columnsMenu(tei);
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole('menuitemradio', { name: '2 columns: narrow, wide' }),
    ).toHaveAttribute('aria-checked', 'true');
    await menu.getByRole('menuitemradio', { name: '3 columns', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(column(tei)).toHaveCount(3);
    expect(await tei.html()).toMatch(/^<div data-tei-columns="1fr 1fr 1fr">/);
    // The menu put the caret in the block it was for.
    expect(await caretIn(tei)).toBe('Narrow');
  });

  test('the context menu in a column has the columns menu, in a submenu', async ({ tei }) => {
    await open(tei, TWO);
    await caretAtEndOf(tei, 'Wide');
    const text = await column(tei).nth(1).locator('p').boundingBox();
    if (!text) throw new Error('not rendered');
    await tei.page.mouse.click(text.x + 2, text.y + text.height / 2, { button: 'right' });
    const menu = tei.page.getByRole('menu', { name: 'Edit' });
    await menu.locator('[data-id="columnsMenu"]').click();
    const sub = tei.page.getByRole('menu', { name: 'Columns' });
    await sub.getByRole('menuitem', { name: 'Turn into blocks' }).click();
    await expect(columns(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Narrow</p><p>Wide</p><p>After</p>');
  });

  test('a tap in a column shows its control; a tap on it opens the menu @mobile', async ({
    tei,
  }) => {
    await tei.open({ content: TWO, flags: ['columns', 'plain'] });
    await column(tei).first().locator('p').tap();
    await expect(control(tei)).toBeVisible();
    await control(tei).tap();
    await expect(columnsMenu(tei)).toBeVisible();
    await columnsMenu(tei).getByRole('menuitem', { name: 'Add column' }).tap();
    await expect(column(tei)).toHaveCount(3);
  });
});
