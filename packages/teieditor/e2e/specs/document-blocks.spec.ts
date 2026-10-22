import { expect, type Harness, test } from './fixtures';

const callout = (tei: Harness) => tei.content.locator('.tei-callout');
const icon = (tei: Harness) => tei.content.locator('[data-tei-callout-icon]');
const calloutMenu = (tei: Harness) => tei.page.locator('[data-tei-control="callout-menu"]');
const slash = (tei: Harness) => tei.page.locator('[data-tei-control="slash-menu"]');

const NOTE = '<div data-tei-callout="note"><p>Read this first</p></div><p>After</p>';

async function open(tei: Harness, content: string, flags: string[] = []) {
  await tei.page.setViewportSize({ width: 900, height: 700 });
  await tei.open({ content, flags: ['extras', 'plain', ...flags] });
}

/** The editor's root is focused, and the caret is in the text whose content is `text`. */
const caretIn = (tei: Harness) =>
  tei.page.evaluate(() => {
    const root = document.querySelector('[data-tei-content]');
    const node = getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return document.activeElement === root
      ? (element?.closest('p, aside')?.textContent ?? '')
      : null;
  });

/** Put the caret at the end of the block whose text is `text`. */
const caretAtEndOf = (tei: Harness, text: string) =>
  tei.content.evaluate((root, wanted) => {
    const block = [...root.querySelectorAll('p, aside, li')].find((b) => b.textContent === wanted);
    if (!block) throw new Error(`no block ${wanted}`);
    (root as HTMLElement).focus();
    getSelection()?.selectAllChildren(block);
    getSelection()?.collapseToEnd();
  }, text);

test.describe('callout', () => {
  test('the slash menu sets the line apart; Enter on an empty last line steps out', async ({
    tei,
  }) => {
    await open(tei, '<p>Intro</p>');
    await caretAtEndOf(tei, 'Intro');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/callout');
    await expect(slash(tei)).toBeVisible();
    await tei.page.keyboard.press('Enter');
    await expect(callout(tei)).toHaveAttribute('data-variant', 'note');
    await tei.page.keyboard.type('Inside');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Second');
    await tei.page.keyboard.press('Enter');
    // An empty last line: Enter takes it out of the callout.
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('After');
    await expect(callout(tei).locator('p')).toHaveText(['Inside', 'Second']);
    expect(await tei.html()).toMatch(/<p>Second<\/p><\/div><p>After<\/p>$/);
  });

  test('its icon opens the kinds; picking one changes it and the caret stays in the text', async ({
    tei,
  }) => {
    await open(tei, NOTE);
    await caretAtEndOf(tei, 'After');
    await icon(tei).click();
    const menu = calloutMenu(tei);
    await expect(menu).toBeVisible();
    // Beside the icon, below it.
    const at = await icon(tei).boundingBox();
    const box = await menu.boundingBox();
    expect(Math.abs((box?.x ?? 0) - (at?.x ?? 0))).toBeLessThan(12);
    expect(box?.y ?? 0).toBeGreaterThan((at?.y ?? 0) + (at?.height ?? 0) - 1);
    await expect(menu.getByRole('menuitemradio', { name: 'Note' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await menu.getByRole('menuitemradio', { name: 'Warning' }).click();
    await expect(menu).toHaveCount(0);
    await expect(callout(tei)).toHaveAttribute('data-variant', 'warning');
    await expect(callout(tei)).toHaveAttribute('aria-label', 'Warning');
    // The menu put the caret in the callout it was for.
    expect(await caretIn(tei)).toBe('Read this first');
    await tei.page.keyboard.type('!');
    await expect(callout(tei).locator('p').first()).toHaveText(/!/);
  });

  test('from the keyboard: arrows and Enter pick, Escape closes and gives the text back', async ({
    tei,
  }) => {
    await open(tei, NOTE);
    await icon(tei).click();
    await expect(calloutMenu(tei)).toBeVisible();
    await tei.page.keyboard.press('Escape');
    await expect(calloutMenu(tei)).toHaveCount(0);
    expect(await caretIn(tei)).toBe('Read this first');
    await icon(tei).click();
    // It opens on the first kind.
    await tei.page.keyboard.press('ArrowDown');
    await tei.page.keyboard.press('Enter');
    await expect(callout(tei)).toHaveAttribute('data-variant', 'tip');
  });

  test('Remove callout keeps its text', async ({ tei }) => {
    await open(tei, NOTE);
    await icon(tei).click();
    await calloutMenu(tei).getByRole('menuitem', { name: 'Remove callout' }).click();
    await expect(callout(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Read this first</p><p>After</p>');
  });

  test('Backspace at the start of its first line takes it away, keeping the text', async ({
    tei,
  }) => {
    await open(tei, NOTE);
    await tei.content.evaluate((root) => {
      const text = root.querySelector('.tei-callout p');
      (root as HTMLElement).focus();
      if (text) getSelection()?.collapse(text, 0);
    });
    await tei.page.keyboard.press('Backspace');
    await expect(callout(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Read this first</p><p>After</p>');
  });

  test('the context menu in a callout has its kinds, in a submenu', async ({ tei }) => {
    await open(tei, NOTE);
    await caretAtEndOf(tei, 'Read this first');
    const text = await callout(tei).locator('p').boundingBox();
    if (!text) throw new Error('not rendered');
    await tei.page.mouse.click(text.x + text.width - 2, text.y + text.height / 2, {
      button: 'right',
    });
    const menu = tei.page.getByRole('menu', { name: 'Edit' });
    await menu.locator('[data-id="calloutMenu"]').click();
    const sub = tei.page.getByRole('menu', { name: 'Callout' });
    await sub.getByRole('menuitemradio', { name: 'Caution' }).click();
    await expect(callout(tei)).toHaveAttribute('data-variant', 'caution');
  });

  test('a tap on the icon opens the kinds @mobile', async ({ tei }) => {
    await tei.open({ content: NOTE, flags: ['extras', 'plain'] });
    await icon(tei).tap();
    await expect(calloutMenu(tei)).toBeVisible();
    await calloutMenu(tei).getByRole('menuitemradio', { name: 'Tip' }).tap();
    await expect(callout(tei)).toHaveAttribute('data-variant', 'tip');
  });
});

test.describe('pull quote', () => {
  test('from the slash menu: the line set large, an aside; Enter leaves it', async ({ tei }) => {
    await open(tei, '<p>Quote me</p>');
    await caretAtEndOf(tei, 'Quote me');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/pull');
    await expect(slash(tei).getByRole('menuitem').first()).toContainText('Pull quote');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Big words');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Normal');
    expect(await tei.html()).toBe(
      '<p>Quote me</p><aside data-tei-pull-quote="">Big words</aside><p>Normal</p>',
    );
    const size = (selector: string) =>
      tei.content
        .locator(selector)
        .first()
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(await size('aside')).toBeGreaterThan(await size('p'));
  });
});

test.describe('page break', () => {
  const pageBreak = (tei: Harness) => tei.content.locator('[data-tei-page-break]');

  test('⌘↵ puts one in; a click selects it, Backspace takes it out', async ({ tei }) => {
    await open(tei, '<p>One</p><p>Two</p>');
    await caretAtEndOf(tei, 'One');
    await tei.page.keyboard.press('ControlOrMeta+Enter');
    await expect(pageBreak(tei)).toHaveCount(1);
    expect(await tei.html()).toBe('<p>One</p><hr data-tei-page-break=""><p>Two</p>');
    // The caret went on after it.
    await tei.page.keyboard.type('X');
    await expect(tei.content.locator('p').nth(1)).toHaveText('XTwo');
    await pageBreak(tei).click();
    await expect(pageBreak(tei)).toHaveAttribute('data-tei-selected', '');
    await tei.page.keyboard.press('Backspace');
    await expect(pageBreak(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>One</p><p>XTwo</p>');
  });

  test('on paper: a new page and no rule', async ({ tei }) => {
    await open(tei, '<p>One</p><hr data-tei-page-break><p>Two</p>');
    await tei.page.emulateMedia({ media: 'print' });
    const style = await pageBreak(tei).evaluate((el) => {
      const css = getComputedStyle(el);
      return { after: css.breakAfter, visibility: css.visibility };
    });
    expect(style).toEqual({ after: 'page', visibility: 'hidden' });
  });
});

test.describe('collapsible', () => {
  const section = (tei: Harness) => tei.content.locator('.tei-collapsible');
  const chevron = (tei: Harness) => tei.content.locator('[data-tei-collapsible-toggle]');
  const body = (tei: Harness) => tei.content.locator('.tei-collapsible-content');
  const SECTION =
    '<details open><summary>Details</summary><p>Hidden text</p></details><p>After</p>';

  test('from the slash menu: the title, Enter into the body, Enter on an empty line out', async ({
    tei,
  }) => {
    await open(tei, '<p>Intro</p>');
    await caretAtEndOf(tei, 'Intro');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/toggle');
    await expect(slash(tei).getByRole('menuitem').first()).toContainText('Toggle');
    await tei.page.keyboard.press('Enter');
    // An empty title says what goes there.
    const title = section(tei).locator('.tei-collapsible-title');
    expect(await title.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"Title"');
    await tei.page.keyboard.type('Heading');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Inside');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Out');
    expect(await tei.html()).toBe(
      '<p>Intro</p><details open=""><summary>Heading</summary><div data-tei-collapsible-content=""><p>Inside</p></div></details><p>Out</p>',
    );
  });

  test('the chevron, on the title’s line, closes and opens it', async ({ tei }) => {
    await open(tei, SECTION);
    const toggle = await chevron(tei).boundingBox();
    const line = await section(tei).locator('.tei-collapsible-title').boundingBox();
    if (!toggle || !line) throw new Error('not rendered');
    expect(Math.abs(toggle.y + toggle.height / 2 - (line.y + line.height / 2))).toBeLessThan(1.5);
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(line.x + 0.5);
    await chevron(tei).click();
    await expect(body(tei)).toBeHidden();
    await expect(body(tei)).toHaveAttribute('hidden', 'until-found');
    expect(await tei.html()).toMatch(/^<details><summary>Details<\/summary>/);
    // Closed, it is the title alone: the next line sits under it.
    const after = await tei.content.locator('p', { hasText: 'After' }).boundingBox();
    expect((after?.y ?? 0) - (line.y + line.height)).toBeLessThan(24);
    await chevron(tei).click();
    await expect(body(tei)).toBeVisible();
  });

  test('⌘⌥7 makes the line a section, ⌘⌥↵ closes it, the caret going to the title', async ({
    tei,
  }) => {
    await open(tei, '<p>Summary line</p><p>Below</p>');
    await caretAtEndOf(tei, 'Summary line');
    await tei.page.keyboard.press('ControlOrMeta+Alt+7');
    await expect(section(tei).locator('.tei-collapsible-title')).toHaveText('Summary line');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Body');
    await tei.page.keyboard.press('ControlOrMeta+Alt+Enter');
    await expect(body(tei)).toBeHidden();
    await tei.page.keyboard.type('!');
    await expect(section(tei).locator('.tei-collapsible-title')).toHaveText('Summary line!');
  });

  test('a click below a section that ends the document adds a line to type on', async ({ tei }) => {
    await open(tei, '<details open><summary>Last</summary><p>Inside</p></details>');
    const box = await tei.content.boundingBox();
    const end = await section(tei).boundingBox();
    if (!box || !end) throw new Error('not rendered');
    const below = end.y + end.height + 8;
    test.skip(below >= box.y + box.height, 'no room below the section');
    await tei.page.mouse.click(box.x + box.width / 2, below);
    await tei.page.keyboard.type('Typed');
    expect(await tei.html()).toMatch(/<\/details><p>Typed<\/p>$/);
  });

  test('a tap on the chevron closes it @mobile', async ({ tei }) => {
    await tei.open({ content: SECTION, flags: ['extras', 'plain'] });
    await chevron(tei).tap();
    await expect(body(tei)).toBeHidden();
  });
});
