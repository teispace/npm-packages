import { expect, type Page, test } from '@playwright/test';

/**
 * The example app serves every page under a strict nonce CSP (src/proxy.ts):
 * `style-src 'self' 'nonce-…'`, no `'unsafe-inline'`. Any stylesheet the
 * package injected without going through its CSP-safe path would be blocked
 * and reported. Each test records violations two ways — the in-page
 * `securitypolicyviolation` event and the `report-uri` endpoint — and asserts
 * there are none while the theme demonstrably changed.
 */

declare global {
  interface Window {
    __violations: string[];
  }
}

async function recordViolations(page: Page): Promise<void> {
  // Init scripts are injected by the browser driver, outside the page's CSP.
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
    });
  });
}

/** Remove constructable-stylesheet support, forcing the `<style nonce>` path. */
async function withoutConstructableSheets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (Document.prototype as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
  });
}

/**
 * A per-test marker in the page URL. The report endpoint is shared by tests
 * running in parallel across three browsers, so each test only counts the
 * reports whose document-uri carries its own marker.
 */
function runId(): string {
  const info = test.info();
  return `${info.project.name}-${info.testId}`;
}

function cspUrl(): string {
  return `/csp?run=${runId()}`;
}

async function expectNoViolations(page: Page): Promise<void> {
  // report-uri delivery is asynchronous; give it a moment to land.
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  const reports = (await (await page.request.get('/api/csp-report')).json()) as Array<{
    'csp-report'?: { 'document-uri'?: string };
  }>;
  const mine = reports.filter((r) => r['csp-report']?.['document-uri']?.includes(runId()));
  expect(mine).toEqual([]);
}

const htmlHasClass = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.classList.contains(n), name);

test.beforeEach(async ({ page }) => {
  await recordViolations(page);
});

test('the page really is under the strict policy', async ({ page }) => {
  const response = await page.goto(cspUrl());
  const policy = response?.headers()['content-security-policy'] ?? '';
  expect(policy).toMatch(/style-src 'self' 'nonce-[^']+'/);
  expect(policy).not.toMatch(/style-src [^;]*'unsafe-inline'/);
  // Sanity: an un-nonced <style> IS reported, so a clean run means something.
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = 'body{outline:0}';
    document.head.appendChild(s);
  });
  await expect
    .poll(() => page.evaluate(() => window.__violations.length))
    .toBeGreaterThan(0);
});

test('the inline script runs under the nonce and paints the stored theme', async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: 'theme', value: 'dark', url: 'http://127.0.0.1:3107' }]);
  await page.goto(cspUrl());
  expect(await htmlHasClass(page, 'dark')).toBe(true);
  await expectNoViolations(page);
});

for (const variant of ['constructable sheets', '<style nonce> fallback'] as const) {
  test.describe(variant, () => {
    test.beforeEach(async ({ page }) => {
      if (variant === '<style nonce> fallback') await withoutConstructableSheets(page);
      await page.goto(cspUrl());
      await expect(page.getByTestId('resolved')).not.toBeEmpty();
    });

    test('switching with disableTransitionOnChange', async ({ page }) => {
      await page.getByTestId('light').click();
      await expect(page.getByTestId('resolved')).toHaveText('light');
      await page.getByTestId('dark').click();
      await expect(page.getByTestId('resolved')).toHaveText('dark');
      expect(await htmlHasClass(page, 'dark')).toBe(true);
      await expectNoViolations(page);
    });

    test('switching with View Transitions', async ({ page }) => {
      await page.getByTestId('light').click();
      await page.getByTestId('dark-fade').click();
      await expect(page.getByTestId('resolved')).toHaveText('dark');
      await page.getByTestId('light-circular').click();
      await expect(page.getByTestId('resolved')).toHaveText('light');
      await expectNoViolations(page);
    });

    test('back/forward-cache restore runs the inline script again', async ({ page }) => {
      await page.getByTestId('dark').click();
      await expect(page.getByTestId('resolved')).toHaveText('dark');
      // Another tab chose light while this page sat in the bfcache. Dispatching
      // a persisted pageshow runs the inline script's listener — the path that
      // injects the transition-disabling style before React reconciles.
      await page.evaluate(() => {
        document.cookie = 'theme=light; Path=/';
        localStorage.setItem('theme', 'light');
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await expect.poll(() => htmlHasClass(page, 'light')).toBe(true);
      await expectNoViolations(page);
    });
  });
}
