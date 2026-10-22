import { readFile } from 'node:fs/promises';
import { expect, type Harness, test } from './fixtures';

const DOC = '<h1>Title</h1><p>Some <strong>bold</strong> text</p><ul><li>one</li></ul>';

async function open(tei: Harness, content = DOC, flags: string[] = []) {
  await tei.page.setViewportSize({ width: 900, height: 700 });
  await tei.open({ content, flags: ['views', 'plain', ...flags] });
}

const menuButton = (tei: Harness) => tei.page.getByTestId('document-menu');
const menu = (tei: Harness) => tei.page.locator('[data-tei-control="document-menu"]');
const source = (tei: Harness) => tei.content.locator('pre[data-tei-markdown-source]');

/** Open the document menu and pick a row by its name. */
async function pick(
  tei: Harness,
  name: string,
  role: 'menuitem' | 'menuitemcheckbox' = 'menuitem',
) {
  await menuButton(tei).click();
  await menu(tei).getByRole(role, { name }).click();
}

/** Put the caret at the end of an element's text. */
const caretAtEndOf = (tei: Harness, selector: string) =>
  tei.content.evaluate((root, wanted) => {
    const el = root.querySelector(wanted);
    if (!el) throw new Error(`no ${wanted}`);
    (root as HTMLElement).focus();
    getSelection()?.selectAllChildren(el);
    getSelection()?.collapseToEnd();
  }, selector);

const frames = (tei: Harness) =>
  tei.page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

test.describe('markdown source', () => {
  test('the menu switches to markdown and back; edits to the source come back as formatting', async ({
    tei,
  }) => {
    await open(tei);
    await pick(tei, 'Markdown source', 'menuitemcheckbox');
    await expect(source(tei)).toBeVisible();
    await expect(source(tei)).toContainText('# Title');
    await expect(source(tei)).toContainText('Some **bold** text');
    await caretAtEndOf(tei, 'pre');
    await frames(tei);
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('## Added *here*');
    // Typed markdown stays text: no heading, no italics, one block.
    await expect(tei.content.locator('h2')).toHaveCount(0);
    await expect(tei.content.locator(':scope > *')).toHaveCount(1);

    await menuButton(tei).click();
    await expect(
      menu(tei).getByRole('menuitemcheckbox', { name: 'Markdown source' }),
    ).toHaveAttribute('aria-checked', 'true');
    // Clearing still works in the source.
    await expect(menu(tei).getByRole('menuitem', { name: 'Clear document' })).not.toHaveAttribute(
      'aria-disabled',
    );
    await menu(tei).getByRole('menuitemcheckbox', { name: 'Markdown source' }).click();
    await expect(source(tei)).toHaveCount(0);
    expect(await tei.html()).toBe(
      '<h1>Title</h1><p>Some <strong>bold</strong> text</p><ul><li>one</li></ul><h2>Added <em>here</em></h2>',
    );
    // One undo step back into the source.
    await tei.content.focus();
    await tei.page.keyboard.press('ControlOrMeta+z');
    await expect(source(tei)).toBeVisible();
  });
});

test.describe('invisibles', () => {
  test('marks spaces and block ends beside the text, never in it', async ({ tei }) => {
    await open(tei, '<p>one two three</p><p>next</p>');
    await tei.page.evaluate(() => window.__tei.editor.commands.toggleInvisibles());
    const spaces = tei.page.locator('.tei-invisible[data-kind="space"]:not([hidden])');
    await expect(spaces).toHaveCount(2);
    await expect(tei.page.locator('.tei-invisible[data-kind="end"]:not([hidden])')).toHaveCount(2);
    // The first space's mark sits on the first line, between the words.
    const line = await tei.content.locator('p').first().boundingBox();
    const mark = await spaces.first().boundingBox();
    expect(mark && line).toBeTruthy();
    if (mark && line) {
      expect(mark.y).toBeGreaterThanOrEqual(line.y - 2);
      expect(mark.y + mark.height).toBeLessThanOrEqual(line.y + line.height + 2);
      expect(mark.x).toBeGreaterThan(line.x);
    }
    await tei.selectAll();
    const copied = await tei.page.evaluate(() => getSelection()?.toString() ?? '');
    expect(copied).not.toMatch(/[·¶]/);
    expect(await tei.html()).toBe('<p>one two three</p><p>next</p>');
    // They follow typing.
    await caretAtEndOf(tei, 'p:last-child');
    await tei.page.keyboard.type(' a b');
    await expect(spaces).toHaveCount(4);
    await tei.page.evaluate(() => window.__tei.editor.commands.toggleInvisibles());
    await expect(tei.page.locator('.tei-invisible')).toHaveCount(0);
  });
});

test.describe('pages', () => {
  const MANY = Array.from({ length: 60 }, (_, i) => `<p>Paragraph ${i + 1}</p>`).join('');

  test('lays the document on sheets, page breaks start a sheet, numbers each', async ({ tei }) => {
    await open(tei, `${MANY}<hr data-tei-page-break><p>After the break</p>`);
    await pick(tei, 'Pages', 'menuitemcheckbox');
    await expect(tei.content).toHaveAttribute('data-tei-pages', 'a4');
    await expect(tei.content.locator('[data-tei-page-shift]').first()).toBeAttached();
    // Each moved block starts exactly at the top of a sheet's content area.
    const offsets = await tei.content.evaluate((root) => {
      const style = getComputedStyle(root);
      const period =
        Number.parseFloat(style.getPropertyValue('--tei-page-height')) +
        Number.parseFloat(style.getPropertyValue('--tei-page-gap'));
      const top = root.getBoundingClientRect().top + Number.parseFloat(style.paddingTop);
      return [...root.querySelectorAll('[data-tei-page-shift]')].map((el) => {
        const y = el.getBoundingClientRect().top - top;
        return Math.abs(y - Math.round(y / period) * period);
      });
    });
    expect(offsets.length).toBeGreaterThanOrEqual(2);
    for (const off of offsets) expect(off).toBeLessThan(1.5);
    const after = tei.content.locator('p', { hasText: 'After the break' });
    await expect(after).toHaveAttribute('data-tei-page-shift', '');
    const count = Number(
      await tei.content.evaluate((root) => root.style.getPropertyValue('--tei-page-count')),
    );
    await expect(tei.page.locator('.tei-page-number:not([hidden])')).toHaveCount(count);
    await expect(tei.page.locator('.tei-page-number').first()).toHaveText(`1 / ${count}`);
    // The document is unchanged; typing still works.
    await caretAtEndOf(tei, 'p');
    await tei.page.keyboard.type('!');
    expect(await tei.html()).toContain('<p>Paragraph 1!</p>');
    expect(await tei.html()).not.toContain('page-shift');
    await pick(tei, 'Pages', 'menuitemcheckbox');
    await expect(tei.content).not.toHaveAttribute('data-tei-pages');
    await expect(tei.content.locator('[data-tei-page-shift]')).toHaveCount(0);
  });
});

test.describe('focus and read-only', () => {
  test('Escape then Tab leaves the editor, even in a list', async ({ tei, page }) => {
    await open(tei, '<ul><li>one</li><li>two</li></ul>');
    // Whether the Tab was left to the browser (which moves focus; WebKit only to fields).
    await page.evaluate(() => {
      addEventListener('keydown', (event) => {
        if (event.key === 'Tab') window.__tei.log.push(`tab ${event.defaultPrevented}`);
      });
    });
    await caretAtEndOf(tei, 'li:last-child');
    await frames(tei);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    expect(await tei.log()).toEqual(['tab false']);
    // Not indented, as Tab alone would have.
    expect(await tei.html()).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  test('Read only from the menu, and back', async ({ tei }) => {
    await open(tei, '<p>Hello</p>');
    await pick(tei, 'Read only', 'menuitemcheckbox');
    await expect(tei.content).toHaveAttribute('data-tei-readonly', '');
    await expect(tei.content).toHaveAttribute('contenteditable', 'false');
    await pick(tei, 'Read only', 'menuitemcheckbox');
    await expect(tei.content).not.toHaveAttribute('data-tei-readonly');
  });

  test('the selection stays drawn while focus is outside the editor', async ({ tei, page }) => {
    await open(tei, '<p>Hello world</p>');
    const supported = await page.evaluate(() => 'highlights' in CSS);
    test.skip(!supported, 'no CSS Custom Highlight API');
    await tei.content.evaluate((root) => {
      const text = root.querySelector('p')?.firstChild?.firstChild as Text;
      (root as HTMLElement).focus();
      getSelection()?.setBaseAndExtent(text, 0, text, 5);
    });
    await frames(tei);
    await menuButton(tei).focus();
    const kept = await page.evaluate(() => {
      const highlight = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get(
        'tei-kept-selection',
      );
      return highlight ? [...highlight].map((range) => range.toString()) : [];
    });
    expect(kept).toEqual(['Hello']);
    await tei.content.focus();
    expect(await page.evaluate(() => CSS.highlights.has('tei-kept-selection'))).toBe(false);
  });
});

test.describe('import, export and clearing', () => {
  test('export downloads each format as a file', async ({ tei, page }) => {
    await open(tei);
    const download = page.waitForEvent('download');
    await menuButton(tei).click();
    await menu(tei).getByRole('menuitem', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Markdown', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('document.md');
    const text = await readFile((await file.path()) as string, 'utf8');
    expect(text).toBe('# Title\n\nSome **bold** text\n\n- one');
  });

  test('import reads a picked file; a file of another kind is refused and said', async ({
    tei,
    page,
  }) => {
    await open(tei);
    let chooser = page.waitForEvent('filechooser');
    await pick(tei, 'Import…');
    await (await chooser).setFiles({
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('## Imported\n\nwith *style*'),
    });
    await expect(tei.content.locator('h2')).toHaveText('Imported');
    expect(await tei.html()).toBe('<h2>Imported</h2><p>with <em>style</em></p>');

    chooser = page.waitForEvent('filechooser');
    await pick(tei, 'Import…');
    await (await chooser).setFiles({
      name: 'tool.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([0, 1, 2]),
    });
    await expect(page.locator('[data-tei-live]')).toHaveText(/tool\.exe/);
    expect(await tei.html()).toBe('<h2>Imported</h2><p>with <em>style</em></p>');
  });

  test('clearing asks first, and is one undo step', async ({ tei, page }) => {
    await open(tei);
    await pick(tei, 'Clear document');
    const confirm = page.getByRole('alertdialog', { name: 'Clear the whole document?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    expect(await tei.html()).toBe(DOC);

    await pick(tei, 'Clear document');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear document' }).click();
    expect(await tei.text()).toBe('');
    await tei.content.focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => tei.html()).toBe(DOC);
  });
});
