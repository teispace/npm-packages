import { afterEach, beforeEach, vi } from 'vitest';

// jsdom does not implement `matchMedia`; polyfill with a default that reports
// no match so `getSystemTheme()` + reduced-motion checks work in tests.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/**
 * Node 22+ ships an experimental `globalThis.localStorage` that can shadow
 * jsdom's Storage and break `.setItem()`. If the inherited implementation is
 * missing a functional `setItem`, install a simple Map-backed polyfill so the
 * tests pass identically on Node 20 (CI) and 22+ (local).
 */
function installStoragePolyfill(): void {
  if (typeof window === 'undefined') return;
  const keys = ['localStorage', 'sessionStorage'] as const;
  for (const key of keys) {
    const existing = window[key] as unknown as Storage | undefined;
    if (existing && typeof existing.setItem === 'function') continue;
    const store = new Map<string, string>();
    const polyfill: Storage = {
      get length() {
        return store.size;
      },
      getItem(k) {
        return store.has(k) ? (store.get(k) as string) : null;
      },
      setItem(k, v) {
        store.set(k, String(v));
      },
      removeItem(k) {
        store.delete(k);
      },
      clear() {
        store.clear();
      },
      key(i) {
        return Array.from(store.keys())[i] ?? null;
      },
    };
    Object.defineProperty(window, key, {
      configurable: true,
      value: polyfill,
    });
    if (globalThis !== (window as unknown as typeof globalThis)) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value: polyfill,
      });
    }
  }
}
installStoragePolyfill();

/**
 * The engine the tests start from: no constructable stylesheets and no
 * view-transition types, so the `<style nonce>` and level-1 paths are what
 * runs. jsdom 31 has both; a test that covers them opts in (`installAdoptedStyleSheets`
 * in csp.test.tsx, a `CSS.supports` spy in view-transition.test.ts), so both
 * paths stay tested whatever the jsdom version.
 */
function pinBaselineEngine(): void {
  if (typeof Document === 'undefined') return;
  delete (Document.prototype as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    const supports = CSS.supports.bind(CSS) as (...args: string[]) => boolean;
    Object.defineProperty(CSS, 'supports', {
      configurable: true,
      writable: true,
      value: (...args: string[]) =>
        args.join(' ').includes('view-transition-type') ? false : supports(...args),
    });
  }
}
pinBaselineEngine();

beforeEach(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
    document.cookie.split('; ').forEach((c) => {
      const name = c.split('=')[0];
      if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
    });
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.clear();
    } catch (_e) {
      /* ignore */
    }
    try {
      window.sessionStorage.clear();
    } catch (_e) {
      /* ignore */
    }
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});
