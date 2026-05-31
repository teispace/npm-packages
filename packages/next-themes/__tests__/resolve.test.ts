import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAdapter } from '../src/adapters/index';
import { normalizeSelection } from '../src/core/resolve';
import { createStore } from '../src/core/store';

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

/**
 * The "resolvedTheme is always concrete" invariant, tested against the REAL
 * resolution path (the store's `initial()`), not a parallel pure helper — so
 * the assertions track the code that actually runs in production.
 */
describe('store resolution invariant: resolvedTheme is always concrete', () => {
  function mockSystem(theme: 'light' | 'dark'): void {
    vi.stubGlobal(
      'matchMedia',
      (q: string) =>
        ({
          matches: q.includes('dark') ? theme === 'dark' : false,
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
        }) as unknown as MediaQueryList,
    );
  }

  function base() {
    return {
      themes: ['light', 'dark'],
      attribute: 'class' as const,
      value: null,
      enableColorScheme: true,
      themeColor: null,
      disableTransitionOnChange: false,
      respectReducedMotion: true,
      target: 'html',
      forcedTheme: null,
      initialTheme: null,
      followSystem: false,
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("when enableSystem=false and defaultTheme='system', resolvedTheme stays concrete", () => {
    const s = createStore({
      ...base(),
      enableSystem: false,
      defaultTheme: 'system',
      storage: resolveAdapter({ mode: 'local', key: 'theme' }),
    });
    const st = s.getState();
    expect(st.theme).not.toBe('system');
    expect(st.resolvedTheme).not.toBe('system');
    expect(['light', 'dark']).toContain(st.resolvedTheme);
  });

  it("when enableSystem=false and storage returns 'system', resolvedTheme stays concrete", () => {
    window.localStorage.setItem('theme', 'system');
    const s = createStore({
      ...base(),
      enableSystem: false,
      defaultTheme: 'light',
      storage: resolveAdapter({ mode: 'local', key: 'theme' }),
    });
    const st = s.getState();
    expect(st.theme).not.toBe('system');
    expect(st.resolvedTheme).not.toBe('system');
  });

  it("when enableSystem=true and theme='system', resolvedTheme is the systemTheme", () => {
    mockSystem('dark');
    const s = createStore({
      ...base(),
      enableSystem: true,
      defaultTheme: 'system',
      storage: resolveAdapter({ mode: 'none', key: 'theme' }),
    });
    const st = s.getState();
    expect(st.theme).toBe('system');
    expect(st.resolvedTheme).toBe('dark');
  });

  it('forcedTheme short-circuits everything', () => {
    const s = createStore({
      ...base(),
      enableSystem: true,
      defaultTheme: 'light',
      forcedTheme: 'dark',
      storage: resolveAdapter({ mode: 'local', key: 'theme' }),
    });
    const st = s.getState();
    expect(st.theme).toBe('dark');
    expect(st.resolvedTheme).toBe('dark');
  });
});
