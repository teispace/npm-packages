import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAdapter } from '../src/adapters/index';
import { createStore } from '../src/core/store';

function defaults() {
  return {
    themes: ['light', 'dark'],
    defaultTheme: 'light',
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
    storage: resolveAdapter({ mode: 'local', key: 'theme' }),
  };
}

describe('store + view transition', () => {
  beforeEach(() => {
    (document as unknown as { startViewTransition?: unknown }).startViewTransition = undefined;
  });

  afterEach(() => {
    (document as unknown as { startViewTransition?: unknown }).startViewTransition = undefined;
  });

  it('applies directly when transition is undefined', () => {
    const store = createStore(defaults());
    store.mount();
    store.setTheme('dark');
    expect(store.getState().theme).toBe('dark');
    store.unmount();
  });

  it('calls startViewTransition when transition is enabled and API is available', () => {
    const d = document as unknown as { startViewTransition: (cb: () => void) => unknown };
    const spy = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    d.startViewTransition = spy;

    const store = createStore({ ...defaults(), transition: 'fade' });
    store.mount();
    store.setTheme('dark');
    expect(spy).toHaveBeenCalledOnce();
    expect(store.getState().theme).toBe('dark');
    store.unmount();
  });

  it('per-call transition override wins over provider default', () => {
    const spy = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    (document as unknown as { startViewTransition: typeof spy }).startViewTransition = spy;

    // Provider default = false (none); per-call = 'fade'
    const store = createStore({ ...defaults(), transition: false });
    store.mount();
    store.setTheme('dark', { transition: 'fade' });
    expect(spy).toHaveBeenCalledOnce();
    store.unmount();
  });

  it('per-call transition can disable a provider-default transition', () => {
    const spy = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    (document as unknown as { startViewTransition: typeof spy }).startViewTransition = spy;

    const store = createStore({ ...defaults(), transition: 'fade' });
    store.mount();
    store.setTheme('dark', { transition: false });
    expect(spy).not.toHaveBeenCalled();
    store.unmount();
  });

  it('falls back to direct apply when browser does not support the API', () => {
    // startViewTransition remains undefined
    const store = createStore({ ...defaults(), transition: 'circular' });
    store.mount();
    store.setTheme('dark');
    expect(store.getState().theme).toBe('dark');
    store.unmount();
  });
});

describe('store + disableTransitionOnChange — no-op short circuit', () => {
  it('does not inject a disable-transition <style> when setTheme is a no-op', () => {
    // Repeated setTheme('dark') after the DOM is already 'dark' must NOT
    // re-insert the transition-disable style tag — that tag is itself a
    // flicker source (forces a layout flush + paint reset). The competitor
    // `@wrksz/themes` re-inserts on every apply; ours short-circuits via
    // `previousApplied` + DOM equality.
    const store = createStore({
      ...defaults(),
      disableTransitionOnChange: true,
    });
    store.mount();
    store.setTheme('dark');
    const beforeCount = document.head.querySelectorAll('style').length;
    store.setTheme('dark'); // identical theme
    store.setTheme('dark'); // and again
    expect(document.head.querySelectorAll('style').length).toBe(beforeCount);
    store.unmount();
  });

  it('still injects the disable-transition <style> when the theme actually changes', () => {
    // Sanity check: the short-circuit must not over-fire. A real change
    // should still flush the transitions for the duration of the swap.
    const store = createStore({
      ...defaults(),
      disableTransitionOnChange: true,
    });
    store.mount();
    store.setTheme('dark');
    store.setTheme('light');
    // The style is removed via requestAnimationFrame, but during the same
    // synchronous tick it should have been observed in the DOM at least
    // once between setTheme calls. We assert behaviorally via a spy:
    const spy = vi.spyOn(document.head, 'appendChild');
    store.setTheme('dark');
    expect(spy.mock.calls.some(([node]) => (node as HTMLElement).tagName === 'STYLE')).toBe(true);
    spy.mockRestore();
    store.unmount();
  });
});
