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

  it('does not inject disable-transition <style> on first mount', () => {
    document.head.querySelectorAll('style[data-test-leftover]').forEach((el) => el.remove());
    window.localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    const beforeStyles = document.head.querySelectorAll('style').length;
    const s = createStore({
      ...defaults(),
      disableTransitionOnChange: true,
    });
    s.mount();
    // Style count should not increase on mount — the inline script handled
    // the initial paint, so re-injecting a disable-transition style is
    // wasted DOM thrash and itself a flicker source.
    expect(document.head.querySelectorAll('style').length).toBe(beforeStyles);
    s.unmount();
  });

  it('re-reads storage on bfcache pageshow', () => {
    window.localStorage.setItem('theme', 'light');
    const s = createStore({ ...defaults(), enableSystem: false, defaultTheme: 'light' });
    s.mount();
    expect(s.getState().theme).toBe('light');
    // Simulate a bfcache restore where another tab changed the theme.
    window.localStorage.setItem('theme', 'dark');
    const event = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);
    expect(s.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    s.unmount();
  });

  it('ignores non-persisted pageshow (normal navigation)', () => {
    window.localStorage.setItem('theme', 'light');
    const s = createStore({ ...defaults(), enableSystem: false, defaultTheme: 'light' });
    s.mount();
    window.localStorage.setItem('theme', 'dark');
    const event = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: false });
    window.dispatchEvent(event);
    // Non-persisted pageshow fires on every load; we should NOT react,
    // since the inline script already handled this case.
    expect(s.getState().theme).toBe('light');
    s.unmount();
  });

  it('setTheme accepts an updater function (upstream SetStateAction parity)', () => {
    // Mirrors React's `Dispatch<SetStateAction<string>>` so existing
    // upstream `next-themes` code (`setTheme(prev => ...)`) keeps working.
    window.localStorage.setItem('theme', 'light');
    const s = createStore({ ...defaults(), enableSystem: false, defaultTheme: 'light' });
    expect(s.getState().theme).toBe('light');
    s.setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    expect(s.getState().theme).toBe('dark');
    s.setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    expect(s.getState().theme).toBe('light');
  });
});
