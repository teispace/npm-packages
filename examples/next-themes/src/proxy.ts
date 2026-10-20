import { type NextRequest, NextResponse } from 'next/server';

/**
 * A strict, nonce-based Content Security Policy for every page — the setup
 * the "Content Security Policy" section of the package README recommends.
 *
 * - `script-src 'nonce-…' 'strict-dynamic'`: only scripts carrying this
 *   request's nonce run. Next.js stamps its own scripts with it, and the
 *   ThemeProvider receives it through the `nonce` prop (see app/layout.tsx).
 * - `style-src 'self' 'nonce-…'`: no `'unsafe-inline'`. Any `<style>` element
 *   created without the nonce is blocked, which is exactly what the e2e suite
 *   checks the package never does.
 * - `style-src-attr 'unsafe-inline'`: style *attributes* stay allowed, as in
 *   most real apps (Next.js's route announcer uses one).
 *
 * Development relaxes scripts and styles, because the dev server evaluates
 * code and injects styles without nonces. The e2e suite runs the production
 * build, where the policy is enforced as written.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== 'production';

  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'report-uri /api/csp-report',
  ].join('; ');

  // Next.js reads the policy from the *request* headers to find the nonce for
  // its own scripts; the layout reads `x-nonce` to hand it to the provider.
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      // Prefetches render no HTML of their own, so they need no policy.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
