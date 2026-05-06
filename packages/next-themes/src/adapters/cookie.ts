import { hasDocumentCookie } from '../core/env';
import type { CookieOptions } from '../core/types';
import type { AdapterFactory, StorageAdapter } from './types';

export function readCookieFromString(cookie: string, name: string): string | null {
  if (!cookie) return null;
  const parts = cookie.split('; ');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.substring(0, eq) === name) {
      const raw = part.substring(eq + 1);
      if (!raw) return null;
      try {
        return decodeURIComponent(raw);
      } catch (_e) {
        return raw;
      }
    }
  }
  return null;
}

/**
 * RFC 6265 §4.1.1: cookie-name is a `token` which excludes control chars,
 * whitespace, and the separators `()<>@,;:\"/[]?={}`. We also reject `=`
 * since the parser splits on it. Rejecting bad names early surfaces a clear
 * error in dev rather than silently producing a malformed `Set-Cookie` that
 * the browser drops with no indication.
 *
 * Same constraints apply to `path` and `domain` — they cannot contain CR/LF
 * (header injection) or `;` (would terminate the header field early).
 *
 * Validation is done numerically (not via regex) so the source contains no
 * control characters and biome's `noControlCharactersInRegex` lint stays
 * enabled.
 */
const COOKIE_SEPARATORS = '()<>@,;:\\"/[]?={}';

function isControlOrSpace(code: number): boolean {
  return code <= 0x20 || code === 0x7f;
}

function isControl(code: number): boolean {
  return code <= 0x1f || code === 0x7f;
}

function assertCookieName(name: string): void {
  if (!name) {
    throw new Error('[@teispace/next-themes] cookie name must be non-empty.');
  }
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (isControlOrSpace(code) || COOKIE_SEPARATORS.includes(name[i] as string)) {
      throw new Error(
        `[@teispace/next-themes] invalid cookie name '${name}'. Allowed: RFC 6265 token characters (no control chars, whitespace, or () <> @ , ; : \\ " / [ ] ? = { }).`,
      );
    }
  }
}

function assertHeaderValue(label: string, value: string): void {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (isControl(code) || code === 0x3b /* ; */) {
      throw new Error(
        `[@teispace/next-themes] invalid cookie ${label} '${value}'. Cookie attributes cannot contain control characters or ';'.`,
      );
    }
  }
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  assertCookieName(name);
  const maxAge = options.maxAge ?? 60 * 60 * 24 * 365; // 1 year
  const path = options.path ?? '/';
  const sameSite = options.sameSite ?? 'lax';
  assertHeaderValue('path', path);
  if (options.domain) assertHeaderValue('domain', options.domain);
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    `Path=${path}`,
    `SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`,
  ];
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export const cookieAdapter: AdapterFactory = ({ cookie }): StorageAdapter => {
  const { name, ...rest } = cookie;
  // Validate eagerly so a misconfigured cookie name throws at provider mount
  // (with a clear stack), not silently on every theme write.
  assertCookieName(name);
  return {
    get() {
      if (!hasDocumentCookie()) return null;
      try {
        return readCookieFromString(document.cookie, name);
      } catch (_e) {
        return null;
      }
    },
    set(value) {
      if (!hasDocumentCookie()) return;
      try {
        document.cookie = serializeCookie(name, value, rest);
      } catch (_e) {
        /* sandboxed iframe, etc. */
      }
    },
  };
};
