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
  await still.close();

  const editor = await open(page, '/');
  // The editor's own DOM now, with the text styles the server held back.
  await expect(editor.locator('.tei-h1')).toHaveText('Welcome to teieditor');
  await expect(editor).not.toHaveClass(/tei-prose/);
  await expect(editor.getByText('colour', { exact: true })).toHaveCSS('color', 'rgb(220, 38, 38)');
  const mounted = await layout(editor);
  expect(mounted).toHaveLength(served.length);
  // Every block is as tall as the server drew it, but one whose font size
  // waited for the editor (a strict CSP blocks style attributes).
  expect(served.filter((block) => block.sized)).toHaveLength(1);
  for (const [i, block] of served.entries()) {
    if (!block.sized) expect(Math.abs((mounted[i]?.height ?? 0) - block.height)).toBeLessThanOrEqual(1);
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
