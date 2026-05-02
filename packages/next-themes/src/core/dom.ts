import { hasMatchMedia, isDom } from './env';
import type { Attribute } from './types';

const DISABLE_TRANSITION_CSS =
  '*,*::before,*::after{-webkit-transition:none!important;transition:none!important;-moz-transition:none!important;-o-transition:none!important;}';

const MEDIA_DARK = '(prefers-color-scheme: dark)';
const MEDIA_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function getSystemTheme(): 'light' | 'dark' {
  if (!hasMatchMedia()) return 'light';
  try {
    return window.matchMedia(MEDIA_DARK).matches ? 'dark' : 'light';
  } catch (_e) {
    return 'light';
  }
}

/**
 * Resolve the target element safely. `document.querySelector` throws a
 * `DOMException` on invalid CSS selectors — catching that keeps a misconfig
 * from crashing `setTheme` forever. Returns `documentElement` as fallback.
 */
export function resolveTarget(target: string): HTMLElement {
  if (!isDom()) {
    return null as unknown as HTMLElement;
  }
  try {
    const found = document.querySelector(target) as HTMLElement | null;
    if (found) return found;
  } catch (_e) {
    /* invalid selector — fall through to documentElement */
  }
  return document.documentElement;
}

export function subscribeSystem(cb: (theme: 'light' | 'dark') => void): () => void {
  if (!hasMatchMedia()) return () => {};
  let mql: MediaQueryList;
  try {
    mql = window.matchMedia(MEDIA_DARK);
  } catch (_e) {
    return () => {};
  }
  const handler = (e: MediaQueryListEvent): void => cb(e.matches ? 'dark' : 'light');
  // Safari < 14 only supports the legacy `addListener`/`removeListener`.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }
  const legacy = mql as unknown as {
    addListener?: (h: (e: MediaQueryListEvent) => void) => void;
    removeListener?: (h: (e: MediaQueryListEvent) => void) => void;
  };
  if (typeof legacy.addListener === 'function') {
    legacy.addListener(handler);
    return () => legacy.removeListener?.(handler);
  }
  return () => {};
}

export function applyAttribute(
  el: Element,
  attribute: Attribute | Attribute[],
  value: string,
  previousValue: string | null,
  valueMap: Record<string, string> | undefined,
  allThemes: string[],
): void {
  const attrs = Array.isArray(attribute) ? attribute : [attribute];
  const applied = valueMap?.[value] ?? value;
  const previousApplied =
    previousValue !== null ? (valueMap?.[previousValue] ?? previousValue) : null;

  for (const attr of attrs) {
    if (attr === 'class') {
      // Build the union of stale class names that may exist on the element.
      const stale = new Set<string>();
      for (const t of allThemes) {
        const mapped = valueMap?.[t] ?? t;
        for (const c of mapped.split(/\s+/)) if (c) stale.add(c);
      }
      if (previousApplied) {
        for (const c of previousApplied.split(/\s+/)) if (c) stale.add(c);
      }
      // Subtract the classes we are about to apply so we never
      // remove-then-add a class that is already in place — that round-trip
      // can trigger style invalidation even though the result is identical.
      const target = new Set<string>();
      for (const c of applied.split(/\s+/)) {
        if (c) {
          target.add(c);
          stale.delete(c);
        }
      }
      for (const c of stale) {
        if (el.classList.contains(c)) el.classList.remove(c);
      }
      for (const c of target) {
        if (!el.classList.contains(c)) el.classList.add(c);
      }
    } else {
      if (el.getAttribute(attr) !== applied) el.setAttribute(attr, applied);
    }
  }
}

/**
 * Cheap "is the DOM already in the requested state" check. Lets the store
 * skip a no-op apply, which avoids injecting the `disableTransitionOnChange`
 * <style> tag for nothing — itself a flicker source.
 */
export function isAttributeAlreadyApplied(
  el: Element,
  attribute: Attribute | Attribute[],
  applied: string,
): boolean {
  const attrs = Array.isArray(attribute) ? attribute : [attribute];
  const wanted = applied.split(/\s+/).filter(Boolean);
  for (const attr of attrs) {
    if (attr === 'class') {
      for (const c of wanted) {
        if (!el.classList.contains(c)) return false;
      }
    } else {
      if (el.getAttribute(attr) !== applied) return false;
    }
  }
  return true;
}

export function applyColorScheme(el: HTMLElement, theme: string): void {
  if (theme === 'light' || theme === 'dark') {
    el.style.colorScheme = theme;
  } else {
    el.style.colorScheme = '';
  }
}

export function applyThemeColor(
  theme: string,
  resolvedTheme: string,
  themeColor: string | Record<string, string> | undefined,
): void {
  if (!themeColor || !isDom()) return;
  const color =
    typeof themeColor === 'string' ? themeColor : (themeColor[resolvedTheme] ?? themeColor[theme]);
  if (!color) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}

export function disableTransition(value: string | true, respectReducedMotion: boolean): () => void {
  if (!isDom()) return () => {};
  if (respectReducedMotion && hasMatchMedia()) {
    try {
      if (window.matchMedia(MEDIA_REDUCED_MOTION).matches) return () => {};
    } catch (_e) {
      /* ignore — fall through and apply the disable */
    }
  }
  const css = value === true ? DISABLE_TRANSITION_CSS : value;
  const style = document.createElement('style');
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
  if (document.body) void window.getComputedStyle(document.body).opacity;
  return () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
      });
    });
  };
}
