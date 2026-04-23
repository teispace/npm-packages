import { describe, expect, it } from 'vitest';
import { normalizeSelection, resolveTheme } from '../src/core/resolve';

const readers = {
  readCookie: () => null,
  readLocal: () => null,
  readSession: () => null,
};

describe('normalizeSelection', () => {
  it('passes through a valid concrete theme', () => {
    expect(normalizeSelection('dark', ['light', 'dark'], 'light', true)).toBe('dark');
  });

  it("keeps 'system' only when enableSystem is true", () => {
    expect(normalizeSelection('system', ['light', 'dark'], 'light', true)).toBe('system');
    expect(normalizeSelection('system', ['light', 'dark'], 'light', false)).toBe('light');
  });

  it('falls back to defaultTheme for unknown values', () => {
    expect(normalizeSelection('purple', ['light', 'dark'], 'light', true)).toBe('light');
  });

  it("never returns 'system' when enableSystem is false — even if defaultTheme is 'system'", () => {
    expect(normalizeSelection('system', ['light', 'dark'], 'system', false)).toBe('light');
    expect(normalizeSelection(null, ['sepia', 'mint'], 'system', false)).toBe('sepia');
  });

  it("supports all-custom themes with 'system' defaultTheme", () => {
    expect(normalizeSelection('mint', ['sepia', 'mint'], 'system', false)).toBe('mint');
  });

  it('last-resort falls back to the first theme, then to "light"', () => {
    expect(normalizeSelection(null, ['sepia'], 'unknown', false)).toBe('sepia');
    expect(normalizeSelection(null, [], 'unknown', false)).toBe('light');
  });
});

describe('resolveTheme invariant: resolvedTheme is always concrete', () => {
  const base = {
    themes: ['light', 'dark'],
    systemTheme: 'light' as const,
    storageMode: 'local' as const,
    storageKey: 'theme',
    cookieName: 'theme',
    initialTheme: null,
    forcedTheme: null,
    ...readers,
  };

  it("when enableSystem=false and defaultTheme='system', resolvedTheme stays concrete", () => {
    const r = resolveTheme({
      ...base,
      enableSystem: false,
      defaultTheme: 'system',
      readLocal: () => null,
    });
    expect(r.theme).not.toBe('system');
    expect(r.resolvedTheme).not.toBe('system');
    expect(['light', 'dark']).toContain(r.resolvedTheme);
  });

  it("when enableSystem=false and storage returns 'system', resolvedTheme stays concrete", () => {
    const r = resolveTheme({
      ...base,
      enableSystem: false,
      defaultTheme: 'light',
      readLocal: () => 'system',
    });
    expect(r.theme).not.toBe('system');
    expect(r.resolvedTheme).not.toBe('system');
  });

  it("when enableSystem=true and theme='system', resolvedTheme is the systemTheme", () => {
    const r = resolveTheme({
      ...base,
      enableSystem: true,
      defaultTheme: 'system',
      systemTheme: 'dark',
      readLocal: () => null,
    });
    expect(r.theme).toBe('system');
    expect(r.resolvedTheme).toBe('dark');
  });

  it('forcedTheme short-circuits everything', () => {
    const r = resolveTheme({
      ...base,
      enableSystem: true,
      defaultTheme: 'light',
      forcedTheme: 'dark',
    });
    expect(r.theme).toBe('dark');
    expect(r.resolvedTheme).toBe('dark');
  });
});
