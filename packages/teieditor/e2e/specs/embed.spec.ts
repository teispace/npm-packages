import { expect, type Harness, settled, stubEmbedFrames, test } from './fixtures';

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const POST = 'https://x.com/jack/status/20';
const FRAME = `<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>`;

const embed = (tei: Harness) => tei.page.locator('.tei-embed');
const frame = (tei: Harness) => embed(tei).locator('iframe');
const toolbar = (tei: Harness) => tei.page.locator('[data-tei-control="embed-toolbar"]');
const button = (tei: Harness, name: string) =>
  toolbar(tei).getByRole('button', { name, exact: true });
const popover = (tei: Harness) => tei.page.locator('[data-tei-control="embed-insert-popover"]');
const offer = (tei: Harness) => tei.page.locator('[data-tei-control="embed-suggestion"]');

async function open(tei: Harness, content = '<p>Hello</p>') {
  await stubEmbedFrames(tei.page);
  await tei.open({ content, flags: ['embed', 'plain'] });
}

async function selectEmbed(tei: Harness) {
  await embed(tei).locator('.tei-embed-frame').click();
  await expect(embed(tei)).toHaveAttribute('data-tei-selected', '');
  await expect(toolbar(tei)).toBeVisible();
}

/** Paste a link on its own, as copying it from a page does. */
async function pasteLink(tei: Harness, url: string) {
  await tei.page.evaluate(
    (href) => window.__tei.setClipSource(`<a href="${href}">${href}</a>`),
    url,
  );
  await tei.page.keyboard.press('ControlOrMeta+c');
  await tei.caretAtEnd();
  await tei.page.keyboard.press('Enter');
  await tei.page.keyboard.press('ControlOrMeta+v');
}

test.describe('embeds', () => {
  test('from the toolbar: the form names what a link embeds, then embeds it', async ({ tei }) => {
    await open(tei);
    await tei.caretAtEnd();
    await tei.page.locator('[data-item="insertEmbed"]').click();
    await expect(popover(tei)).toBeVisible();
    const field = popover(tei).locator('[data-tei-control="embed-url"]');
    await expect(field).toBeFocused();
    await expect(popover(tei).locator('.tei-hint')).toHaveText(
      'From YouTube, Vimeo, X, Figma, or Loom',
    );
    await field.fill(VIDEO);
    await expect(popover(tei).locator('.tei-hint')).toHaveText('YouTube video');
    await field.press('Enter');
    await expect(popover(tei)).toHaveCount(0);
    await expect(frame(tei)).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    await expect(frame(tei)).toHaveAttribute('title', 'YouTube video');
    await expect(frame(tei)).toHaveAttribute('sandbox', /allow-scripts/);
    await expect(frame(tei).contentFrame().locator('p')).toHaveText('www.youtube-nocookie.com');
    // The caret goes on after it.
    await tei.page.keyboard.type('After');
    expect(await tei.text()).toContain('After');
    const html = await tei.html();
    expect(html).toMatch(
      /^<p>Hello<\/p><iframe [^>]*data-tei-embed="youtube"[^>]*><\/iframe><p>After<\/p>$/,
    );
  });

  test('a link no provider reads: the form says which sites it can embed', async ({ tei }) => {
    await open(tei);
    await tei.caretAtEnd();
    await tei.page.locator('[data-item="insertEmbed"]').click();
    const field = popover(tei).locator('[data-tei-control="embed-url"]');
    await field.fill('https://example.com/video');
    await field.press('Enter');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(popover(tei).getByRole('alert')).toHaveText(
      'This link cannot be embedded. From YouTube, Vimeo, X, Figma, or Loom',
    );
    await expect(embed(tei)).toHaveCount(0);
    // Escape closes it and gives the editor back the caret.
    await field.press('Escape');
    await expect(popover(tei)).toHaveCount(0);
    await expect(tei.content).toBeFocused();
  });

  test('a provider in the slash menu asks for its own link', async ({ tei }) => {
    await open(tei);
    await tei.caretAtEnd();
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/vimeo');
    await tei.page.keyboard.press('Enter');
    const field = popover(tei).locator('[data-tei-control="embed-url"]');
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('placeholder', 'Paste a link to the Vimeo video');
    // Only Vimeo's links, for Vimeo.
    await field.fill(VIDEO);
    await expect(popover(tei).locator('.tei-hint')).toHaveText('From Vimeo');
    await field.fill('https://vimeo.com/76979871');
    await field.press('Enter');
    await expect(frame(tei)).toHaveAttribute(
      'src',
      'https://player.vimeo.com/video/76979871?dnt=1',
    );
  });

  test('takes no clicks while editing until selected; its toolbar aligns and deletes it', async ({
    tei,
  }) => {
    await open(tei, `<p>Before</p>${FRAME}<p>After</p>`);
    await expect(frame(tei)).toHaveCSS('pointer-events', 'none');
    await selectEmbed(tei);
    await expect(frame(tei)).toHaveCSS('pointer-events', 'auto');
    await expect(toolbar(tei).getByRole('button')).toHaveCount(6);
    await button(tei, 'Align right').click();
    await expect(embed(tei)).toHaveAttribute('data-align', 'end');
    await expect(button(tei, 'Align right')).toHaveAttribute('aria-pressed', 'true');
    expect(await tei.html()).toContain('data-align="end"');
    await button(tei, 'Delete embed').click();
    await expect(embed(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Before</p><p>After</p>');
  });

  test('read-only: the frame takes clicks and nothing is offered', async ({ tei }) => {
    await open(tei, `<p>Before</p>${FRAME}`);
    // Its toolbar goes, though it was selected.
    await selectEmbed(tei);
    await tei.page.evaluate(() => window.__tei.editor.setEditable(false));
    await expect(toolbar(tei)).toHaveCount(0);
    await expect(frame(tei)).toHaveCSS('pointer-events', 'auto');
    await embed(tei).click();
    await expect(toolbar(tei)).toHaveCount(0);
  });

  test('Backspace in the empty line after it selects it, then deletes it', async ({ tei }) => {
    await open(tei, `<p>Before</p>${FRAME}<p></p>`);
    await tei.content.locator('p').last().click();
    // The click's caret reaches the editor on the selectionchange after it.
    await tei.page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    await tei.page.keyboard.press('Backspace');
    await expect(embed(tei)).toHaveAttribute('data-tei-selected', '');
    expect(await tei.html()).toMatch(/^<p>Before<\/p><iframe [^>]+><\/iframe>$/);
    await tei.page.keyboard.press('Backspace');
    await expect(embed(tei)).toHaveCount(0);
  });

  test('copy link: the button says so', async ({ tei, page, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(tei, `<p>Before</p>${FRAME}`);
    await selectEmbed(tei);
    await button(tei, 'Copy link').click();
    await expect(button(tei, 'Link copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    await expect(button(tei, 'Copy link')).toBeVisible();
  });

  test('open original: its page in a new tab', async ({ tei, page }) => {
    await open(tei, `<p>Before</p>${FRAME}`);
    await page
      .context()
      .route('https://www.youtube.com/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<p>YouTube</p>' }),
      );
    await selectEmbed(tei);
    const popup = page.waitForEvent('popup');
    await button(tei, 'Open original').click();
    const tab = await popup;
    expect(tab.url()).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    // The page cannot reach back, nor learn where it was opened from.
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    expect(await tab.evaluate(() => document.referrer)).toBe('');
    await tab.close();
  });

  test('a pasted link: Enter takes the offer to embed it', async ({ tei }) => {
    await open(tei);
    await pasteLink(tei, VIDEO);
    await expect(offer(tei)).toBeVisible();
    await expect(offer(tei).getByRole('button').first()).toHaveText(/Embed YouTube video/);
    await tei.page.keyboard.press('Enter');
    await expect(offer(tei)).toHaveCount(0);
    await expect(embed(tei)).toHaveAttribute('data-id', 'dQw4w9WgXcQ');
    await expect(tei.page.locator('[data-tei-content] a')).toHaveCount(0);
  });

  test('a pasted link: Escape, a click on Keep or typing on keeps the link', async ({ tei }) => {
    await open(tei);
    await pasteLink(tei, VIDEO);
    await expect(offer(tei)).toBeVisible();
    // The link's own toolbar makes way for the offer, and comes back after.
    const preview = tei.page.locator('[data-tei-control="link-preview"]');
    await expect(preview).toHaveCount(0);
    await tei.page.keyboard.press('Escape');
    await expect(offer(tei)).toHaveCount(0);
    await expect(tei.content).toBeFocused();
    await expect(preview).toBeVisible();

    await pasteLink(tei, VIDEO);
    await offer(tei)
      .getByRole('button', { name: /Keep the link/ })
      .click();
    await expect(offer(tei)).toHaveCount(0);
    await expect(tei.content).toBeFocused();

    await pasteLink(tei, VIDEO);
    await expect(offer(tei)).toBeVisible();
    await tei.page.keyboard.type(' more');
    await expect(offer(tei)).toHaveCount(0);
    await expect(embed(tei)).toHaveCount(0);
    await expect(tei.page.locator('[data-tei-content] a')).toHaveCount(3);
  });

  test('autoEmbed always: a pasted link embeds at once', async ({ tei }) => {
    await open(tei);
    await tei.page.evaluate(() => window.__tei.setEmbedOptions({ autoEmbed: 'always' }));
    await pasteLink(tei, POST);
    await expect(embed(tei)).toHaveAttribute('data-id', '20');
    await expect(offer(tei)).toHaveCount(0);
  });

  test('a post on X grows to the height its frame reports', async ({ tei }) => {
    await open(tei, `<p>Before</p><div data-tei-embed="x" data-id="20"></div>`);
    await expect(frame(tei)).toHaveAttribute('src', /platform\.twitter\.com.*id=20/);
    await expect
      .poll(() => frame(tei).evaluate((el) => el.getBoundingClientRect().height))
      .toBe(480);
  });

  test('consent: loads nothing until the reader asks', async ({ tei, page }) => {
    await open(tei);
    await page.evaluate(() => window.__tei.setEmbedOptions({ consent: true }));
    await tei.caretAtEnd();
    await page.evaluate((url) => window.__tei.editor.commands.insertEmbed(url), VIDEO);
    const load = embed(tei).locator('[data-tei-embed-load]');
    await expect(load).toBeVisible();
    await expect(load).toContainText('Load YouTube video');
    await expect(load).toContainText('Content from www.youtube-nocookie.com');
    await expect(frame(tei)).not.toHaveAttribute('src');
    await expect(frame(tei)).toBeHidden();
    await load.click();
    await expect(load).toHaveCount(0);
    await expect(frame(tei)).toHaveAttribute('src', /youtube-nocookie/);
    await settled(page);
  });

  test('pasted HTML: a provider frame is kept, any other frame goes', async ({ tei, page }) => {
    await open(tei);
    await page.evaluate(
      (frame) =>
        window.__tei.setClipSource(
          `<p>One</p>${frame}<iframe src="https://evil.example/x"></iframe><p>Two</p>`,
          true,
        ),
      FRAME,
    );
    await page.keyboard.press('ControlOrMeta+c');
    await tei.forgetProblems();
    await tei.caretAtEnd();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(embed(tei)).toHaveCount(1);
    await expect(embed(tei)).toHaveAttribute('data-id', 'dQw4w9WgXcQ');
    expect(await tei.html()).not.toContain('evil.example');
  });
});
