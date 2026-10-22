import { test as base, expect, type Locator, type Page } from '@playwright/test';

export interface Harness {
  page: Page;
  content: Locator;
  /** Open the harness, optionally with initial HTML and flags (`raw`, `tall`). */
  open(options?: { content?: string; flags?: string[] }): Promise<void>;
  html(): Promise<string>;
  text(): Promise<string>;
  /** Put the caret at the end of the document. */
  caretAtEnd(): Promise<void>;
  /** Select the document's text, as a user would with ⌘A. */
  selectAll(): Promise<void>;
  log(): Promise<string[]>;
  /** Console errors and CSP reports so far. */
  problems(): Promise<string[]>;
  /** Forget console errors and CSP reports so far (ones the test caused on purpose). */
  forgetProblems(): Promise<void>;
}

/**
 * Wait for every running animation and transition to finish. Scroll-driven
 * ones follow the scroll position and never finish, so they are left out.
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.timeline instanceof DocumentTimeline)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/**
 * The embed providers' frames, stood in for: nothing leaves the machine,
 * and each looks the same every run. X's posts its height, as the real one
 * does.
 */
export async function stubEmbedFrames(page: Page, height = 480): Promise<void> {
  const hosts = [
    'www.youtube-nocookie.com',
    'player.vimeo.com',
    'platform.twitter.com',
    'www.figma.com',
    'www.loom.com',
  ];
  for (const host of hosts) {
    const resize =
      host === 'platform.twitter.com'
        ? `<script>parent.postMessage(JSON.stringify({"twttr.embed":{"method":"twttr.private.resize","params":[{"height":${height}}]}}),"*")</script>`
        : '';
    await page.route(`https://${host}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><style>html{background:#5b6b7f;color:#fff;font:600 16px/1 sans-serif}p{margin:16px}</style><p>${host}</p>${resize}`,
      }),
    );
  }
}

/**
 * Every test fails on a page error, a console error or a CSP violation:
 * the editor must work under the strict policy with nothing logged.
 */
export const test = base.extend<{ tei: Harness }>({
  tei: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`);
    });
    const content = page.getByTestId('content');
    // The editor takes the caret on the selectionchange that follows a key.
    const frames = () =>
      page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    const harness: Harness = {
      page,
      content,
      async open({ content: html, flags = [] } = {}) {
        const params = new URLSearchParams(flags.map((flag) => [flag, '']));
        if (html !== undefined) params.set('content', html);
        await page.goto(`/?${params}`);
        await expect(content).toBeVisible();
        // <Editor>'s table, image and code block parts load after it shows.
        await page.waitForFunction(() => {
          const frame = document.querySelector('[data-tei-frame]');
          return !frame || frame.hasAttribute('data-tei-ready');
        });
      },
      html: () => page.evaluate(() => window.__tei.editor.getHTML()),
      text: () => page.evaluate(() => window.__tei.editor.getText()),
      async caretAtEnd() {
        await content.click();
        await page.keyboard.press('ControlOrMeta+End');
        // WebKit on macOS has no ⌘End; move by document instead.
        await page.evaluate(() => {
          const root = document.querySelector('[data-tei-content]');
          const selection = getSelection();
          if (root && selection) selection.selectAllChildren(root);
          selection?.collapseToEnd();
        });
        await frames();
      },
      async selectAll() {
        await content.click();
        await page.keyboard.press('ControlOrMeta+a');
        // A selectionchange still to come makes the editor take focus back
        // (Lexical's way) if a test moves focus first.
        await frames();
      },
      log: () => page.evaluate(() => [...window.__tei.log]),
      async problems() {
        const violations = await page.evaluate(() => [...window.__tei.violations]);
        return [...problems, ...violations.map((v) => `csp: ${v}`)];
      },
      async forgetProblems() {
        problems.length = 0;
        await page.evaluate(() => {
          window.__tei.violations.length = 0;
        });
      },
    };
    await use(harness);
    const violations = await page
      .evaluate(() => window.__tei?.violations ?? [])
      .catch(() => [] as string[]);
    expect([...problems, ...violations.map((v) => `csp: ${v}`)]).toEqual([]);
  },
});

export { expect };
