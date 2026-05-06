import { describe, expect, it } from 'vitest';
import {
  cookieAdapter,
  hybridAdapter,
  localAdapter,
  readCookieFromString,
  resolveAdapter,
  serializeCookie,
  sessionAdapter,
} from '../src/adapters/index';

const baseOpts = {
  key: 'theme',
  cookie: { name: 'theme' },
};

describe('readCookieFromString', () => {
  it('returns null for empty cookie', () => {
    expect(readCookieFromString('', 'theme')).toBeNull();
  });

  it('reads a value by name', () => {
    expect(readCookieFromString('foo=bar; theme=dark', 'theme')).toBe('dark');
  });

  it('decodes URI components', () => {
    expect(readCookieFromString('theme=dark%20theme', 'theme')).toBe('dark theme');
  });

  it('returns null for missing name', () => {
    expect(readCookieFromString('foo=bar', 'theme')).toBeNull();
  });

  it('handles values containing =', () => {
    // The first `=` is the separator; subsequent ones are part of the value.
    expect(readCookieFromString('theme=a=b=c', 'theme')).toBe('a=b=c');
  });
});

describe('serializeCookie', () => {
  it('builds a basic cookie with defaults', () => {
    const s = serializeCookie('theme', 'dark');
    expect(s).toContain('theme=dark');
    expect(s).toContain('Path=/');
    expect(s).toMatch(/SameSite=Lax/);
    expect(s).toMatch(/Max-Age=\d+/);
  });

  it('includes Domain and Secure when provided', () => {
    const s = serializeCookie('theme', 'dark', { domain: 'example.com', secure: true });
    expect(s).toContain('Domain=example.com');
    expect(s).toContain('Secure');
  });

  it('URI-encodes the value', () => {
    const s = serializeCookie('theme', 'dark theme');
    expect(s).toContain('theme=dark%20theme');
  });

  it('rejects invalid cookie names (RFC 6265 token rules)', () => {
    // Whitespace is forbidden.
    expect(() => serializeCookie('with space', 'dark')).toThrow(/invalid cookie name/i);
    // Separators are forbidden.
    expect(() => serializeCookie('with;semi', 'dark')).toThrow(/invalid cookie name/i);
    expect(() => serializeCookie('with=eq', 'dark')).toThrow(/invalid cookie name/i);
    // Control chars are forbidden.
    expect(() => serializeCookie('with\nnewline', 'dark')).toThrow(/invalid cookie name/i);
    // Empty is forbidden.
    expect(() => serializeCookie('', 'dark')).toThrow(/non-empty/);
  });

  it('rejects cookie attribute values containing CR/LF or ;', () => {
    expect(() => serializeCookie('theme', 'dark', { path: '/foo\nBad: header' })).toThrow(
      /invalid cookie path/i,
    );
    expect(() => serializeCookie('theme', 'dark', { domain: 'evil.com;Path=/' })).toThrow(
      /invalid cookie domain/i,
    );
  });

  it('accepts valid token characters (RFC 6265 §4.1.1)', () => {
    // !#$%&'*+-.^_`|~ and alphanumerics are all valid token chars.
    expect(() => serializeCookie("my!#$%&'*+-.^_`|~theme0", 'dark')).not.toThrow();
  });
});

describe('localAdapter', () => {
  it('round-trips values through localStorage', () => {
    const a = localAdapter(baseOpts);
    a.set('dark');
    expect(a.get()).toBe('dark');
  });

  it('notifies subscribers on storage events', () => {
    const a = localAdapter(baseOpts);
    const seen: Array<string | null> = [];
    const unsub = a.subscribe!((v) => {
      seen.push(v);
    });
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'theme', newValue: 'light', oldValue: 'dark' }),
    );
    unsub();
    expect(seen).toEqual(['light']);
  });
});

describe('sessionAdapter', () => {
  it('round-trips values through sessionStorage', () => {
    const a = sessionAdapter(baseOpts);
    a.set('dark');
    expect(a.get()).toBe('dark');
  });
});

describe('cookieAdapter', () => {
  it('writes and reads a cookie', () => {
    const a = cookieAdapter(baseOpts);
    a.set('dark');
    expect(a.get()).toBe('dark');
  });
});

describe('hybridAdapter', () => {
  it('writes to both channels', () => {
    const a = hybridAdapter(baseOpts);
    a.set('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(document.cookie).toContain('theme=dark');
  });

  it('prefers cookie over localStorage on read', () => {
    window.localStorage.setItem('theme', 'light');
    document.cookie = 'theme=dark; Path=/';
    const a = hybridAdapter(baseOpts);
    expect(a.get()).toBe('dark');
  });

  it('falls back to localStorage when cookie is missing', () => {
    window.localStorage.setItem('theme', 'dark');
    const a = hybridAdapter(baseOpts);
    expect(a.get()).toBe('dark');
  });

  it('heals divergence by writing localStorage value back to the cookie', () => {
    // Cookie absent (e.g. expired or blocked), localStorage remembers.
    document.cookie = 'theme=; Max-Age=0; Path=/';
    window.localStorage.setItem('theme', 'dark');
    const a = hybridAdapter(baseOpts);
    expect(a.get()).toBe('dark');
    // Cookie should now be re-seeded so the server picks it up next request.
    expect(document.cookie).toContain('theme=dark');
  });

  it('does not heal when neither channel has a value', () => {
    document.cookie = 'theme=; Max-Age=0; Path=/';
    window.localStorage.removeItem('theme');
    const a = hybridAdapter(baseOpts);
    expect(a.get()).toBeNull();
    expect(document.cookie).not.toContain('theme=');
  });
});

describe('resolveAdapter', () => {
  it("returns a no-op adapter for 'none'", () => {
    const a = resolveAdapter({ mode: 'none', key: 'theme' });
    a.set('dark');
    expect(a.get()).toBeNull();
  });

  it('returns the matching adapter for each mode', () => {
    expect(resolveAdapter({ mode: 'local', key: 'theme' })).toBeDefined();
    expect(resolveAdapter({ mode: 'session', key: 'theme' })).toBeDefined();
    expect(resolveAdapter({ mode: 'cookie', key: 'theme' })).toBeDefined();
    expect(resolveAdapter({ mode: 'hybrid', key: 'theme' })).toBeDefined();
  });
});
