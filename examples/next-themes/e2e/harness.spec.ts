import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { getThemeScriptHash, getThemeScriptProps } from '@teispace/next-themes/server';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { App, NONCE } from './harness/app';

/**
 * Two policies the Next.js app cannot isolate, because Next's own inline
 * scripts carry the nonce and would muddy the result:
 *
 * 1. Hash-only: `script-src 'sha256-…'` and no nonce anywhere. The provider's
 *    script text is constant, so the single published hash must allow it.
 * 2. Trusted Types: `require-trusted-types-for 'script'` with no policy
 *    allowed. Server-rendered HTML is not a Trusted Types sink and hydration
 *    assigns no innerHTML, so the provider must run without any policy.
 */

let server: Server;
let origin = '';
let bundle = '';

const pages: Record<string, { csp: string; html: () => string }> = {
  '/hash': {
    csp: `default-src 'none'; img-src 'self'; script-src ${getThemeScriptHash()}; style-src 'self'`,
    html: () =>
      `<!doctype html><html><head>${renderToStaticMarkup(
        createElement('script', getThemeScriptProps({ attribute: 'class', disableTransitionOnChange: true })),
      )}</head><body><p>hash</p></body></html>`,
  },
  '/hash-tampered': {
    csp: `default-src 'none'; img-src 'self'; script-src ${getThemeScriptHash()}; style-src 'self'`,
    html: () => {
      const props = getThemeScriptProps({ attribute: 'class' });
      props.dangerouslySetInnerHTML.__html += ' ';
      return `<!doctype html><html><head>${renderToStaticMarkup(createElement('script', props))}</head><body></body></html>`;
    },
  },
  '/tt': {
    csp: [
      "default-src 'self'",
      `script-src 'nonce-${NONCE}' 'strict-dynamic'`,
      `style-src 'self' 'nonce-${NONCE}'`,
      "require-trusted-types-for 'script'",
      "trusted-types 'none'",
    ].join('; '),
    html: () =>
      `<!doctype html><html><head></head><body><div id="root">${renderToString(
        createElement(App, { nonce: NONCE }),
      )}</div><script nonce="${NONCE}" type="module" src="/app.js"></script></body></html>`,
  },
};

test.beforeAll(async () => {
  const result = await build({
    // Playwright compiles specs as CommonJS here, so __dirname is available.
    entryPoints: [join(__dirname, 'harness', 'hydrate.ts')],
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
  });
  bundle = result.outputFiles[0]?.text ?? '';

  server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    if (path === '/app.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(bundle);
      return;
    }
    const page = pages[path];
    if (!page) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': page.csp });
    res.end(page.html());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

declare global {
  interface Window {
    __violations: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__violations.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
    });
  });
});

const violations = async (page: Page) => {
  await page.waitForTimeout(200);
  return page.evaluate(() => window.__violations);
};
const htmlHasClass = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.classList.contains(n), name);

test.describe('hash-only CSP', () => {
  test('the published hash allows the script, which paints and re-paints', async ({ page, context }) => {
    await context.addCookies([{ name: 'theme', value: 'dark', url: origin }]);
    await page.goto(`${origin}/hash`);
    expect(await htmlHasClass(page, 'dark')).toBe(true);

    // bfcache restore with a changed theme: the script injects its
    // transition-disabling stylesheet with no nonce available at all.
    await page.evaluate(() => {
      document.cookie = 'theme=light; Path=/';
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(await htmlHasClass(page, 'light')).toBe(true);
    expect(await violations(page)).toEqual([]);
  });

  test('control: a script whose text differs from the hash is blocked', async ({ page, context }) => {
    await context.addCookies([{ name: 'theme', value: 'dark', url: origin }]);
    await page.goto(`${origin}/hash-tampered`);
    expect(await htmlHasClass(page, 'dark')).toBe(false);
    expect((await violations(page)).length).toBeGreaterThan(0);
  });
});

test.describe('Trusted Types', () => {
  test('the client provider hydrates and switches with no policy', async ({ page }) => {
    await page.goto(`${origin}/tt`);
    test.skip(
      !(await page.evaluate(() => 'trustedTypes' in window)),
      'this engine does not enforce Trusted Types',
    );
    const toggle = page.getByTestId('toggle');
    await expect(toggle).toHaveText('light');
    await toggle.click();
    await expect(toggle).toHaveText('dark');
    expect(await htmlHasClass(page, 'dark')).toBe(true);
    expect(await violations(page)).toEqual([]);
  });
});
