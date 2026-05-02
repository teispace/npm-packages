import { describe, expect, it } from 'vitest';
import { acceptClientHintsHeader, readColorSchemeHint } from '../src/server/client-hint';
import { getTheme, getThemeScript, setThemeCookie } from '../src/server/get-theme';

describe('readColorSchemeHint', () => {
  it('reads light from a Headers object', () => {
    const h = new Headers({ 'sec-ch-prefers-color-scheme': 'light' });
    expect(readColorSchemeHint(h)).toBe('light');
  });

  it('reads dark from a Headers object', () => {
    const h = new Headers({ 'sec-ch-prefers-color-scheme': 'dark' });
    expect(readColorSchemeHint(h)).toBe('dark');
  });

  it('reads from a plain record', () => {
    expect(readColorSchemeHint({ 'sec-ch-prefers-color-scheme': 'dark' })).toBe('dark');
  });

  it('returns null for invalid values', () => {
    const h = new Headers({ 'sec-ch-prefers-color-scheme': 'purple' });
    expect(readColorSchemeHint(h)).toBeNull();
  });

  it('returns null when header is missing', () => {
    expect(readColorSchemeHint(new Headers())).toBeNull();
  });

  it('is case-insensitive on the value', () => {
    expect(readColorSchemeHint({ 'sec-ch-prefers-color-scheme': 'DARK' })).toBe('dark');
  });

  it('is case-insensitive on Record<string,string> keys', () => {
    // Real middleware may hand us raw headers with the canonical casing.
    expect(readColorSchemeHint({ 'Sec-CH-Prefers-Color-Scheme': 'dark' })).toBe('dark');
    expect(readColorSchemeHint({ 'SEC-CH-PREFERS-COLOR-SCHEME': 'light' })).toBe('light');
    expect(readColorSchemeHint({ 'sec-CH-prefers-COLOR-scheme': 'dark' })).toBe('dark');
  });
});

describe('acceptClientHintsHeader', () => {
  it('returns the hint name for Accept-CH', () => {
    expect(acceptClientHintsHeader()).toBe('Sec-CH-Prefers-Color-Scheme');
  });
});

describe('setThemeCookie', () => {
  it('builds a Set-Cookie header', () => {
    const s = setThemeCookie('dark');
    expect(s).toContain('theme=dark');
    expect(s).toMatch(/Max-Age=\d+/);
  });

  it('accepts a custom cookieName', () => {
    expect(setThemeCookie('dark', { cookieName: 'app-theme' })).toContain('app-theme=dark');
  });
});

describe('getTheme', () => {
  it('reads the theme from a cookie header when provided', async () => {
    const t = await getTheme({ cookieHeader: 'theme=dark; other=1' });
    expect(t).toBe('dark');
  });

  it('falls back to the Sec-CH-Prefers-Color-Scheme header when cookie missing', async () => {
    const t = await getTheme({
      cookieHeader: '',
      headers: new Headers({ 'sec-ch-prefers-color-scheme': 'dark' }),
    });
    expect(t).toBe('dark');
  });

  it('returns null when both cookie and hint are absent', async () => {
    const t = await getTheme({ cookieHeader: '', headers: new Headers() });
    expect(t).toBeNull();
  });

  it('prefers cookie over the client hint', async () => {
    const t = await getTheme({
      cookieHeader: 'theme=light',
      headers: new Headers({ 'sec-ch-prefers-color-scheme': 'dark' }),
    });
    expect(t).toBe('light');
  });
});

describe('getThemeScript', () => {
  it('returns an IIFE-wrapped inline script', () => {
    const s = getThemeScript({});
    expect(s.startsWith('!function')).toBe(true);
    expect(s.endsWith('}();')).toBe(true);
  });

  it('honors the same options as the provider script', () => {
    const s = getThemeScript({
      attribute: 'class',
      themes: ['light', 'dark', 'sepia'],
      defaultTheme: 'sepia',
    });
    expect(s).toContain('"sepia"');
    expect(s).toContain('"d":"sepia"');
  });

  it('contains no esbuild __name artifacts', () => {
    expect(getThemeScript({})).not.toMatch(/__name\(/);
  });
});
