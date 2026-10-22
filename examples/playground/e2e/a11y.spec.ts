import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { MOD, open, recordViolations, selectAWord } from './strict';

/**
 * No serious accessibility issues with each floating part open: the AI menu,
 * the equation editor, the drawing dialog, the comment composer and panel,
 * the suggestion popover, the node tree and versions. axe checks the whole
 * page each time, so the showcase around the editor is held to it too.
 */
recordViolations();

async function serious(page: Page): Promise<string[]> {
  // A part still fading in has a lower contrast than it will have: let the
  // running, finite animations (not a spinner's) settle first, briefly.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' &&
              a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
          )
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((done) => setTimeout(done, 2_000)),
    ]),
  );
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('the page', async ({ page }) => {
  const editor = await open(page, '/');
  await expect(editor.locator('[data-tei-equation] math')).toHaveCount(2, { timeout: 15_000 });
  expect(await serious(page)).toEqual([]);
});

test('the AI menu, with an answer', async ({ page }) => {
  const editor = await open(page, '/');
  await editor.locator('blockquote').click();
  await page.keyboard.press(`${MOD}+j`);
  const menu = page.locator('[data-tei-control="ai-menu"]');
  await menu.getByRole('combobox').fill('a closing line');
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 10_000 });
  expect(await serious(page)).toEqual([]);
});

test('the equation editor', async ({ page }) => {
  const editor = await open(page, '/');
  await expect(editor.locator('[data-tei-equation] math')).toHaveCount(2, { timeout: 15_000 });
  await editor.locator('[data-tei-equation="block"]').click();
  await expect(page.getByRole('textbox', { name: 'TeX', exact: true })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test('the drawing dialog', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route(/^https:\/\/esm\.sh\//, (route) => route.fulfill({ status: 404 }));
  const editor = await open(page, '/');
  await editor.locator('[data-tei-excalidraw] img').dblclick();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });
  await expect(dialog.locator('.excalidraw')).toBeVisible({ timeout: 30_000 });
  // Excalidraw's own canvas UI is its own business; ours is the dialog around it.
  const results = await new AxeBuilder({ page }).exclude('.excalidraw').analyze();
  expect(
    results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
});

test('the comment composer, then the panel', async ({ page }) => {
  const editor = await open(page, '/');
  await selectAWord(editor);
  await page.keyboard.press(`${MOD}+Alt+m`);
  const box = page.getByPlaceholder('Add a comment…');
  await expect(box).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await box.fill('Worth a second look');
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(page.locator('.tei-comments-panel')).toContainText('Worth a second look');
  expect(await serious(page)).toEqual([]);
});

test('the suggestion popover', async ({ page }) => {
  const editor = await open(page, '/');
  await editor.locator('[data-tei-suggestion]').first().click();
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test('the node tree', async ({ page }) => {
  await open(page, '/');
  await page.locator('[data-tei-control="document-menu-button"]').first().click();
  await page.getByRole('menuitemcheckbox', { name: 'Node tree' }).click();
  await expect(page.locator('.tei-tree-view')).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

test('collaboration, with versions open', async ({ page }) => {
  await open(page, '/collaboration');
  await page.getByTestId('person-Grace').getByRole('button', { name: 'Versions' }).click();
  await expect(page.locator('.tei-versions-save').first()).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

/** Escape closes it, and typing carries on where the caret was. */
async function escapesBack(page: Page, part: import('@playwright/test').Locator): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(part).toBeHidden();
  await expect(page.locator('[contenteditable="true"]').first()).toBeFocused();
}

test.describe('keyboard', () => {
  test('Escape closes the AI menu', async ({ page }) => {
    const editor = await open(page, '/');
    await editor.locator('blockquote').click();
    await page.keyboard.press(`${MOD}+j`);
    const menu = page.locator('[data-tei-control="ai-menu"]');
    await expect(menu.getByRole('combobox')).toBeFocused();
    await escapesBack(page, menu);
  });

  test('Escape closes the equation editor', async ({ page }) => {
    const editor = await open(page, '/');
    await expect(editor.locator('[data-tei-equation] math')).toHaveCount(2, { timeout: 15_000 });
    await editor.locator('[data-tei-equation="block"]').click();
    const tex = page.getByRole('textbox', { name: 'TeX', exact: true });
    await expect(tex).toBeFocused();
    await escapesBack(page, tex);
  });

  test('Escape closes the comment composer', async ({ page }) => {
    const editor = await open(page, '/');
    await selectAWord(editor);
    await page.keyboard.press(`${MOD}+Alt+m`);
    const box = page.getByPlaceholder('Add a comment…');
    await expect(box).toBeFocused();
    await escapesBack(page, box);
  });

  test('Escape closes the drawing dialog when nothing changed', async ({ page }) => {
    test.setTimeout(60_000);
    await page.route(/^https:\/\/esm\.sh\//, (route) => route.fulfill({ status: 404 }));
    const editor = await open(page, '/');
    await editor.locator('[data-tei-excalidraw] img').dblclick();
    const dialog = page.getByRole('dialog', { name: 'Drawing' });
    await expect(dialog.locator('.excalidraw')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('right to left', () => {
  /** Fully on screen. */
  async function onScreen(page: Page, part: import('@playwright/test').Locator): Promise<void> {
    const box = await part.boundingBox();
    const view = page.viewportSize();
    expect(box && view).toBeTruthy();
    if (!box || !view) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
  }

  test('the comments panel opens on the left, and the floating parts stay on screen', async ({
    page,
  }) => {
    const editor = await open(page, '/');
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
    });
    await expect(editor.locator('[data-tei-equation] math')).toHaveCount(2, { timeout: 15_000 });

    await editor.locator('[data-tei-equation="block"]').click();
    const tex = page.getByRole('textbox', { name: 'TeX', exact: true });
    await expect(tex).toBeVisible();
    await onScreen(page, tex);
    await page.keyboard.press('Escape');

    await editor.locator('blockquote').click();
    await page.keyboard.press(`${MOD}+j`);
    const menu = page.locator('[data-tei-control="ai-menu"]');
    await expect(menu).toBeVisible();
    await onScreen(page, menu);
    await page.keyboard.press('Escape');

    await selectAWord(editor);
    await page.keyboard.press(`${MOD}+Alt+m`);
    const box = page.getByPlaceholder('Add a comment…');
    await expect(box).toBeVisible();
    await onScreen(page, box);
    await box.fill('Worth a second look');
    await page.keyboard.press(`${MOD}+Enter`);
    const panel = page.locator('.tei-comments-panel');
    await expect(panel).toContainText('Worth a second look');
    // Once it has slid in.
    await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    await onScreen(page, panel);
    const width = page.viewportSize()?.width ?? 0;
    expect((await panel.boundingBox())?.x).toBeLessThan(width / 2);
  });
});
