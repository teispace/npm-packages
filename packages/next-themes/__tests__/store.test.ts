import { describe, expect, it, vi } from 'vitest';
import { resolveAdapter } from '../src/adapters/index';
import { createStore } from '../src/core/store';

function defaults() {
  return {
    themes: ['light', 'dark'],
    defaultTheme: 'system',
    enableSystem: true,
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
    storage: resolveAdapter({ mode: 'local', key: 'theme' }),
  };
}

describe('createStore', () => {
  it('initializes to system → resolved by matchMedia', () => {
    const s = createStore(defaults());
    const state = s.getState();
    expect(state.theme).toBe('system');
    expect(['light', 'dark']).toContain(state.resolvedTheme);
  });

  it('reads stored theme as initial', () => {
    window.localStorage.setItem('theme', 'dark');
    const s = createStore(defaults());
    expect(s.getState().theme).toBe('dark');
    expect(s.getState().resolvedTheme).toBe('dark');
  });

  it('applies class to documentElement on mount and switch', () => {
    const s = createStore(defaults());
    s.mount();
    s.setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    s.setTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    s.unmount();
  });

  it('persists to storage on setTheme', () => {
    const s = createStore(defaults());
    s.mount();
    s.setTheme('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    s.unmount();
  });

  it('ignores setTheme when forcedTheme is set', () => {
    const s = createStore({ ...defaults(), forcedTheme: 'dark' });
    s.mount();
    s.setTheme('light');
    expect(s.getState().theme).toBe('dark');
    expect(s.getState().forcedTheme).toBe('dark');
    s.unmount();
  });

  it('ignores invalid theme names', () => {
    const s = createStore(defaults());
    const before = s.getState().theme;
    s.setTheme('not-a-theme');
    expect(s.getState().theme).toBe(before);
  });

  it('notifies subscribers on state change', () => {
    const s = createStore(defaults());
    s.mount();
    const spy = vi.fn();
    const unsub = s.subscribe(spy);
    s.setTheme('dark');
    expect(spy).toHaveBeenCalled();
    unsub();
    s.unmount();
  });

  it('fires onChange with theme and resolvedTheme', () => {
    const onChange = vi.fn();
    const s = createStore({ ...defaults(), onChange });
    s.mount();
    s.setTheme('dark');
    expect(onChange).toHaveBeenLastCalledWith('dark', 'dark');
    s.unmount();
  });

  it('sets colorScheme CSS when enabled', () => {
    const s = createStore(defaults());
    s.mount();
    s.setTheme('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    s.unmount();
  });
});
