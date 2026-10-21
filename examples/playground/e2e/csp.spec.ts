import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * The playground serves every page under a strict nonce CSP (src/proxy.ts):
 * no `'unsafe-inline'` for scripts, styles or style attributes. Anything the
 * editor injected outside the CSP-safe paths would be blocked and reported.
 * Each test records violations two ways — the in-page
 * `securitypolicyviolation` event and the `report-uri` endpoint — and asserts
 * there are none while the editor demonstrably did its job.
 */

declare global {
  interface Window {
    __violations: string[];
  }
}

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * A per-test marker in the page URL. The report endpoint is shared by tests
 * running in parallel across three browsers, so each test only counts the
 * reports whose document-uri carries its own marker.
 */
function runId(): string {
  const info = test.info();
  return `${info.project.name}-${info.testId}`;
}

async function open(page: Page, path: string): Promise<Locator> {
  await page.goto(`${path}?run=${runId()}`);
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  return editor;
}

async function expectNoViolations(page: Page): Promise<void> {
  // report-uri delivery is asynchronous; give it a moment to land.
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  const reports = (await (await page.request.get('/api/csp-report')).json()) as Array<{
    'csp-report'?: { 'document-uri'?: string };
  }>;
  expect(reports.filter((r) => r['csp-report']?.['document-uri']?.includes(runId()))).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // The embed providers' frames, stood in for: tests stay off the network.
  await page.context().route(
    /^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com|platform\.twitter\.com|www\.figma\.com|www\.loom\.com)\//,
    (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Embedded</p>' }),
  );
  // Init scripts are injected by the browser driver, outside the page's CSP.
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
    });
  });
});

test('the page really is under the strict policy', async ({ page }) => {
  const response = await page.goto(`/?run=${runId()}`);
  const policy = response?.headers()['content-security-policy'] ?? '';
  expect(policy).toMatch(/style-src 'self' 'nonce-[^']+'/);
  expect(policy).not.toContain('unsafe-inline');
  // Sanity: an un-nonced <style> and a style attribute ARE reported, so a
  // clean run means something.
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = 'body{outline:0}';
    document.head.appendChild(s);
    document.body.setAttribute('style', 'outline:0');
  });
  await expect.poll(() => page.evaluate(() => window.__violations.length)).toBeGreaterThan(1);
});

const PAGES = [
  { path: '/', slash: true },
  { path: '/notion', slash: true },
  { path: '/comments', slash: false },
  { path: '/customize', slash: true },
  { path: '/headless', slash: false },
];

for (const { path, slash } of PAGES) {
  test(`${path}: typing, formatting and theme switching report nothing`, async ({ page }) => {
    const editor = await open(page, path);
    await editor.click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.type('Hello CSP');
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+b`);
    await expect(editor.locator('strong').first()).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second line');
    // Floating UI places itself through the CSSOM, which style-src does not
    // cover; setAttribute('style') would be reported.
    if (slash) {
      await page.keyboard.press('Enter');
      await page.keyboard.type('/');
      await expect(page.locator('[data-tei-control="slash-menu"]')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expectNoViolations(page);
  });
}

/** Paste HTML the way a browser delivers a clipboard paste. */
async function pasteHtml(editor: Locator, html: string): Promise<void> {
  await editor.evaluate((el, markup) => {
    const data = new DataTransfer();
    data.setData('text/html', markup);
    data.setData('text/plain', 'pasted');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    // Firefox ignores `clipboardData` in the constructor, so attach it directly.
    Object.defineProperty(event, 'clipboardData', { value: data });
    el.dispatchEvent(event);
  }, html);
}

test('pasted script-running URLs never reach the page', async ({ page }) => {
  const editor = await open(page, '/');
  await editor.click();
  await pasteHtml(
    editor,
    '<p><a href="javascript:window.__pwned=1">link</a> <a href="JaVaScRiPt:window.__pwned=1">two</a></p>' +
      '<p><img src="javascript:window.__pwned=1" alt="x"><a href="data:text/html,<script>alert(1)</script>">d</a></p>',
  );
  await expect(editor).toContainText('link');
  const urls = await page.evaluate(() =>
    [...document.querySelectorAll('[contenteditable] [href], [contenteditable] [src]')].map(
      (el) => el.getAttribute('href') ?? el.getAttribute('src'),
    ),
  );
  for (const url of urls) expect(url).not.toMatch(/^\s*(javascript|data:text)/i);
  await editor.locator('a').first().click({ modifiers: [MOD] });
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  await expectNoViolations(page);
});

test('the link editor refuses a javascript: URL and accepts an https one', async ({ page }) => {
  const editor = await open(page, '/');
  await editor.click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type('click me');
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press(`${MOD}+k`);
  const form = page.locator('[data-tei-control="link-editor"]');
  const input = form.getByPlaceholder('Paste or type a link');
  await input.fill('javascript:alert(1)');
  await input.press('Enter');
  await expect(form.getByRole('alert')).toHaveText('This link is not allowed');
  await expect(editor.locator('a')).toHaveCount(0);

  await input.fill('example.com/docs');
  await input.press('Enter');
  await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/docs');
  await expectNoViolations(page);
});

test('server-rendered content: styled, static, and nothing reported', async ({ page }) => {
  await page.goto(`/server?run=${runId()}`);
  const article = page.getByTestId('server-html');
  await expect(article.locator('h1')).toHaveText('Welcome to teieditor');
  // Check lists as task lists: a box a static page cannot pretend to operate.
  const boxes = article.locator('li.task-list-item > input[type="checkbox"]');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.first()).toBeDisabled();
  await expect(boxes.first()).toBeChecked();
  await expect(article.locator('[role="checkbox"], [contenteditable]')).toHaveCount(0);
  // The prose styles reach it: headings in the editor's weight.
  expect(await article.locator('h1').evaluate((el) => getComputedStyle(el).fontWeight)).toBe('650');
  await expectNoViolations(page);
});

test('the editor is in the server HTML, and stays put as it mounts', async ({ browser, page }) => {
  /** Each block's height, and whether the server held back a font size in it. */
  const layout = (content: Locator) =>
    content.evaluate((el) =>
      [...el.children].map((child) => ({
        height: Math.round(child.getBoundingClientRect().height),
        // The block handle's gutter is there before the handle loads.
        left: Math.round(child.getBoundingClientRect().left),
        sized: child.querySelector('[data-tei-style*="font-size"]') !== null,
      })),
    );

  // Without scripts: what a reader sees before the editor loads.
  const still = await browser.newContext({ javaScriptEnabled: false });
  const before = await still.newPage();
  await before.goto(`/?run=${runId()}`);
  const server = before.locator('[data-tei-content]');
  await expect(server.getByRole('heading', { level: 1 })).toHaveText('Welcome to teieditor');
  await expect(server).toHaveClass(/tei-prose/);
  const served = await layout(server);
  const font = (code: Locator) => code.evaluate((el) => getComputedStyle(el).fontFamily);
  const servedCode = await font(server.locator('p code').first());
  await still.close();

  const editor = await open(page, '/');
  // The editor's own DOM now, with the text styles the server held back.
  await expect(editor.locator('.tei-h1')).toHaveText('Welcome to teieditor');
  await expect(editor).not.toHaveClass(/tei-prose/);
  await expect(editor.getByText('colour', { exact: true })).toHaveCSS('color', 'rgb(220, 38, 38)');
  const mounted = await layout(editor);
  // Inline code in the editor's monospace before it mounts too.
  expect(servedCode).toBe(await font(editor.locator('.tei-code').first()));
  expect(mounted).toHaveLength(served.length);
  // Every block is as tall as the server drew it, but one whose font size
  // waited for the editor (a strict CSP blocks style attributes).
  expect(served.filter((block) => block.sized)).toHaveLength(1);
  for (const [i, block] of served.entries()) {
    if (!block.sized) expect(Math.abs((mounted[i]?.height ?? 0) - block.height)).toBeLessThanOrEqual(1);
    expect(mounted[i]?.left).toBe(block.left);
  }
  await expectNoViolations(page);
});

/** WCAG contrast ratio between two `rgb()`/`rgba()` colours, alpha composited over the second. */
function contrast(fg: string, bg: string): number {
  const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
  const [br, bgG, bb] = parse(bg);
  const [r, g, b, a = 1] = parse(fg);
  const mix = [r * a + br * (1 - a), g * a + bgG * (1 - a), b * a + bb * (1 - a)];
  const lum = ([x, y, z]: number[]) => {
    const [R, G, B] = [x, y, z].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const [hi, lo] = [lum(mix), lum([br, bgG, bb])].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

for (const theme of ['light', 'dark'] as const) {
  test(`per-block placeholders show, legibly, in ${theme} mode`, async ({ page }) => {
    // The Notion-style page labels each empty block.
    const editor = await open(page, '/notion');
    await page.getByRole('button', { name: `Switch to ${theme} theme` }).click();
    await editor.locator('h1').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    const empty = editor.locator('[data-tei-placeholder]').last();
    await expect(empty).toBeAttached();
    const { content, color, background } = await empty.evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      // Toolkits may compute colours in other spaces; resolve through canvas
      // so the comparison is always between sRGB values.
      const toRgb = (c: string) => {
        const ctx = document.createElement('canvas').getContext('2d');
        if (!ctx) return c;
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      };
      let node: Element | null = el;
      let bg = 'rgb(255, 255, 255)';
      while (node) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && !/rgba\(.*,\s*0\)|transparent/.test(c)) {
          bg = c;
          break;
        }
        node = node.parentElement;
      }
      return { content: before.content, color: toRgb(before.color), background: toRgb(bg) };
    });
    expect(content).not.toBe('none');
    expect(content).toContain(await empty.getAttribute('data-tei-placeholder'));
    expect(contrast(color, background)).toBeGreaterThanOrEqual(3);
    await expectNoViolations(page);
  });
}

test('images: a dropped file uploads, resizes and aligns, reporting nothing', async ({ page }) => {
  const editor = await open(page, '/');
  const figures = editor.locator('[data-tei-image]');
  const before = await figures.count();
  // A dropped picture: the upload preview is a blob: URL, which img-src allows.
  await editor.locator('p').first().evaluate((el) => {
    const data = new DataTransfer();
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      ),
      (c) => c.charCodeAt(0),
    );
    data.items.add(new File([png], 'dot.png', { type: 'image/png' }));
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
        clientX: rect.right - 1,
        clientY: rect.top + rect.height / 2,
      }),
    );
  });
  await expect(figures).toHaveCount(before + 1);
  await expect(editor.locator('[data-tei-uploading]')).toHaveCount(1);
  await expect(editor.locator('[data-tei-uploading]')).toHaveCount(0);
  // The demo image: select, align, resize.
  const demo = editor.locator('figure img[src="/hills.svg"]');
  await demo.click();
  await page.getByRole('button', { name: 'Align left', exact: true }).click();
  await expect(demo.locator('xpath=..')).toHaveAttribute('data-align', 'start');
  const handle = page.locator('.tei-image-handle[data-corner="se"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('no handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 60, box.y, { steps: 5 });
  await page.mouse.up();
  await expect(demo).toHaveAttribute('width', /^3\d\d$/);
  await expectNoViolations(page);
});

test('files: a dropped file uploads, renames and downloads, reporting nothing', async ({ page }) => {
  const editor = await open(page, '/');
  const cards = editor.locator('[data-tei-file]');
  await expect(cards).toHaveCount(1);
  await editor.locator('p').first().evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(['a,b\n1,2\n'], 'numbers.csv', { type: 'text/csv' }));
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
        clientX: rect.right - 1,
        clientY: rect.top + rect.height / 2,
      }),
    );
  });
  await expect(cards).toHaveCount(2);
  await expect(editor.locator('[data-tei-file][data-tei-uploading]')).toHaveCount(1);
  await expect(editor.locator('[data-tei-file][data-tei-uploading]')).toHaveCount(0);
  await expect(cards.first()).toHaveAttribute('data-ext', 'CSV');
  // The demo file: rename it, then download it.
  const demo = cards.last();
  await demo.click();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  const input = page.locator('[data-tei-control="file-rename-input"]');
  await input.fill('Notes.pdf');
  await input.press('Enter');
  await expect(demo.locator('.tei-file-name')).toHaveText('Notes.pdf');
  await demo.click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Notes.pdf');
  await expectNoViolations(page);
});

test('embeds: the demo video loads, a pasted link embeds, reporting nothing', async ({ page }) => {
  const editor = await open(page, '/');
  const embeds = editor.locator('.tei-embed');
  await expect(embeds).toHaveCount(1);
  const video = embeds.first().locator('iframe');
  await expect(video).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ');
  // Lazy: the frame loads as it comes into view.
  await video.scrollIntoViewIfNeeded();
  await expect(video.contentFrame().locator('p')).toHaveText('Embedded');
  // Select it, and align it to the start.
  await embeds.first().locator('.tei-embed-frame').click();
  await page.getByRole('button', { name: 'Align left', exact: true }).click();
  await expect(embeds.first()).toHaveAttribute('data-align', 'start');
  // Paste a link to a post on a line of its own, and take the offer.
  // Copied from another page: the editor has let go of focus.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    const source = document.createElement('div');
    source.innerHTML = '<a href="https://x.com/jack/status/20">https://x.com/jack/status/20</a>';
    document.body.append(source);
    getSelection()?.selectAllChildren(source);
  });
  await page.keyboard.press(`${MOD}+c`);
  // A new line after the title. Not with End: on macOS it scrolls the page instead.
  await editor.locator('h1').click();
  await editor.locator('h1').evaluate((h1) => {
    const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    while (walker.nextNode()) last = walker.currentNode;
    getSelection()?.collapse(last ?? h1, last?.textContent?.length ?? 0);
  });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.keyboard.press('Enter');
  await page.keyboard.press(`${MOD}+v`);
  await expect(page.locator('[data-tei-control="embed-suggestion"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(embeds).toHaveCount(2);
  await expect(editor.locator('.tei-embed[data-tei-embed="x"] iframe')).toHaveAttribute(
    'src',
    /^https:\/\/platform\.twitter\.com\/embed\/Tweet\.html\?id=20&/,
  );
  await expectNoViolations(page);
});

test('blocks: the handle drags a block and opens its menu, reporting nothing', async ({ page }) => {
  const editor = await open(page, '/');
  // The handle loads after the editor shows.
  await page.locator('[data-tei-ready]').waitFor();
  const title = editor.locator('h1');
  const box = await title.boundingBox();
  if (!box) throw new Error('not rendered');
  await page.mouse.move(box.x + 24, box.y + box.height / 2);
  const grip = page.locator('[data-tei-control="block-grip"]');
  await expect(grip).toBeVisible();
  const at = await grip.boundingBox();
  const next = await editor.locator(':scope > *').nth(1).boundingBox();
  if (!at || !next) throw new Error('not rendered');
  // The title below the block after it.
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, next.y + next.height * 0.75, { steps: 8 });
  await expect(page.locator('[data-tei-control="block-drop"]')).toBeVisible();
  await page.mouse.up();
  await expect(editor.locator(':scope > *').nth(1)).toHaveText('Welcome to teieditor');
  // Its menu: back to the top.
  await editor.locator('h1').hover();
  await grip.click();
  const menu = page.locator('[data-tei-control="block-menu"]');
  await menu.getByRole('menuitem', { name: 'Move up' }).click();
  await expect(editor.locator(':scope > *').first()).toHaveText('Welcome to teieditor');
  await expectNoViolations(page);
});

test('context menu: copy and paste through it, reporting nothing', async ({
  page,
  context,
  browserName,
}) => {
  const editor = await open(page, '/');
  await page.locator('[data-tei-ready]').waitFor();
  const title = editor.locator('h1');
  // Select the title's text and right-click inside the selection.
  await title.evaluate((h1) => getSelection()?.selectAllChildren(h1));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const box = await title.boundingBox();
  if (!box) throw new Error('not rendered');
  await page.mouse.click(box.x + 20, box.y + box.height / 2, { button: 'right' });
  const menu = page.locator('[data-tei-control="context-menu"]');
  await menu.locator('[data-id="copy"]').click();
  await expect(menu).toHaveCount(0);
  // Paste it at the start of the next block, through the menu where the browser allows it.
  const next = editor.locator(':scope > p').first();
  await next.click();
  await page.keyboard.press('Home');
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await next.click({ button: 'right' });
    await menu.locator('[data-id="pastePlain"]').click();
  } else {
    await page.keyboard.press(`${MOD}+v`);
  }
  await expect(next).toContainText('Welcome to teieditor');
  await expectNoViolations(page);
});
