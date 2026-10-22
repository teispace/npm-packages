import { expect, test } from '@playwright/test';
import { expectNoViolations, MOD, open, recordViolations } from './strict';

/**
 * The heavier features, each used as a person would, in the showcase and
 * under the strict CSP: the AI menu, equations, drawings, comments,
 * suggested changes and collaboration.
 */
recordViolations();

test('the AI menu streams an answer in, and Accept keeps it', async ({ page }) => {
  const editor = await open(page, '/');
  // A click puts the caret in (End on a Mac scrolls the page instead).
  await editor.locator('blockquote').click();
  await page.keyboard.press(`${MOD}+j`);
  const menu = page.locator('[data-tei-control="ai-menu"]');
  await expect(menu).toBeVisible();
  await menu.getByRole('combobox', { name: 'Ask AI to write or edit…' }).fill('a closing line');
  await page.keyboard.press('Enter');
  await expect(menu.getByLabel('Answer')).toContainText('Connect a model', { timeout: 10_000 });
  await menu.getByRole('button', { name: 'Accept' }).click();
  await expect(menu).toBeHidden();
  await expect(editor).toContainText('Connect a model to get a real one.');
  await expectNoViolations(page);
});

test('equations draw as MathML, and one edits in place', async ({ page }) => {
  const editor = await open(page, '/');
  // KaTeX loads with the first equation on the page.
  await expect(editor.locator('[data-tei-equation] math')).toHaveCount(2, { timeout: 15_000 });
  await editor.locator('[data-tei-equation="inline"]').click();
  const tex = page.getByRole('textbox', { name: 'TeX', exact: true });
  await expect(tex).toBeVisible();
  await tex.fill('a^2 + b^2 = c^2');
  await page.keyboard.press('Enter');
  await expect(tex).toBeHidden();
  await expect(editor.locator('[data-tei-equation="inline"] math')).toContainText('c');
  await expectNoViolations(page);
});

test('a drawing shows its picture, and opens in Excalidraw', async ({ page }) => {
  test.setTimeout(60_000);
  // Excalidraw's fonts come from its CDN: stood in for, to stay off the network.
  await page.route(/^https:\/\/esm\.sh\//, (route) => route.fulfill({ status: 404 }));
  const editor = await open(page, '/');
  const drawing = editor.locator('[data-tei-excalidraw]');
  // Its saved picture, shown without Excalidraw.
  await expect(drawing.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await drawing.locator('img').dblclick();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });
  await expect(dialog.locator('.excalidraw')).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expectNoViolations(page);
});

test('a suggested change is accepted from its popover', async ({ page }) => {
  const editor = await open(page, '/');
  const suggestions = editor.locator('[data-tei-suggestion]');
  await expect(suggestions).toHaveCount(2);
  await suggestions.first().click();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(suggestions).toHaveCount(1);
  await expect(editor).toContainText('is proposed');
  await expectNoViolations(page);
});

test('a comment on selected text shows in the panel', async ({ page }) => {
  const editor = await open(page, '/');
  await editor.locator('blockquote').dblclick();
  await page.keyboard.press(`${MOD}+Alt+m`);
  const box = page.getByPlaceholder('Add a comment…');
  await expect(box).toBeVisible();
  await box.fill('Worth a second look');
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(editor.locator('[data-tei-comment]').first()).toBeVisible();
  await expect(page.locator('.tei-comments-panel')).toContainText('Worth a second look');
  await expectNoViolations(page);
});

test('two editors, and another tab, edit one document', async ({ page, context }) => {
  await open(page, '/collaboration');
  const ada = page.getByRole('textbox', { name: "Ada's document" });
  const grace = page.getByRole('textbox', { name: "Grace's document" });
  await expect(ada).toContainText('Planning notes');
  await expect(grace).toContainText('Planning notes');
  await ada.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Ada was here.');
  await expect(grace).toContainText('Ada was here.');

  const other = await context.newPage();
  await other.goto('/collaboration');
  await expect(other.getByRole('textbox', { name: "Grace's document" })).toContainText(
    'Ada was here.',
  );
  await other.close();

  await page.getByTestId('person-Grace').getByRole('button', { name: 'Versions' }).click();
  await expect(page.locator('.tei-versions-save').first()).toBeVisible();
  await expectNoViolations(page);
});

test('the widgets and inline extras read in, and the contents list the headings', async ({
  page,
}) => {
  const editor = await open(page, '/');
  await expect(editor.locator('.tei-columns > [data-tei-column]')).toHaveCount(2);
  await expect(editor.locator('.tei-card')).toBeVisible();
  await expect(editor.locator('.tei-sticky')).toBeVisible();
  const poll = editor.locator('[data-tei-poll]');
  await expect(poll.getByRole('textbox', { name: 'Ask a question' })).toHaveValue('Which feature next?');
  await expect(poll.getByRole('meter', { name: 'Footnotes: 2 votes' })).toBeVisible();
  await expect(editor.locator('time')).toContainText('2026');
  await expect(editor.locator('[data-tei-mention]')).toContainText('Grace Hopper');
  await expect(editor.locator('[data-tei-hashtag]')).toHaveText('#launch');
  await expect(editor.locator('ruby rt')).toHaveText('かんじ');
  await expect(editor.locator('.tei-special-text')).toContainText('bracketed');
  const contents = editor.locator('[data-tei-toc] a');
  await expect(contents.filter({ hasText: 'In a line of text' })).toHaveCount(1);
  expect(await contents.count()).toBeGreaterThanOrEqual(10);
  await expectNoViolations(page);
});

test('Shiki colours code in place of Prism, and the document carries over', async ({ page }) => {
  const editor = await open(page, '/');
  await editor.locator('h1').click();
  await page.keyboard.type(' today');
  await page.getByRole('group', { name: 'Code colours' }).getByRole('button', { name: 'shiki' }).click();
  const fresh = page.locator('[contenteditable="true"]').first();
  await expect(fresh).toHaveAttribute('data-tei-shiki', '', { timeout: 15_000 });
  await expect(fresh.locator('h1')).toContainText('today');
  // A token coloured by the theme, through a custom property.
  await expect
    .poll(() =>
      fresh
        .locator('code span')
        .evaluateAll((spans) =>
          spans.some((span) => (span as HTMLElement).style.cssText.includes('--tei-shiki-')),
        ),
    )
    .toBe(true);
  await expectNoViolations(page);
});

test('autocomplete suggests the rest of a word, and Tab takes it', async ({ page }) => {
  const editor = await open(page, '/');
  await page.getByRole('checkbox', { name: 'Autocomplete' }).check();
  const fresh = page.locator('[contenteditable="true"]').first();
  await fresh.locator('blockquote').click();
  // To the end of the line (End on a Mac scrolls the page instead).
  await page.keyboard.press(MOD === 'Meta' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.type(' becau');
  await expect(page.locator('[data-tei-autocomplete]')).toContainText('se');
  await page.keyboard.press('Tab');
  await expect(fresh.locator('blockquote')).toContainText('because');
  await expect(editor).toBeVisible();
  await expectNoViolations(page);
});
