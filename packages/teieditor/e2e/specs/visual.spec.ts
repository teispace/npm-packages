import type { Locator, Page } from '@playwright/test';
import { expect, type Harness, settled, test } from './fixtures';

/**
 * Pixel baselines. Fonts and anti-aliasing differ by platform, so these run
 * only in the Linux Playwright image (`yarn test:visual`), locally and in CI
 * alike; the baselines under `__screenshots__` come from that image.
 */

const DOCUMENT = [
  '<h1>Release notes</h1>',
  '<p>Plain text, <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>struck</s>,',
  ' <code>inline code</code> and <a href="https://example.com">a link</a>.</p>',
  '<h2>What changed</h2>',
  '<blockquote>Quoted text sits on its own rule.</blockquote>',
  '<ul><li>First point</li><li>Second point<ul><li>Nested point</li></ul></li></ul>',
  '<ol><li>Step one</li><li>Step two</li></ol>',
  '<ul data-lexical-list-type="check"><li aria-checked="true">Done</li>',
  '<li aria-checked="false">To do</li></ul>',
  '<pre><code class="language-ts">const editor = createEditor();\neditor.focus();</code></pre>',
  '<hr><p>The end.</p>',
].join('');

const WIDTHS = [375, 768, 1280] as const;

/** Nothing under the pointer, nothing focused, every animation done. */
async function still(page: Page) {
  await page.mouse.move(0, 0);
  await settled(page);
}

/** Dark is opt-in (`data-theme` on an ancestor); the page chrome follows the media query. */
async function theme(page: Page, scheme: 'light' | 'dark') {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, scheme);
}

/**
 * Match a baseline. The page must be clean before the shot; what the shot
 * itself causes is dropped: WebKit's screenshotter injects a style element,
 * which the strict CSP reports, whatever the screenshot options.
 */
async function shoot(
  tei: Harness,
  target: Page | Locator,
  name: string,
  options?: { clip: { x: number; y: number; width: number; height: number } },
) {
  expect(await tei.problems()).toEqual([]);
  await expect(target).toHaveScreenshot(name, options);
  await tei.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  await tei.forgetProblems();
}

async function openPopover(tei: Harness, trigger: string) {
  await tei.page.getByTestId(trigger).click();
  const popover = tei.page.locator('[data-tei-part="popover"]:popover-open').first();
  await expect(popover).toBeVisible();
  await still(tei.page);
  return popover;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} @visual`, () => {
    test.use({ colorScheme: scheme });

    for (const width of WIDTHS) {
      test(`editor at ${width}px`, async ({ tei }) => {
        await tei.page.setViewportSize({ width, height: 900 });
        await tei.open({ content: DOCUMENT });
        await theme(tei.page, scheme);
        await still(tei.page);
        await shoot(tei, tei.page.getByTestId('editor'), `editor-${scheme}-${width}.png`);
      });
    }

    test('empty editor with its placeholder', async ({ tei }) => {
      await tei.open({ content: '' });
      await theme(tei.page, scheme);
      await still(tei.page);
      await shoot(tei, tei.page.getByTestId('editor'), `placeholder-${scheme}.png`);
    });

    test('dropdown menu with a submenu', async ({ tei }) => {
      await tei.open();
      await theme(tei.page, scheme);
      await openPopover(tei, 'menu-trigger');
      const sub = tei.page.locator('[role="menuitem"][aria-haspopup="menu"]').first();
      await sub.hover();
      await expect(tei.page.locator('[data-tei-part="popover"]:popover-open')).toHaveCount(2);
      await settled(tei.page);
      await shoot(tei, tei.page, `menu-${scheme}.png`, {
        clip: { x: 0, y: 0, width: 1280, height: 720 },
      });
    });

    for (const [name, trigger] of [
      ['colour', 'color-trigger'],
      ['grid', 'grid-trigger'],
    ] as const) {
      test(`${name} picker`, async ({ tei }) => {
        await tei.open();
        await theme(tei.page, scheme);
        const popover = await openPopover(tei, trigger);
        await shoot(tei, popover, `${name}-${scheme}.png`);
      });
    }

    test('dialog', async ({ tei }) => {
      await tei.open();
      await theme(tei.page, scheme);
      await tei.page.getByTestId('dialog-trigger').click();
      const dialog = tei.page.locator('dialog[open]');
      await expect(dialog).toBeVisible();
      await still(tei.page);
      await shoot(tei, tei.page, `dialog-${scheme}.png`);
    });

    test("the toolbar's More menu on a phone, with a submenu", async ({ tei }) => {
      await tei.page.setViewportSize({ width: 375, height: 700 });
      await tei.open({ content: DOCUMENT });
      await theme(tei.page, scheme);
      // A caret in the text, so the style submenus have something to act on.
      await tei.caretAtEnd();
      await tei.page.locator('[data-tei-control="more"]').click();
      const sub = tei.page.getByRole('menu', { name: 'More' }).getByRole('menuitem', {
        name: 'Text colour',
      });
      // Hover once the menu has finished sliding in, or the pointer can land beside it.
      await settled(tei.page);
      await sub.hover();
      await expect(tei.page.locator('[data-tei-part="popover"]:popover-open')).toHaveCount(2);
      await settled(tei.page);
      await shoot(tei, tei.page, `more-menu-${scheme}.png`);
    });

    test('tooltip on a toolbar button', async ({ tei }) => {
      await tei.open();
      await theme(tei.page, scheme);
      await tei.page.locator('[data-item="bold"]').hover();
      const tooltip = tei.page.locator('[data-tei-part="tooltip"]');
      await expect(tooltip).toBeVisible();
      await settled(tei.page);
      // The tooltip floats outside the editor box: shoot the area holding both.
      const editor = await tei.page.getByTestId('editor').boundingBox();
      if (!editor) throw new Error('not rendered');
      await shoot(tei, tei.page, `tooltip-${scheme}.png`, {
        clip: { x: editor.x - 8, y: editor.y - 8, width: 360, height: 160 },
      });
    });
  });
}
