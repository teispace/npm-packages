import { expect, type Harness, test } from './fixtures';

const list = (tei: Harness) => tei.page.locator('[data-tei-control="typeahead"]');
const picker = (tei: Harness) => tei.page.locator('[data-tei-control="emoji-picker"]');
const mention = (tei: Harness) => tei.content.locator('[data-tei-mention]');

async function open(tei: Harness, content = '<p>Hello</p>') {
  await tei.page.setViewportSize({ width: 900, height: 700 });
  await tei.open({ content, flags: ['typeahead', 'plain'] });
  await caretAtEndOf(tei, (content.match(/<p>([^<]*)<\/p>/)?.[1] ?? '').trim());
}

/** The caret at the end of the paragraph whose text is `text` (never End: it scrolls). */
const caretAtEndOf = (tei: Harness, text: string) =>
  tei.content.evaluate((root, wanted) => {
    const block = [...root.querySelectorAll('p')].find((b) => b.textContent === wanted);
    if (!block) throw new Error(`no block ${wanted}`);
    (root as HTMLElement).focus();
    getSelection()?.selectAllChildren(block);
    getSelection()?.collapseToEnd();
  }, text);

test.describe('emoji', () => {
  test('`:smile:` becomes 😄 on the closing colon', async ({ tei }) => {
    await open(tei);
    await tei.page.keyboard.type(' :smile');
    await expect(list(tei)).toBeVisible();
    await tei.page.keyboard.type(': there');
    expect(await tei.text()).toBe('Hello 😄 there');
    await expect(list(tei)).toHaveCount(0);
  });

  test('`:tad` lists matches; arrows and Enter pick, and focus stays in the text', async ({
    tei,
  }) => {
    await open(tei);
    await tei.page.keyboard.type(' :tad');
    const options = list(tei).getByRole('option');
    await expect(options.first()).toContainText(':tada:');
    await expect(tei.content).toBeFocused();
    const lit = await tei.content.getAttribute('aria-activedescendant');
    expect(lit).toBeTruthy();
    await expect(tei.page.locator(`[id="${lit}"]`)).toHaveAttribute('aria-selected', 'true');
    await tei.page.keyboard.press('Enter');
    await expect(list(tei)).toHaveCount(0);
    await tei.page.keyboard.type('!');
    expect(await tei.text()).toBe('Hello 🎉!');
    await expect(tei.content).not.toHaveAttribute('aria-activedescendant');
  });

  test('Escape closes the list and leaves the text', async ({ tei }) => {
    await open(tei);
    await tei.page.keyboard.type(' :hea');
    await expect(list(tei)).toBeVisible();
    await tei.page.keyboard.press('Escape');
    await expect(list(tei)).toHaveCount(0);
    await tei.page.keyboard.type('r');
    await expect(list(tei)).toHaveCount(0);
    expect(await tei.text()).toBe('Hello :hear');
  });

  test('the picker: /emoji opens it, search and Enter put one in', async ({ tei }) => {
    await open(tei);
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/emoji');
    await tei.page.keyboard.press('Enter');
    const search = picker(tei).getByRole('searchbox', { name: 'Search emoji' });
    await expect(search).toBeFocused();
    await search.fill('rocket');
    await expect(picker(tei).locator('[data-emoji]').first()).toHaveText('🚀');
    await tei.page.keyboard.press('Enter');
    await expect(picker(tei)).toHaveCount(0);
    await expect(tei.content).toBeFocused();
    await tei.page.keyboard.type('!');
    expect(await tei.html()).toBe('<p>Hello</p><p>🚀!</p>');
  });

  test('the picker’s grid: one tab stop, arrows move, recent first next time', async ({ tei }) => {
    await open(tei);
    await tei.page.keyboard.type(' ');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/emoji');
    await tei.page.keyboard.press('Enter');
    await expect(picker(tei).getByRole('searchbox')).toBeFocused();
    await tei.page.keyboard.press('ArrowDown');
    const cells = picker(tei).locator('[data-emoji]');
    await expect(cells.first()).toBeFocused();
    await expect(picker(tei).locator('[data-emoji][tabindex="0"]')).toHaveCount(1);
    await tei.page.keyboard.press('ArrowRight');
    await tei.page.keyboard.press('ArrowDown');
    // Second row, second column: the 10th of 8 a row.
    await expect(cells.nth(9)).toBeFocused();
    const picked = (await cells.nth(9).textContent()) ?? '';
    await tei.page.keyboard.press('Enter');
    await expect(picker(tei)).toHaveCount(0);
    expect(await tei.text()).toContain(picked);
    // Recent is the first tab now.
    await tei.page.keyboard.type(' /emoji');
    await tei.page.keyboard.press('Enter');
    await expect(picker(tei).locator('[data-category]').first()).toHaveAttribute(
      'data-category',
      'recent',
    );
    await expect(cells).toHaveText([picked]);
    await tei.page.keyboard.press('Escape');
    await expect(picker(tei)).toHaveCount(0);
    await expect(tei.content).toBeFocused();
  });
});

test.describe('mentions', () => {
  test('`@` searches as you type; a pick is one piece Backspace takes out whole', async ({
    tei,
  }) => {
    await open(tei);
    await tei.page.keyboard.type(' @gr');
    const options = list(tei).getByRole('option');
    await expect(options).toHaveText(['Grace Hopper']);
    await expect(list(tei).getByRole('listbox')).toHaveAttribute('aria-label', 'Mentions');
    await tei.page.keyboard.press('Enter');
    await expect(mention(tei)).toHaveText('@Grace Hopper');
    await expect(mention(tei)).toHaveAttribute('data-tei-mention', 'grace-hopper');
    await tei.page.keyboard.type('hi');
    expect(await tei.html()).toBe(
      '<p>Hello <span data-tei-mention="grace-hopper" data-label="Grace Hopper">@Grace Hopper</span> hi</p>',
    );
    for (let i = 0; i < 3; i++) await tei.page.keyboard.press('Backspace');
    await expect(mention(tei)).toHaveCount(1);
    await tei.page.keyboard.press('Backspace');
    await expect(mention(tei)).toHaveCount(0);
    expect(await tei.text()).toBe('Hello ');
  });

  test('a stale search is dropped; only the last query is asked', async ({ tei }) => {
    await open(tei);
    await tei.page.keyboard.type(' @al');
    await expect(list(tei).getByRole('option')).toHaveText(['Alan Turing', 'Linus Torvalds']);
    const log = await tei.log();
    expect(log.filter((line) => line.startsWith('search'))).toEqual(['search @al']);
    await tei.page.keyboard.type('an');
    await expect(list(tei).getByRole('option')).toHaveText(['Alan Turing']);
  });

  test('a click picks; nobody found says so; another trigger has its own list', async ({ tei }) => {
    await open(tei);
    await tei.page.keyboard.type(' @zzz');
    await expect(list(tei)).toContainText('No one found');
    await tei.page.keyboard.press('Escape');
    await tei.page.keyboard.type(' @lin');
    await list(tei).getByRole('option', { name: 'Linus Torvalds' }).click();
    await expect(mention(tei)).toHaveText('@Linus Torvalds');
    await expect(tei.content).toBeFocused();
    await tei.page.keyboard.type('+gen');
    await expect(list(tei)).toHaveAttribute('data-source', 'mention:+');
    await expect(list(tei).getByRole('option')).toHaveText(['general']);
    await tei.page.keyboard.press('Tab');
    await expect(mention(tei)).toHaveText(['@Linus Torvalds', '+general']);
    // A click on a mention reaches the app.
    await mention(tei).first().click();
    expect(await tei.log()).toContain('mention linus-torvalds');
  });

  test('a tap picks from the list @mobile', async ({ tei }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['typeahead', 'plain'] });
    await caretAtEndOf(tei, 'Hello');
    await tei.page.keyboard.type(' @ad');
    const option = list(tei).getByRole('option', { name: 'Ada Lovelace' });
    await option.tap();
    await expect(mention(tei)).toHaveText('@Ada Lovelace');
    await expect(list(tei)).toHaveCount(0);
  });
});

test.describe('hashtags', () => {
  test('a typed #tag becomes a chip; a click on it reaches the app', async ({ tei }) => {
    await open(tei);
    await tei.page.keyboard.type(' #launch day');
    const chip = tei.content.locator('[data-tei-hashtag]');
    await expect(chip).toHaveText('#launch');
    expect(await tei.html()).toBe('<p>Hello <span data-tei-hashtag="">#launch</span> day</p>');
    await chip.click();
    expect(await tei.log()).toContain('hashtag launch');
  });
});

test.describe('on a phone', () => {
  test('the picker fits a 375px screen', async ({ tei }) => {
    await tei.page.setViewportSize({ width: 375, height: 700 });
    await tei.open({ content: '<p>Hello</p>', flags: ['typeahead', 'plain'] });
    await caretAtEndOf(tei, 'Hello');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/emoji');
    await tei.page.keyboard.press('Enter');
    await expect(picker(tei)).toBeVisible();
    const box = await picker(tei).boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 999)).toBeLessThanOrEqual(375);
  });
});
