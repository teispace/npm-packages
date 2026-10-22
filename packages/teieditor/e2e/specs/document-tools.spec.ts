import { expect, type Harness, test } from './fixtures';

const DOC =
  '<h1>Intro</h1><p>Some words here.</p><h2>Details</h2><p>More text.</p><h2>Wrap up</h2>';

async function open(tei: Harness, content = DOC, flags: string[] = []) {
  await tei.page.setViewportSize({ width: 1000, height: 800 });
  await tei.open({ content, flags: ['doctools', 'plain', ...flags] });
}

const panel = (tei: Harness) => tei.page.getByTestId('toc-panel');
const count = (tei: Harness) => tei.page.getByTestId('word-count');

/** Put the caret at the end of the block whose text is `text`. */
const caretAtEndOf = (tei: Harness, text: string) =>
  tei.content.evaluate((root, wanted) => {
    const block = [...root.querySelectorAll('p, h1, h2, h3')].find((b) => b.textContent === wanted);
    if (!block) throw new Error(`no block ${wanted}`);
    (root as HTMLElement).focus();
    getSelection()?.selectAllChildren(block);
    getSelection()?.collapseToEnd();
  }, text);

/** The text of the block the caret is in, while the document has focus. */
const caretBlock = (tei: Harness) =>
  tei.page.evaluate(() => {
    const root = document.querySelector('[data-tei-content]');
    const node = getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    return root?.contains(document.activeElement)
      ? (element?.closest('p, h1, h2, h3')?.textContent ?? '')
      : null;
  });

test.describe('table of contents', () => {
  test('the panel lists the headings, follows typing, and a link takes the caret there', async ({
    tei,
  }) => {
    await open(tei);
    const nav = panel(tei);
    await expect(nav).toHaveAttribute('aria-labelledby', /.+/);
    await expect(nav.getByRole('link')).toHaveText(['Intro', 'Details', 'Wrap up']);
    await expect(nav.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '#details');
    // A heading typed in shows up.
    await caretAtEndOf(tei, 'More text.');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('## Added');
    await expect(nav.getByRole('link')).toHaveText(['Intro', 'Details', 'Added', 'Wrap up']);
    await nav.getByRole('link', { name: 'Details' }).click();
    await expect.poll(() => caretBlock(tei)).toBe('Details');
    // Keyboard: arrows move between links.
    await nav.getByRole('link', { name: 'Intro' }).focus();
    await tei.page.keyboard.press('ArrowDown');
    await expect(nav.getByRole('link', { name: 'Details' })).toBeFocused();
    await tei.page.keyboard.press('End');
    await expect(nav.getByRole('link', { name: 'Wrap up' })).toBeFocused();
    expect(await tei.html()).toContain('<h2 id="details">Details</h2>');
  });

  test('the heading in view is marked as the page scrolls', async ({ tei }) => {
    const long = `<h1>Top</h1>${'<p>Filler line</p>'.repeat(60)}<h2>Bottom</h2>${'<p>More</p>'.repeat(40)}`;
    await open(tei, long);
    const nav = panel(tei);
    await expect(nav.getByRole('link', { name: 'Top' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    await tei.page.evaluate(() => {
      const h2 = document.querySelector('[data-tei-content] h2');
      window.scrollBy(0, (h2?.getBoundingClientRect().top ?? 0) - 40);
    });
    await expect(nav.getByRole('link', { name: 'Bottom' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  test('folds behind a button on a narrow screen', async ({ tei }) => {
    await open(tei);
    await tei.page.setViewportSize({ width: 375, height: 700 });
    const toggle = panel(tei).getByRole('button', { name: 'Table of contents' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel(tei).getByRole('link')).toHaveCount(0);
    await toggle.click();
    await expect(panel(tei).getByRole('link')).toHaveCount(3);
    await panel(tei).getByRole('link', { name: 'Wrap up' }).click();
    // Going somewhere folds it again.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => caretBlock(tei)).toBe('Wrap up');
  });

  test('/toc puts a live table of contents in the document; its links work', async ({ tei }) => {
    await open(tei, `<p>Start</p>${DOC}`);
    await caretAtEndOf(tei, 'Start');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/toc');
    await expect(tei.page.locator('[data-tei-control="slash-menu"]')).toBeVisible();
    await tei.page.keyboard.press('Enter');
    const block = tei.content.locator('nav[data-tei-toc]');
    await expect(block.getByRole('link')).toHaveText(['Intro', 'Details', 'Wrap up']);
    await block.getByRole('link', { name: 'Wrap up' }).click();
    await expect.poll(() => caretBlock(tei)).toBe('Wrap up');
    // Live: renaming a heading renames its link.
    await tei.page.keyboard.type('Begin ');
    await expect(block.getByRole('link').last()).toHaveText('Begin Wrap up');
    expect(await tei.html()).toContain(
      '<nav data-tei-toc="" aria-label="Table of contents"><ol><li><a href="#intro">Intro</a><ol><li><a href="#details">Details</a></li><li><a href="#begin-wrap-up">Begin Wrap up</a></li></ol></li></ol></nav>',
    );
  });
});

test.describe('word count and limit', () => {
  test('counts as you type, and the selection', async ({ tei }) => {
    await open(tei, '<p>One two</p>');
    await expect(count(tei)).toContainText('2 words');
    await expect(count(tei)).toContainText('7 characters');
    await caretAtEndOf(tei, 'One two');
    await tei.page.keyboard.type(' three 👍🏽');
    await expect(count(tei)).toContainText('3 words');
    await expect(count(tei)).toContainText('15 characters');
    await tei.selectAll();
    await expect(count(tei)).toContainText('3 words selected');
  });

  test('typing stops at the limit; the footer warns; a paste is cut to fit', async ({ tei }) => {
    await open(tei, '<p>abc</p>', ['doctools-limit']);
    const limit = count(tei).locator('.tei-word-count-limit');
    await expect(limit).toContainText('3 / 10');
    await caretAtEndOf(tei, 'abc');
    await tei.page.keyboard.type('defghi');
    await expect(limit).toHaveAttribute('data-state', 'near');
    await tei.page.keyboard.type('jklmnop');
    await expect.poll(() => tei.text()).toBe('abcdefghij');
    await expect(limit).toHaveAttribute('data-state', 'reached');
    await expect(count(tei).locator('[aria-live="polite"]')).toHaveText('Limit reached');
    // Make room, then paste more than fits.
    for (let i = 0; i < 6; i++) await tei.page.keyboard.press('Backspace');
    await expect.poll(() => tei.text()).toBe('abcd');
    await tei.page.evaluate(() => window.__tei.setClipSource('<p>123456789</p>'));
    await tei.page.keyboard.press('ControlOrMeta+c');
    await tei.forgetProblems();
    await caretAtEndOf(tei, 'abcd');
    await tei.page.keyboard.press('ControlOrMeta+v');
    await expect.poll(() => tei.text()).toBe('abcd123456');
  });

  test('content over the limit is marked, not cut', async ({ tei }) => {
    await open(tei, '<p>abcdefghijklmno</p>', ['doctools-limit']);
    await expect(tei.content.locator('.tei-character-limit')).toHaveText('klmno');
    await expect(count(tei).locator('.tei-word-count-limit')).toHaveAttribute('data-state', 'over');
    expect(await tei.html()).toBe('<p>abcdefghijklmno</p>');
  });
});
