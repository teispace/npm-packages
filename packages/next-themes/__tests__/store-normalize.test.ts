import { describe, expect, it } from 'vitest';
import { resolveAdapter } from '../src/adapters/index';
import { createStore } from '../src/core/store';

function baseOpts() {
  return {
    themes: ['light', 'dark'],
    enableSystem: false,
    forcedTheme: null,
    initialTheme: null,
    followSystem: false,
    attribute: 'class' as const,
    value: null,
    enableColorScheme: true,
    themeColor: null,
    disableTransitionOnChange: false,
    respectReducedMotion: true,
    target: 'html',
    storage: resolveAdapter({ mode: 'none', key: 'theme' }),
  };
}

describe("store: 'system' handling when enableSystem=false", () => {
  it("with defaultTheme='system', resolvedTheme is coerced to a concrete theme", () => {
    const s = createStore({ ...baseOpts(), defaultTheme: 'system' });
    const state = s.getState();
    expect(state.theme).not.toBe('system');
    expect(state.resolvedTheme).not.toBe('system');
    expect(['light', 'dark']).toContain(state.resolvedTheme);
  });

  it("setTheme('system') is a no-op when enableSystem=false", () => {
    const s = createStore({ ...baseOpts(), defaultTheme: 'light' });
    s.mount();
    s.setTheme('system');
    expect(s.getState().theme).toBe('light');
    s.unmount();
  });

  it('invalid theme is rejected rather than coerced quietly', () => {
    const s = createStore({ ...baseOpts(), defaultTheme: 'light' });
    s.mount();
    s.setTheme('purple');
    expect(s.getState().theme).toBe('light');
    s.unmount();
  });
});

describe('store: target selector safety', () => {
  it('does not crash on an invalid CSS selector', () => {
    const s = createStore({ ...baseOpts(), defaultTheme: 'light', target: '>>>invalid' });
    expect(() => s.mount()).not.toThrow();
    expect(() => s.setTheme('dark')).not.toThrow();
    expect(s.getState().theme).toBe('dark');
    s.unmount();
  });
});
