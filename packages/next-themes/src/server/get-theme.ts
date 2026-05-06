import { readCookieFromString, serializeCookie } from '../adapters/cookie';
import { type BuildScriptOptions, buildScript } from '../core/script';
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
  /**
   * Whitelist of acceptable theme names. When provided, a cookie value or
   * client hint that doesn't match (e.g. a stale value from a previous theme
   * configuration, or a hand-crafted cookie) is treated as missing.
   *
   * Without this, server components branching on `getTheme()` could render
   * with an attribute the runtime would later normalize away — a real
   * hydration mismatch source.
   */
  themes?: string[];
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
  const allow = options.themes;
  // 'system' is always an acceptable cookie value; the provider resolves it.
  const accept = (v: string | null): string | null => {
    if (!v) return null;
    if (!allow) return v;
    if (v === 'system') return v;
    return allow.includes(v) ? v : null;
  };

  // Single dynamic import — `next/headers` is the same module for both
  // `cookies()` and `headers()`. Doing it twice is wasted module-resolution work.
  type NextHeaders = {
    cookies?: () => Promise<{ get: (n: string) => { value: string } | undefined }>;
    headers?: () => Promise<Headers>;
  };
  let nextHeaders: NextHeaders | null = null;
  const loadNext = async (): Promise<NextHeaders | null> => {
    if (nextHeaders !== null) return nextHeaders;
    try {
      nextHeaders = (await import('next/headers')) as NextHeaders;
    } catch (_e) {
      nextHeaders = {};
    }
    return nextHeaders;
  };

  let cookieValue: string | null = null;
  if (options.cookieHeader !== undefined) {
    cookieValue = readCookieFromString(options.cookieHeader, name);
  } else {
    const mod = await loadNext();
    if (mod?.cookies) {
      try {
        const jar = await mod.cookies();
        cookieValue = jar.get(name)?.value ?? null;
      } catch (_e) {
        cookieValue = null;
      }
    }
  }
  const validatedCookie = accept(cookieValue);
  if (validatedCookie) return validatedCookie;

  let headers = options.headers;
  if (!headers) {
    const mod = await loadNext();
    if (mod?.headers) {
      try {
        headers = await mod.headers();
      } catch (_e) {
        headers = undefined;
      }
    }
  }
  if (headers) {
    const hint = readColorSchemeHint(headers);
    // Hint is already constrained to 'light' | 'dark'; only filter if those
    // aren't in the user's `themes` list (rare custom-themes setup).
    if (hint && (!allow || allow.includes(hint))) return hint;
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

/**
 * Build the inline anti-FOUC script as an HTML-safe string. Place this
 * inside the `<head>` of your root layout — that is where it can run
 * synchronously before the browser paints any body pixels, eliminating
 * the dark → light → dark flicker that `useServerInsertedHTML` placement
 * inside `<body>` allows.
 *
 * Recommended usage in Next.js App Router:
 *
 * ```tsx
 * // app/layout.tsx
 * import { getTheme, getThemeScript } from '@teispace/next-themes/server';
 *
 * export default async function RootLayout({ children }) {
 *   const initialTheme = await getTheme();
 *   const script = getThemeScript({ attribute: 'class', initialTheme });
 *   return (
 *     <html lang="en" suppressHydrationWarning>
 *       <head>
 *         <script dangerouslySetInnerHTML={{ __html: script }} />
 *       </head>
 *       <body>
 *         <Providers initialTheme={initialTheme}>{children}</Providers>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 *
 * When this helper is used, the `ThemeProvider` skips its own script
 * injection (passing `nonce` is enough — see the `noScript` provider
 * prop). Pass the same configuration object to both call sites to keep
 * them in sync, or use `createThemes()` so the config lives in one place.
 */
export function getThemeScript(options: BuildScriptOptions = {}): string {
  return buildScript(options);
}
