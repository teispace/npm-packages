import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Every playground page is served under a strict nonce CSP (src/proxy.ts).
 * These record violations two ways, the in-page `securitypolicyviolation`
 * event and the `report-uri` endpoint, so a spec can assert there are none.
 */

declare global {
  interface Window {
    __violations: string[];
  }
}

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * A per-test marker in the page URL. The report endpoint is shared by tests
 * running in parallel across three browsers, so each test only counts the
 * reports whose document-uri carries its own marker.
 */
export function runId(): string {
  const info = test.info();
  return `${info.project.name}-${info.testId}`;
}

export async function open(page: Page, path: string): Promise<Locator> {
  await page.goto(`${path}?run=${runId()}`);
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  return editor;
}

/**
 * Select a word of the quote. A double-click on the text itself: past the end
 * of a line, macOS selects the nearest word but Linux and Windows select
 * nothing.
 */
export async function selectAWord(editor: Locator): Promise<void> {
  await editor.locator('blockquote [data-lexical-text]').first().dblclick();
}

export async function expectNoViolations(page: Page): Promise<void> {
  // report-uri delivery is asynchronous; give it a moment to land.
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  const reports = (await (await page.request.get('/api/csp-report')).json()) as Array<{
    'csp-report'?: { 'document-uri'?: string };
  }>;
  expect(reports.filter((r) => r['csp-report']?.['document-uri']?.includes(runId()))).toEqual([]);
}

/** Call in each spec file: stubs the embed providers and records violations. */
export function recordViolations(): void {
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
}
