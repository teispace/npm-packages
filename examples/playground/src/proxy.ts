import { type NextRequest, NextResponse } from 'next/server';

/**
 * A strict, nonce-based Content Security Policy for every page — the one the
 * "Security and Content Security Policy" section of the teieditor README
 * recommends, and what the e2e suite checks the editor against.
 *
 * - Scripts: only those carrying this request's nonce. Next.js stamps its own.
 * - Styles: stylesheets from the app and nonced `<style>` elements only. No
 *   `'unsafe-inline'`, and no exception for style *attributes* either, so an
 *   editor that injected a `<style>` or wrote `style="…"` would be reported.
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
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    // The embed providers' frames (Embed's defaults), and nothing else.
    'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://platform.twitter.com https://www.figma.com https://www.loom.com',
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'report-uri /api/csp-report',
  ].join('; ');

  // Next.js reads the policy from the *request* headers to find the nonce for
  // its own scripts.
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
