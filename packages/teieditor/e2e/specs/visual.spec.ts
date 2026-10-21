import type { Locator, Page } from '@playwright/test';
import { expect, type Harness, settled, stubEmbedFrames, test } from './fixtures';

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

    test('code block bar with its language menu', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 768, height: 900 });
      await tei.open({
        content:
          '<pre><code class="language-ts">const editor = createEditor();\neditor.focus();</code></pre><p>After</p>',
      });
      await theme(tei.page, scheme);
      const code = tei.content.locator('.tei-code-block');
      await code.hover();
      await tei.page.getByRole('button', { name: 'Language: TypeScript' }).click();
      await expect(tei.page.getByRole('menu', { name: 'Language' })).toBeVisible();
      // The pointer stays on the trigger: moving it off would let the bar go.
      await settled(tei.page);
      const box = await code.boundingBox();
      if (!box) throw new Error('no code block');
      await shoot(tei, tei.page, `code-bar-${scheme}.png`, {
        clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: 640 },
      });
    });

    // A table with a header row, a merged cell, a colour and a striped body;
    // the pointer on it shows the + bars, the caret the cell's handle.
    const TABLE_SHOT =
      '<table><tr><th>Plan</th><th>Seats</th><th>Price</th></tr>' +
      '<tr><td>Starter</td><td>1</td><td style="background-color: rgba(34, 197, 94, 0.18)">Free</td></tr>' +
      '<tr><td>Team</td><td>10</td><td>$8 a seat</td></tr>' +
      '<tr><td colspan="2">Enterprise, any size</td><td>Talk to us</td></tr></table><p>After</p>';

    test('table with its + bars and cell handle', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 768, height: 600 });
      await tei.open({ content: TABLE_SHOT, flags: ['table'] });
      await theme(tei.page, scheme);
      await tei.content.getByText('Seats').click();
      await tei.content.getByText('Starter').hover();
      await expect(tei.page.getByRole('button', { name: 'Add a row' })).toBeVisible();
      await expect(tei.page.getByRole('button', { name: 'Cell options' }).first()).toBeVisible();
      await settled(tei.page);
      const box = await tei.content.locator('table').boundingBox();
      if (!box) throw new Error('no table');
      await shoot(tei, tei.page, `table-${scheme}.png`, {
        clip: { x: box.x - 12, y: box.y - 12, width: box.width + 48, height: box.height + 48 },
      });
    });

    test('table cell menu with its colour submenu', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 768, height: 900 });
      await tei.open({ content: TABLE_SHOT, flags: ['table'] });
      await theme(tei.page, scheme);
      await tei.content.getByText('Starter').click();
      await tei.page.getByRole('button', { name: 'Cell options' }).click();
      const menu = tei.page.getByRole('menu', { name: 'Table' });
      await menu.getByRole('menuitem', { name: 'Cell colour' }).click();
      await expect(tei.page.getByRole('menu', { name: 'Cell colour' })).toBeVisible();
      await settled(tei.page);
      const box = await tei.content.locator('table').boundingBox();
      if (!box) throw new Error('no table');
      await shoot(tei, tei.page, `table-menu-${scheme}.png`, {
        clip: { x: box.x - 12, y: box.y - 12, width: 560, height: 820 },
      });
    });

    test('table wider than the page, faded at the edge with more', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 375, height: 500 });
      const cells = (tag: string, text: string) => `<${tag}>${text}</${tag}>`.repeat(6);
      await tei.open({
        content: `<table><tr>${cells('th', 'Heading')}</tr><tr>${cells('td', 'Some cell text')}</tr></table>`,
        flags: ['table'],
      });
      await theme(tei.page, scheme);
      await expect(tei.content.locator('.tei-table-scroll')).toHaveAttribute(
        'data-tei-overflow',
        'right',
      );
      await settled(tei.page);
      const box = await tei.content.locator('.tei-table-scroll').boundingBox();
      if (!box) throw new Error('no table');
      await shoot(tei, tei.page, `table-wide-${scheme}.png`, {
        clip: { x: 0, y: box.y - 8, width: 375, height: box.height + 16 },
      });
    });

    const IMAGE_SHOT =
      '<p>Before</p><figure><img src="/photo.svg" alt="Hills" width="300" height="180">' +
      '<figcaption>Hills under a summer sun</figcaption></figure><p>After</p>';

    /** The figure and what floats round it. */
    async function shootImage(tei: Harness, name: string, below = 24) {
      await settled(tei.page);
      const box = await tei.content.locator('[data-tei-image]').boundingBox();
      if (!box) throw new Error('no image');
      await shoot(tei, tei.page, name, {
        clip: {
          x: box.x - 40,
          y: box.y - 64,
          width: box.width + 80,
          height: box.height + 64 + below,
        },
      });
    }

    test('selected image with its toolbar and resize handles', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 768, height: 600 });
      await tei.open({ content: IMAGE_SHOT, flags: ['image', 'plain'] });
      await theme(tei.page, scheme);
      await tei.content.locator('[data-tei-image] img').click();
      await expect(tei.page.locator('[data-tei-control="image-toolbar"]')).toBeVisible();
      await tei.page.mouse.move(0, 0);
      await shootImage(tei, `image-selected-${scheme}.png`);
    });

    test('image uploading, with its progress', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 768, height: 600 });
      await tei.open({ content: IMAGE_SHOT, flags: ['image', 'plain'] });
      await theme(tei.page, scheme);
      // The state an upload paints, set as the upload would: through the CSSOM.
      await tei.content.locator('[data-tei-image]').evaluate((el: HTMLElement) => {
        el.setAttribute('data-tei-uploading', '');
        el.style.setProperty('--tei-progress', '0.4');
      });
      await still(tei.page);
      await shootImage(tei, `image-uploading-${scheme}.png`);
    });

    test('empty caption, with its placeholder', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 768, height: 600 });
      await tei.open({
        content: '<p>Before</p><img src="/photo.svg" alt="Hills" width="300" height="180">',
        flags: ['image', 'plain'],
      });
      await theme(tei.page, scheme);
      await tei.content.locator('[data-tei-image] img').click();
      await tei.page.getByRole('button', { name: 'Caption', exact: true }).click();
      // Out of the caption, so no caret blinks in the shot; the placeholder stays.
      await tei.content.getByText('Before').click();
      await still(tei.page);
      await shootImage(tei, `image-caption-${scheme}.png`, 48);
    });

    test('inline images: one in a line of text, one floated, selected', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 768, height: 600 });
      const icon = '<img src="/photo.svg" alt="" width="40" height="24" data-inline="">';
      const float =
        '<img src="/photo.svg" alt="Hills" width="160" height="96" data-inline="" data-float="end">';
      await tei.open({
        content:
          `<p>An icon ${icon} in a line of text, sitting on its baseline.</p>` +
          `<p>${float}${'Text wraps round a picture floated to the side, line after line. '.repeat(4)}</p>`,
        flags: ['image', 'plain'],
      });
      await theme(tei.page, scheme);
      await tei.content.locator('.tei-inline-image[data-float="end"] img').click();
      await expect(tei.page.locator('[data-tei-control="image-toolbar"]')).toBeVisible();
      await tei.page.mouse.move(0, 0);
      await settled(tei.page);
      const box = await tei.content.boundingBox();
      if (!box) throw new Error('no content');
      await shoot(tei, tei.page, `image-inline-${scheme}.png`, {
        clip: { x: box.x, y: box.y - 56, width: box.width, height: box.height + 64 },
      });
    });

    test('image insert popover: upload or link', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 768, height: 600 });
      await tei.open({ flags: ['image', 'plain'] });
      await theme(tei.page, scheme);
      await tei.page.locator('[data-tei-control="insertImage"]').click();
      const form = tei.page.locator('[data-tei-control="image-insert"]');
      await expect(form).toBeVisible();
      await tei.page.mouse.move(0, 0);
      await settled(tei.page);
      const box = await form.boundingBox();
      if (!box) throw new Error('no form');
      await shoot(tei, tei.page, `image-insert-${scheme}.png`, {
        clip: { x: box.x - 16, y: box.y - 56, width: box.width + 32, height: box.height + 72 },
      });
    });

    const FILES_SHOT =
      '<p>Attached below.</p>' +
      '<a href="/report.pdf" download="Q3 report.pdf" data-tei-file="" data-size="2516582">Q3 report.pdf</a>' +
      '<a href="/a.zip" download="assets-final.zip" data-tei-file="" data-size="48234496">assets-final.zip</a>' +
      '<a href="/notes" download="notes" data-tei-file="">notes</a>' +
      '<a href="/l.docx" download="A file name too long for one line of its card, cut short.docx"' +
      ' data-tei-file="" data-size="5000">A file name too long for one line of its card, cut short.docx</a>';

    for (const width of [375, 768]) {
      test(`files at ${width}px: one selected with its toolbar, one uploading`, async ({ tei }) => {
        await tei.page.setViewportSize({ width, height: 600 });
        await tei.open({ content: FILES_SHOT, flags: ['file', 'plain'] });
        await theme(tei.page, scheme);
        const cards = tei.content.locator('[data-tei-file]');
        await cards.nth(1).click();
        await expect(tei.page.locator('[data-tei-control="file-toolbar"]')).toBeVisible();
        // The state an upload paints, set as the upload would: through the CSSOM.
        await cards.nth(2).evaluate((el: HTMLElement) => {
          el.setAttribute('data-tei-uploading', '');
          el.style.setProperty('--tei-progress', '0.4');
        });
        await still(tei.page);
        await shoot(tei, tei.page.getByTestId('editor'), `files-${scheme}-${width}.png`);
      });
    }

    test('file rename form', async ({ tei }) => {
      await tei.page.setViewportSize({ width: 768, height: 600 });
      await tei.open({ content: FILES_SHOT, flags: ['file', 'plain'] });
      await theme(tei.page, scheme);
      await tei.content.locator('[data-tei-file]').first().click();
      await tei.page
        .locator('[data-tei-control="file-toolbar"]')
        .getByRole('button', { name: 'Rename', exact: true })
        .click();
      const form = tei.page.locator('.tei-file-rename');
      await expect(form).toBeVisible();
      await still(tei.page);
      // The form and the toolbar it opened from.
      const box = await form.boundingBox();
      const bar = await tei.page.locator('[data-tei-control="file-toolbar"]').boundingBox();
      if (!box || !bar) throw new Error('no form');
      const x = Math.min(box.x, bar.x) - 16;
      const y = Math.min(box.y, bar.y) - 16;
      await shoot(tei, tei.page, `file-rename-${scheme}.png`, {
        clip: {
          x,
          y,
          width: Math.max(box.x + box.width, bar.x + bar.width) + 16 - x,
          height: Math.max(box.y + box.height, bar.y + bar.height) + 16 - y,
        },
      });
    });

    const EMBEDS_SHOT =
      '<p>A video, selected:</p>' +
      '<div data-tei-embed="youtube" data-id="dQw4w9WgXcQ"></div>' +
      '<p>A post on X:</p>' +
      '<div data-tei-embed="x" data-id="20" data-align="start"></div>' +
      '<p>From a provider not installed:</p>' +
      '<div data-tei-embed="gone" data-id="1"></div>';

    /** The caret at the end of the first line's text, where a click and End put it. */
    async function caretInText(tei: Harness) {
      await tei.content.locator('p').first().click();
      await tei.page.keyboard.press('End');
      await expect
        .poll(() => tei.page.evaluate(() => getSelection()?.anchorNode?.nodeType))
        .toBe(3); // a text node
    }

    async function openEmbeds(tei: Harness, width: number, content = EMBEDS_SHOT) {
      await tei.page.setViewportSize({ width, height: 900 });
      await stubEmbedFrames(tei.page, 240);
      await tei.open({ content, flags: ['embed', 'plain'] });
      await theme(tei.page, scheme);
    }

    for (const width of [375, 768]) {
      test(`embeds at ${width}px: a video selected with its toolbar, a post, an unknown one`, async ({
        tei,
      }) => {
        await openEmbeds(tei, width);
        // The post has grown to the height its frame reported.
        await expect
          .poll(() =>
            tei.content.locator('[data-tei-embed="x"] iframe').evaluate((el) => el.clientHeight),
          )
          .toBe(240);
        await tei.content.locator('[data-tei-embed="youtube"] .tei-embed-frame').click();
        await expect(tei.page.locator('[data-tei-control="embed-toolbar"]')).toBeVisible();
        await still(tei.page);
        await shoot(tei, tei.page.getByTestId('editor'), `embeds-${scheme}-${width}.png`);
      });
    }

    test('embed insert form, naming what the link embeds', async ({ tei }) => {
      await openEmbeds(tei, 768, '<p>Hello</p>');
      await caretInText(tei);
      await tei.page.locator('[data-item="insertEmbed"]').click();
      const form = tei.page.locator('[data-tei-control="embed-insert"]');
      await form.locator('input').fill('https://www.figma.com/design/abcdefghij1234/Plan');
      await expect(form.locator('.tei-hint')).toHaveText('Figma file');
      // A link longer than the field: its start, not wherever it scrolled to.
      await form.locator('input').evaluate((el: HTMLInputElement) => {
        el.setSelectionRange(0, 0);
        el.scrollLeft = 0;
      });
      await still(tei.page);
      const box = await form.boundingBox();
      if (!box) throw new Error('no form');
      await shoot(tei, tei.page, `embed-insert-${scheme}.png`, {
        clip: { x: box.x - 16, y: box.y - 56, width: box.width + 32, height: box.height + 72 },
      });
    });

    test('embed insert form with a link it cannot embed', async ({ tei }) => {
      await openEmbeds(tei, 375, '<p>Hello</p>');
      await caretInText(tei);
      // On a phone, Embed is in the toolbar's More menu: ask for the form directly.
      await tei.page.evaluate(() => window.__tei.editor.commands.openEmbedInsert());
      const form = tei.page.locator('[data-tei-control="embed-insert"]');
      await form.locator('input').fill('https://example.com/watch');
      await form.locator('input').press('Enter');
      await expect(form.getByRole('alert')).toBeVisible();
      await still(tei.page);
      await shoot(tei, tei.page, `embed-insert-invalid-${scheme}.png`);
    });

    test('the offer to embed a pasted link', async ({ tei }) => {
      await openEmbeds(tei, 768, '<p>Watch this:</p>');
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      await tei.page.evaluate(
        (href) => window.__tei.setClipSource(`<a href="${href}">${href}</a>`),
        url,
      );
      await tei.page.keyboard.press('ControlOrMeta+c');
      await tei.caretAtEnd();
      await tei.page.keyboard.press('Enter');
      await tei.page.keyboard.press('ControlOrMeta+v');
      const offer = tei.page.locator('[data-tei-control="embed-suggestion"]');
      await expect(offer).toBeVisible();
      await still(tei.page);
      const box = await offer.boundingBox();
      if (!box) throw new Error('no offer');
      await shoot(tei, tei.page, `embed-suggestion-${scheme}.png`, {
        clip: { x: 0, y: box.y - 80, width: 768, height: box.height + 96 },
      });
    });

    for (const width of [375, 768]) {
      test(`embeds with consent at ${width}px: a button to load each`, async ({ tei }) => {
        await openEmbeds(tei, width, '<p>Hello</p>');
        await tei.page.evaluate(() => window.__tei.setEmbedOptions({ consent: true }));
        await tei.caretAtEnd();
        await tei.page.evaluate(() => {
          window.__tei.editor.commands.insertEmbed('https://vimeo.com/76979871');
          window.__tei.editor.commands.insertEmbed('https://x.com/jack/status/20');
        });
        await expect(tei.page.locator('[data-tei-embed-load]')).toHaveCount(2);
        await tei.page.evaluate(() => window.__tei.editor.blur());
        await still(tei.page);
        await shoot(tei, tei.page.getByTestId('editor'), `embeds-consent-${scheme}-${width}.png`);
      });
    }

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
