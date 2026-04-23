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
