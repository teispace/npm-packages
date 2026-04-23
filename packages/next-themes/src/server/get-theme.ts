import { readCookieFromString, serializeCookie } from '../adapters/cookie';
import type { CookieOptions } from '../core/types';
import { readColorSchemeHint } from './client-hint';

export interface GetThemeOptions {
  cookieName?: string;
  /**
   * A raw cookie header string (for custom servers / middleware). If omitted,
   * the Next.js `cookies()` API is used automatically.
   */
  cookieHeader?: string;
  /**
   * Request headers (for custom servers / middleware). When provided, the
   * `Sec-CH-Prefers-Color-Scheme` client hint is read as a fallback when the
   * theme cookie is not set.
   */
  headers?: Headers | Record<string, string>;
}

/**
 * Read the persisted theme for a Next.js request (App Router).
 *
 * @example Server component
 *   const theme = await getTheme();
 *
 * @example Middleware / custom server
 *   const theme = await getTheme({
 *     cookieHeader: request.headers.get('cookie') ?? '',
 *     headers: request.headers,
 *   });
 */
export async function getTheme(options: GetThemeOptions = {}): Promise<string | null> {
  const name = options.cookieName ?? 'theme';

  let cookieValue: string | null = null;
  if (options.cookieHeader !== undefined) {
    cookieValue = readCookieFromString(options.cookieHeader, name);
  } else {
    try {
      const mod = (await import('next/headers')) as {
        cookies: () => Promise<{ get: (n: string) => { value: string } | undefined }>;
      };
      const jar = await mod.cookies();
      cookieValue = jar.get(name)?.value ?? null;
    } catch (_e) {
      cookieValue = null;
    }
  }
  if (cookieValue) return cookieValue;

  let headers = options.headers;
  if (!headers) {
    try {
      const mod = (await import('next/headers')) as { headers: () => Promise<Headers> };
      headers = await mod.headers();
    } catch (_e) {
      headers = undefined;
    }
  }
  if (headers) {
    const hint = readColorSchemeHint(headers);
    if (hint) return hint;
  }

  return null;
}

export interface SetThemeCookieOptions extends CookieOptions {
  cookieName?: string;
}

/**
 * Serialize a `Set-Cookie` header value for the theme cookie. Does not touch
 * response objects — the caller is responsible for attaching the header. Use
 * this in route handlers, server actions, and edge middleware when running in
 * hybrid/cookie storage mode.
 */
export function setThemeCookie(theme: string, options: SetThemeCookieOptions = {}): string {
  const { cookieName = 'theme', ...cookie } = options;
  return serializeCookie(cookieName, theme, cookie);
}

/**
 * Write the theme cookie directly via the Next.js `cookies()` API. Only
 * callable in Server Actions and Route Handlers (not in Server Components).
 * No-op when `next/headers` is unavailable.
 */
export async function writeThemeCookie(
  theme: string,
  options: SetThemeCookieOptions = {},
): Promise<void> {
  const { cookieName = 'theme', maxAge, path, domain, sameSite, secure } = options;
  try {
    const mod = (await import('next/headers')) as {
      cookies: () => Promise<{
        set: (opts: {
          name: string;
          value: string;
          maxAge?: number;
          path?: string;
          domain?: string;
          sameSite?: 'lax' | 'strict' | 'none';
          secure?: boolean;
        }) => void;
      }>;
    };
    const jar = await mod.cookies();
    jar.set({
      name: cookieName,
      value: theme,
      maxAge: maxAge ?? 60 * 60 * 24 * 365,
      path: path ?? '/',
      domain,
      sameSite: sameSite ?? 'lax',
      secure,
    });
  } catch (_e) {
    /* not in a Next server context */
  }
}
