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
 * Two call shapes:
 *
 * 1. `getTheme()` / `getTheme(options)` — async. Reads from Next.js's
 *    `cookies()` / `headers()` (or from `options.cookieHeader` if provided).
 *    Use in Server Components and Route Handlers.
 *
 * 2. `getTheme(request)` / `getTheme(request, options)` — sync. Reads
 *    directly from the `Request` object's cookie + headers without touching
 *    `next/headers`. Use in middleware, edge functions, and any place where
 *    you have a `Request` but no Next.js async context.
 *
 * @example Server component (async)
 *   const theme = await getTheme();
 *
 * @example Middleware (sync, from Request)
 *   export function middleware(request: NextRequest) {
 *     const theme = getTheme(request, { defaultTheme: 'dark' });
 *     // rewrite, set a header, redirect based on theme, etc.
 *   }
 *
 * @example Custom server / explicit options (async)
 *   const theme = await getTheme({
 *     cookieHeader: request.headers.get('cookie') ?? '',
 *     headers: request.headers,
 *   });
 */
export function getTheme(request: Request, options?: GetThemeOptions): string | null;
export function getTheme(options?: GetThemeOptions): Promise<string | null>;
export function getTheme(
  requestOrOptions?: Request | GetThemeOptions,
  maybeOptions?: GetThemeOptions,
): string | null | Promise<string | null> {
  // Distinguish `Request` from `GetThemeOptions` structurally. `instanceof
  // Request` would fail for polyfilled/framework-subclass Request types,
  // and a Headers-instance check alone would false-positive for options
  // objects that happen to pass `headers: new Headers(...)`. Require both
  // a `Headers` instance AND a string `url` — together unique to Request.
  const isRequest =
    !!requestOrOptions &&
    typeof requestOrOptions === 'object' &&
    'headers' in requestOrOptions &&
    requestOrOptions.headers instanceof Headers &&
    'url' in requestOrOptions &&
    typeof (requestOrOptions as { url: unknown }).url === 'string';

  if (isRequest) {
    const req = requestOrOptions as Request;
    const options = maybeOptions ?? {};
    const name = options.cookieName ?? 'theme';
    const cookieHeader = req.headers.get('cookie') ?? '';
    const cookieValue = readCookieFromString(cookieHeader, name);
    const validated = acceptTheme(cookieValue, options.themes);
    if (validated) return validated;
    const hint = readColorSchemeHint(req.headers);
    if (hint && (!options.themes || options.themes.includes(hint))) return hint;
    return null;
  }

  return resolveTheme((requestOrOptions as GetThemeOptions | undefined) ?? {});
}

function acceptTheme(value: string | null, allow: string[] | undefined): string | null {
  if (!value) return null;
  if (!allow) return value;
  // 'system' is always an acceptable cookie value; the provider resolves it.
  if (value === 'system') return value;
  return allow.includes(value) ? value : null;
}

async function resolveTheme(options: GetThemeOptions): Promise<string | null> {
  const name = options.cookieName ?? 'theme';
  const allow = options.themes;

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
  const validatedCookie = acceptTheme(cookieValue, allow);
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
