import { expect, type Harness, test } from './fixtures';

const card = (tei: Harness) => tei.content.locator('.tei-card');
const sticky = (tei: Harness) => tei.content.locator('.tei-sticky');
const swatch = (tei: Harness) => tei.content.locator('[data-tei-sticky-swatch]');
const slash = (tei: Harness) => tei.page.locator('[data-tei-control="slash-menu"]');

const CARD = '<div data-tei-card="default"><p>Card text</p></div><p>After</p>';
const LONG =
  'A paragraph long enough to wrap beside a note on a wide page, and to run on under it once it ends, as text does around a float. '.repeat(
    3,
  );
const NOTE = `<aside data-tei-sticky="yellow"><p>Remember</p><ul><li>milk</li></ul></aside><p>${LONG}</p>`;

async function open(tei: Harness, content: string, { width = 900, flags = [] as string[] } = {}) {
  await tei.page.setViewportSize({ width, height: 700 });
  await tei.open({ content, flags: ['cards', 'plain', ...flags] });
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

/** Right-click inside the text of the block whose text is `text`, with the caret there. */
async function contextMenuOn(tei: Harness, text: string) {
  await caretAtEndOf(tei, text);
  const box = await tei.content.locator('p', { hasText: text }).first().boundingBox();
  if (!box) throw new Error('not rendered');
  await tei.page.mouse.click(box.x + 4, box.y + box.height / 2, { button: 'right' });
  return tei.page.getByRole('menu', { name: 'Edit' });
}

test.describe('card', () => {
  test('the slash menu sets the line in a card; Enter on an empty last line steps out', async ({
    tei,
  }) => {
    await open(tei, '<p>Intro</p>');
    await caretAtEndOf(tei, 'Intro');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/card');
    await expect(slash(tei).getByRole('menuitem').first()).toContainText('Card');
    await tei.page.keyboard.press('Enter');
    await expect(card(tei)).toHaveAttribute('data-variant', 'default');
    await tei.page.keyboard.type('Inside');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Out');
    expect(await tei.html()).toBe(
      '<p>Intro</p><div data-tei-card="default"><p>Inside</p></div><p>Out</p>',
    );
  });

  test('the context menu changes its look and accent, in a submenu', async ({ tei }) => {
    await open(tei, CARD);
    const shadow = () => card(tei).evaluate((el) => getComputedStyle(el).boxShadow);
    expect(await shadow()).not.toBe('none');
    let menu = await contextMenuOn(tei, 'Card text');
    await menu.locator('[data-id="cardMenu"]').click();
    await tei.page
      .getByRole('menu', { name: 'Card' })
      .getByRole('menuitemradio', { name: 'Outlined' })
      .click();
    await expect(card(tei)).toHaveAttribute('data-variant', 'outlined');
    expect(await shadow()).toBe('none');
    menu = await contextMenuOn(tei, 'Card text');
    await menu.locator('[data-id="cardMenu"]').click();
    await tei.page
      .getByRole('menu', { name: 'Card' })
      .getByRole('menuitemradio', { name: 'Blue accent' })
      .click();
    await expect(card(tei)).toHaveAttribute('data-accent', 'blue');
    const edges = await card(tei).evaluate((el) => {
      const css = getComputedStyle(el);
      return { start: css.borderInlineStartWidth, top: css.borderTopWidth };
    });
    expect(Number.parseFloat(edges.start)).toBeGreaterThan(Number.parseFloat(edges.top));
    expect(await tei.html()).toBe(
      '<div data-tei-card="outlined" data-tei-card-accent="blue"><p>Card text</p></div><p>After</p>',
    );
    // Outside a card the submenu is not offered.
    menu = await contextMenuOn(tei, 'After');
    await expect(menu.locator('[data-id="cardMenu"]')).toHaveCount(0);
  });

  test('Backspace at the start of its first line takes it away, keeping the text', async ({
    tei,
  }) => {
    await open(tei, CARD);
    await tei.content.evaluate((root) => {
      const text = root.querySelector('.tei-card p');
      (root as HTMLElement).focus();
      if (text) getSelection()?.collapse(text, 0);
    });
    await tei.page.keyboard.press('Backspace');
    await expect(card(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Card text</p><p>After</p>');
  });
});

test.describe('sticky note', () => {
  test('from the slash menu: a note to type in; Enter on an empty line leaves it', async ({
    tei,
  }) => {
    await open(tei, '<p>Intro</p>');
    await caretAtEndOf(tei, 'Intro');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/sticky');
    await expect(slash(tei).getByRole('menuitem').first()).toContainText('Sticky note');
    await tei.page.keyboard.press('Enter');
    await expect(sticky(tei)).toHaveAttribute('data-color', 'yellow');
    await tei.page.keyboard.type('Buy bread');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Out');
    expect(await tei.html()).toBe(
      '<p>Intro</p><aside data-tei-sticky="yellow" role="note"><p>Buy bread</p></aside><p>Out</p>',
    );
  });

  test('on a wide page it sits at the end, the text beside it; narrow, it is full width', async ({
    tei,
  }) => {
    await open(tei, NOTE);
    const content = await tei.content.boundingBox();
    const note = await sticky(tei).boundingBox();
    const text = await tei.content.locator(':scope > p').boundingBox();
    if (!content || !note || !text) throw new Error('not rendered');
    // Narrower than half the page, at its end (allowing for the tilt).
    expect(note.width).toBeLessThan(content.width / 2);
    expect(content.x + content.width - (note.x + note.width)).toBeLessThan(40);
    // The paragraph starts beside it, not under it.
    expect(text.y).toBeLessThan(note.y + note.height / 2);

    await tei.page.setViewportSize({ width: 420, height: 700 });
    await expect
      .poll(async () => {
        const narrow = await sticky(tei).boundingBox();
        const line = await tei.content.locator(':scope > p').boundingBox();
        return narrow && line ? Math.abs(narrow.width - line.width) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThan(2);
    const narrow = await sticky(tei).boundingBox();
    const below = await tei.content.locator(':scope > p').boundingBox();
    expect(below?.y ?? 0).toBeGreaterThanOrEqual((narrow?.y ?? 0) + (narrow?.height ?? 0) - 1);
  });

  test('in a right-to-left document it sits at the left', async ({ tei }) => {
    const rtl = 'فقرة طويلة بما يكفي لتلتف بجانب الملاحظة على صفحة عريضة. '.repeat(6);
    await open(tei, `<aside data-tei-sticky="pink"><p>تذكير</p></aside><p>${rtl}</p>`, {
      flags: ['rtl'],
    });
    const content = await tei.content.boundingBox();
    const note = await sticky(tei).boundingBox();
    if (!content || !note) throw new Error('not rendered');
    expect(note.x - content.x).toBeLessThan(40);
  });

  test('legible in every colour, light and dark', async ({ tei }) => {
    const notes = ['yellow', 'pink', 'green', 'blue', 'purple']
      .map((c) => `<aside data-tei-sticky="${c}"><p>${c}</p></aside>`)
      .join('');
    await open(tei, notes, { width: 420 });
    const contrasts = () =>
      tei.content.evaluate((root) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const rgb = (color: string) => {
          if (!ctx) return [0, 0, 0];
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
        };
        const luminance = (color: string) => {
          const [r, g, b] = rgb(color).map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
        };
        return [...root.querySelectorAll('.tei-sticky')].map((note) => {
          const css = getComputedStyle(note);
          const [a, b] = [luminance(css.color), luminance(css.backgroundColor)].sort(
            (x, y) => y - x,
          );
          return ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05);
        });
      });
    const light = await contrasts();
    expect(light).toHaveLength(5);
    for (const ratio of light) expect(ratio).toBeGreaterThan(7);
    await tei.page.getByTestId('editor').evaluate((el) => el.setAttribute('data-theme', 'dark'));
    const dark = await contrasts();
    for (const ratio of dark) expect(ratio).toBeGreaterThan(7);
    expect(dark).not.toEqual(light);
  });

  test('with no colour menu mounted, its swatch steps to the next colour; the text keeps the caret', async ({
    tei,
  }) => {
    await open(tei, NOTE);
    await caretAtEndOf(tei, 'Remember');
    await expect(swatch(tei)).toHaveAttribute('role', 'button');
    await swatch(tei).click();
    await expect(sticky(tei)).toHaveAttribute('data-color', 'pink');
    expect(await tei.html()).toMatch(/^<aside data-tei-sticky="pink"/);
    // The swatch is not text: typing goes on where the caret was.
    await tei.page.keyboard.type('!');
    await expect(sticky(tei).locator('p').first()).toHaveText('Remember!');
  });

  test('the context menu in a note has its colours, in a submenu', async ({ tei }) => {
    await open(tei, NOTE);
    const menu = await contextMenuOn(tei, 'Remember');
    await menu.locator('[data-id="stickyMenu"]').click();
    const sub = tei.page.getByRole('menu', { name: 'Note colour' });
    await expect(sub.getByRole('menuitemradio', { name: 'Yellow' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await sub.getByRole('menuitemradio', { name: 'Green' }).click();
    await expect(sticky(tei)).toHaveAttribute('data-color', 'green');
  });

  // Needs <Editor> to render <StickyMenu> (the `stickyMenu` slot the lead wires).
  test.fixme('its swatch opens the colour menu; picking one changes it', async ({ tei }) => {
    await open(tei, NOTE);
    await swatch(tei).click();
    const menu = tei.page.locator('[data-tei-control="sticky-menu"]');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitemradio', { name: 'Blue' }).click();
    await expect(menu).toHaveCount(0);
    await expect(sticky(tei)).toHaveAttribute('data-color', 'blue');
  });

  test('a tap on the swatch changes the colour @mobile', async ({ tei }) => {
    await tei.open({ content: NOTE, flags: ['cards', 'plain'] });
    await swatch(tei).tap();
    await expect(sticky(tei)).toHaveAttribute('data-color', 'pink');
  });
});
