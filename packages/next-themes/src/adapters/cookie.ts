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

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const maxAge = options.maxAge ?? 60 * 60 * 24 * 365; // 1 year
  const path = options.path ?? '/';
  const sameSite = options.sameSite ?? 'lax';
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
