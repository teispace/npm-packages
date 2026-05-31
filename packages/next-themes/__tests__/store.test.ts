import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('update({ forcedTheme }) snaps state to the forced value', () => {
    window.localStorage.setItem('theme', 'light');
    const s = createStore({ ...defaults(), enableSystem: false, defaultTheme: 'light' });
    s.mount();
    expect(s.getState().theme).toBe('light');
    s.update({ forcedTheme: 'dark' });
    expect(s.getState().theme).toBe('dark');
    expect(s.getState().forcedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    s.unmount();
  });

  it('update({ forcedTheme: null }) restores stored selection', () => {
    window.localStorage.setItem('theme', 'light');
    const s = createStore({
      ...defaults(),
      enableSystem: false,
      defaultTheme: 'light',
      forcedTheme: 'dark',
    });
    s.mount();
    expect(s.getState().theme).toBe('dark');
    s.update({ forcedTheme: null });
    expect(s.getState().theme).toBe('light');
    expect(s.getState().forcedTheme).toBe(null);
    s.unmount();
  });

  it('update({ onChange }) swaps the callback live', () => {
    const first = vi.fn();
    const second = vi.fn();
    const s = createStore({
      ...defaults(),
      enableSystem: false,
      defaultTheme: 'light',
      onChange: first,
    });
    s.mount();
    s.setTheme('dark');
    expect(first).toHaveBeenCalledTimes(1);
    s.update({ onChange: second });
    s.setTheme('light');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    s.unmount();
  });

  it('update({ themeColor }) re-applies <meta theme-color> without changing state', () => {
    window.localStorage.setItem('theme', 'dark');
    const s = createStore({ ...defaults(), enableSystem: false, defaultTheme: 'dark' });
    s.mount();
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull();
    s.update({ themeColor: { light: '#fff', dark: '#000' } });
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe('#000');
    s.unmount();
  });
});

describe('createStore — system-change emission (perf)', () => {
  function withSystem(theme: 'light' | 'dark'): () => void {
    let current = theme;
    let handler: ((e: { matches: boolean }) => void) | null = null;
    const mql = {
      get matches() {
        return current === 'dark';
      },
      media: '(prefers-color-scheme: dark)',
      addEventListener: (_: string, h: (e: { matches: boolean }) => void) => {
        handler = h;
      },
      removeEventListener: () => {
        handler = null;
      },
      addListener: (h: (e: { matches: boolean }) => void) => {
        handler = h;
      },
      removeListener: () => {
        handler = null;
      },
    };
    vi.stubGlobal('matchMedia', (q: string) => {
      if (q.includes('prefers-color-scheme')) return mql as unknown as MediaQueryList;
      return {
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      } as unknown as MediaQueryList;
    });
    // Returns a fn that simulates an OS theme flip.
    return () => {
      current = current === 'dark' ? 'light' : 'dark';
      handler?.({ matches: current === 'dark' });
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('does NOT emit or rewrite the DOM on an OS flip when a concrete theme is selected', () => {
    const flip = withSystem('light');
    window.localStorage.setItem('theme', 'light');
    const onChange = vi.fn();
    const s = createStore({ ...defaults(), defaultTheme: 'light', onChange });
    s.mount();
    const sub = vi.fn();
    s.subscribe(sub);
    document.documentElement.className = '';
    s.setTheme('dark'); // concrete selection
    sub.mockClear();
    onChange.mockClear();

    flip(); // OS goes light→dark; selection is still concrete 'dark'

    // resolvedTheme didn't change (concrete 'dark' selection) → no apply, no onChange.
    expect(onChange).not.toHaveBeenCalled();
    expect(s.getState().resolvedTheme).toBe('dark');
    // systemTheme IS tracked (and emitted so consumers showing OS pref update),
    // but the DOM class is untouched.
    expect(s.getState().systemTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    s.unmount();
  });

  it('does re-resolve and apply on an OS flip when theme is "system"', () => {
    const flip = withSystem('light');
    const onChange = vi.fn();
    const s = createStore({ ...defaults(), defaultTheme: 'system', onChange });
    s.mount();
    s.setTheme('system');
    onChange.mockClear();

    flip(); // OS light→dark

    expect(s.getState().resolvedTheme).toBe('dark');
    expect(onChange).toHaveBeenLastCalledWith('system', 'dark');
    s.unmount();
  });
});

describe('createStore — update() change detection (perf)', () => {
  afterEach(() => window.localStorage.clear());

  it('treats a fresh-but-equal value map as a no-op (no DOM re-apply)', () => {
    window.localStorage.setItem('theme', 'dark');
    const s = createStore({
      ...defaults(),
      enableSystem: false,
      defaultTheme: 'dark',
      value: { light: 'l', dark: 'd' },
    });
    s.mount();
    // Apply once so previousApplied is settled.
    s.update({ value: { light: 'l', dark: 'd' } });
    document.documentElement.className = '';
    // A new object literal with identical contents must NOT rewrite the DOM.
    s.update({ value: { light: 'l', dark: 'd' } });
    expect(document.documentElement.className).toBe('');
    // A genuinely different map DOES re-apply.
    s.update({ value: { light: 'l', dark: 'dark2' } });
    expect(document.documentElement.classList.contains('dark2')).toBe(true);
    s.unmount();
  });
});

describe('createStore — getServerSnapshot (SSR seeding)', () => {
  afterEach(() => window.localStorage.clear());

  it('returns the seeded initial state, stable across calls', () => {
    const s = createStore({
      ...defaults(),
      enableSystem: false,
      defaultTheme: 'light',
      initialTheme: 'dark',
      storage: resolveAdapter({ mode: 'none', key: 'theme' }),
    });
    const snap1 = s.getServerSnapshot();
    const snap2 = s.getServerSnapshot();
    expect(snap1).toBe(snap2); // referential stability (required by useSyncExternalStore)
    expect(snap1.theme).toBe('dark');
    expect(snap1.resolvedTheme).toBe('dark');
  });

  it('reflects forcedTheme in the server snapshot', () => {
    const s = createStore({
      ...defaults(),
      enableSystem: false,
      defaultTheme: 'light',
      forcedTheme: 'dark',
    });
    expect(s.getServerSnapshot().resolvedTheme).toBe('dark');
    expect(s.getServerSnapshot().forcedTheme).toBe('dark');
  });
});
