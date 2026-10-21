import type { Locator } from '@playwright/test';
import { expect, type Harness, settled, test } from './fixtures';

const DOC = '<p>Hello world</p><p>Second</p>';
const TABLE =
  '<p>Intro</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><p>After</p>';
const FIGURE =
  '<p>Before</p><figure><img src="/photo.svg" alt="Hills" width="300" height="180"></figure><p>After</p>';

const menu = (tei: Harness) => tei.page.locator('[data-tei-control="context-menu"]');
const row = (tei: Harness, id: string) => menu(tei).locator(`[data-id="${id}"]`);
const rows = (tei: Harness) =>
  menu(tei)
    .locator(':scope [role="menu"] > [role="group"] > [data-tei-part="menu-item"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-id')));

/** The editor's own frames, for the caret a click or key leaves to settle. */
const frames = (tei: Harness) =>
  tei.page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

/** Select `text` where it first appears in the document. */
async function selectText(tei: Harness, text: string) {
  await tei.content.click();
  await tei.content.evaluate((root, wanted) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const at = node.textContent?.indexOf(wanted) ?? -1;
      if (at < 0) continue;
      getSelection()?.setBaseAndExtent(node, at, node, at + wanted.length);
      return;
    }
  }, text);
  await frames(tei);
}

/** Right-click inside the selection (a right-click elsewhere moves the caret), and wait for the menu. */
async function rightClickSelection(tei: Harness) {
  const box = await tei.page.evaluate(() => {
    const rect = getSelection()?.getRangeAt(0).getBoundingClientRect();
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  });
  if (!box) throw new Error('nothing selected');
  await tei.page.mouse.click(box.x, box.y, { button: 'right' });
  await expect(menu(tei)).toBeVisible();
}

/** Right-click the middle of `target`, and wait for the menu. */
async function rightClick(tei: Harness, target: Locator) {
  await target.click({ button: 'right' });
  await expect(menu(tei)).toBeVisible();
}

test.describe('context menu', () => {
  test('opens where the pointer is, the clipboard first; Escape gives the editor back', async ({
    tei,
  }) => {
    await tei.open({ content: DOC });
    const second = tei.content.getByText('Second');
    const box = await second.boundingBox();
    if (!box) throw new Error('not rendered');
    await tei.page.mouse.click(box.x + 20, box.y + box.height / 2, { button: 'right' });
    await expect(menu(tei)).toBeVisible();
    await settled(tei.page);
    const at = await menu(tei).boundingBox();
    expect(Math.abs((at?.x ?? 0) - (box.x + 20))).toBeLessThan(6);
    expect(Math.abs((at?.y ?? 0) - (box.y + box.height / 2))).toBeLessThan(6);
    expect((await rows(tei)).slice(0, 4)).toEqual(['cut', 'copy', 'paste', 'pastePlain']);
    await expect(menu(tei).getByRole('menu', { name: 'Edit' })).toBeFocused();
    await tei.page.keyboard.press('Escape');
    await expect(menu(tei)).toHaveCount(0);
    await expect(tei.content).toBeFocused();
  });

  test('copy and cut a selection from it, to paste with the keyboard', async ({ tei }) => {
    await tei.open({ content: DOC });
    await selectText(tei, 'Hello');
    await rightClickSelection(tei);
    // Still the selection the menu acts on.
    await expect(row(tei, 'copy')).not.toHaveAttribute('aria-disabled');
    await row(tei, 'copy').click();
    await expect(menu(tei)).toHaveCount(0);
    await selectText(tei, 'Second');
    await tei.page.keyboard.press('ArrowRight');
    await tei.page.keyboard.press('ControlOrMeta+v');
    await expect(tei.content.locator('p').nth(1)).toHaveText('SecondHello');

    await selectText(tei, 'world');
    await rightClickSelection(tei);
    await row(tei, 'cut').click();
    await expect(tei.content.locator('p').first()).toHaveText('Hello ');
    await tei.page.keyboard.press('ControlOrMeta+v');
    await expect(tei.content.locator('p').first()).toHaveText('Hello world');
    // Nothing selected: nothing to cut or copy, greyed.
    await tei.page.keyboard.press('Escape');
    await rightClick(tei, tei.content.locator('p').nth(1));
    await expect(row(tei, 'copy')).toHaveAttribute('aria-disabled', 'true');
    await expect(row(tei, 'cut')).toHaveAttribute('aria-disabled', 'true');
  });

  test('pastes rich text, or its text alone', async ({ tei }) => {
    await tei.open({ content: '<p>Rich</p><p>Plain</p>' });
    await tei.page.evaluate(() =>
      window.__tei.setClipboard({ html: '<p><b>Bold</b> words</p>', text: 'Bold words' }),
    );
    const [rich, plain] = [tei.content.locator('p').first(), tei.content.locator('p').nth(1)];
    await selectText(tei, 'Rich');
    await rightClickSelection(tei);
    await row(tei, 'paste').click();
    await expect(rich).toHaveText('Bold words');
    await expect(rich.locator('strong, b')).toHaveText('Bold');
    await selectText(tei, 'Plain');
    await rightClickSelection(tei);
    await row(tei, 'pastePlain').click();
    await expect(plain).toHaveText('Bold words');
    await expect(plain.locator('strong, b')).toHaveCount(0);
  });

  test('a paste the browser refuses is said out loud, and changes nothing', async ({ tei }) => {
    await tei.open({ content: '<p>Start</p>' });
    await tei.page.evaluate(() => window.__tei.setClipboard(null));
    await rightClick(tei, tei.content.locator('p'));
    await row(tei, 'paste').click();
    await expect(tei.page.locator('[data-tei-live]')).toHaveText(/would not let the editor/);
    await expect(tei.content).toHaveText('Start');
  });

  test('pastes from the real clipboard where the browser allows it', async ({
    tei,
    browserName,
    context,
  }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium lets a test grant clipboard access');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await tei.open({ content: '<p>Start</p>' });
    await tei.page.evaluate(() => navigator.clipboard.writeText(' and more'));
    await tei.caretAtEnd();
    await rightClick(tei, tei.content.locator('p'));
    await row(tei, 'paste').click();
    await expect(tei.content).toHaveText('Start and more');
  });

  test('in a link: edit it, or take it off and keep the text', async ({ tei }) => {
    await tei.open({ content: '<p>A <a href="https://example.com">link</a> here</p>' });
    const link = tei.content.locator('a');
    await rightClick(tei, link);
    await expect(row(tei, 'link')).toBeVisible();
    // An action, not a choice: no tick for being in a link.
    await expect(row(tei, 'link')).toHaveAttribute('role', 'menuitem');
    await row(tei, 'link').click();
    await expect(tei.page.locator('[data-tei-control="link-editor"]')).toBeVisible();
    await tei.page.keyboard.press('Escape');
    await rightClick(tei, link);
    await row(tei, 'unsetLink').click();
    await expect(tei.content.locator('a')).toHaveCount(0);
    await expect(tei.content).toHaveText('A link here');
    await rightClick(tei, tei.content.locator('p'));
    await expect(row(tei, 'unsetLink')).toHaveCount(0);
  });

  test('on an image: selects it, and offers its own actions', async ({ tei }) => {
    await tei.open({ content: FIGURE, flags: ['image'] });
    const image = tei.page.locator('[data-tei-image]');
    await rightClick(tei, image.locator('img'));
    await expect(image).toHaveAttribute('data-tei-selected', '');
    await expect(row(tei, 'imageAlign.center')).toBeVisible();
    // Its toolbar's own controls (alt text, replace) stay on the toolbar.
    await expect(row(tei, 'imageAltText')).toHaveCount(0);
    await row(tei, 'imageAlign.start').click();
    await expect(image).toHaveAttribute('data-align', 'start');
    await rightClick(tei, image.locator('img'));
    await expect(row(tei, 'imageAlign.start')).toHaveAttribute('aria-checked', 'true');
    await expect(row(tei, 'removeImage')).toHaveAttribute('data-variant', 'danger');
    await row(tei, 'removeImage').click();
    await expect(image).toHaveCount(0);
  });

  test('in a table: its rows and columns, in a submenu', async ({ tei }) => {
    await tei.open({ content: TABLE, flags: ['table'] });
    await rightClick(tei, tei.content.getByText('1', { exact: true }));
    await row(tei, 'table').click();
    const table = tei.page.getByRole('menu', { name: 'Table' });
    await table.locator('[data-id="addRowAfter"]').click();
    await expect(menu(tei)).toHaveCount(0);
    await expect(tei.content.locator('tr')).toHaveCount(3);
    // Outside the table: no table entry.
    await rightClick(tei, tei.content.getByText('Intro'));
    await expect(row(tei, 'table')).toHaveCount(0);
  });

  test('the block: turn it into another, duplicate or delete it', async ({ tei }) => {
    await tei.open({ content: DOC, flags: ['blocks'] });
    await rightClick(tei, tei.content.getByText('Second'));
    await row(tei, 'turnInto').click();
    await tei.page
      .getByRole('menu', { name: 'Turn into' })
      .getByRole('menuitemradio', { name: 'Heading 2' })
      .click();
    await expect(tei.content.locator('h2')).toHaveText('Second');
    await rightClick(tei, tei.content.locator('h2'));
    await row(tei, 'duplicateBlock').click();
    await expect(tei.content.locator('h2')).toHaveCount(2);
    await rightClick(tei, tei.content.getByText('Hello world'));
    await row(tei, 'deleteBlock').click();
    await expect(tei.content.getByText('Hello world')).toHaveCount(0);
  });

  test('from the keyboard (the menu key): at the caret', async ({ tei }) => {
    await tei.open({ content: '<p>One</p><p>Two</p><p>Three</p>' });
    await selectText(tei, 'Three');
    // The menu key sends a contextmenu event at no particular point.
    await tei.content.evaluate((root) =>
      root.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    await expect(menu(tei)).toBeVisible();
    await settled(tei.page);
    const line = await tei.content.getByText('Three').boundingBox();
    const at = await menu(tei).boundingBox();
    expect(at?.y).toBeGreaterThanOrEqual((line?.y ?? 0) - 2);
    expect(at?.y).toBeLessThan((line?.y ?? 0) + (line?.height ?? 0) + 12);
  });

  test('stays in the window by the edges', async ({ tei }) => {
    await tei.page.setViewportSize({ width: 600, height: 420 });
    await tei.open({ content: '<p>Top</p><p>A</p><p>B</p><p>C</p><p>D</p><p>E</p><p>Bottom</p>' });
    const bottom = await tei.content.getByText('Bottom').boundingBox();
    if (!bottom) throw new Error('not rendered');
    await tei.page.mouse.click(560, bottom.y + bottom.height / 2, { button: 'right' });
    await expect(menu(tei)).toBeVisible();
    await settled(tei.page);
    const at = await menu(tei).boundingBox();
    expect((at?.x ?? 0) + (at?.width ?? 0)).toBeLessThanOrEqual(600);
    expect((at?.y ?? 0) + (at?.height ?? 0)).toBeLessThanOrEqual(420);
  });

  test('Shift-right-click and a read-only editor keep the browser’s menu', async ({ tei }) => {
    await tei.open({ content: DOC });
    const shown = (shiftKey: boolean) =>
      tei.content.evaluate(
        (root, shift) =>
          root.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: shift }),
          ),
        shiftKey,
      );
    // dispatchEvent is true when nothing prevented the default: the browser's menu.
    expect(await shown(true)).toBe(true);
    await expect(menu(tei)).toHaveCount(0);
    await tei.page.evaluate(() => window.__tei.editor.setEditable(false));
    expect(await shown(false)).toBe(true);
    await expect(menu(tei)).toHaveCount(0);
  });

  test('a long press keeps the phone’s own menu @mobile', async ({ tei }) => {
    await tei.open({ content: DOC });
    const kept = await tei.content.evaluate((root) =>
      root.dispatchEvent(
        new PointerEvent('contextmenu', { bubbles: true, cancelable: true, pointerType: 'touch' }),
      ),
    );
    expect(kept).toBe(true);
    await expect(menu(tei)).toHaveCount(0);
  });
});
