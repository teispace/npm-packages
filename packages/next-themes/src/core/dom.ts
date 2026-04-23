import type { Attribute } from './types';

const DISABLE_TRANSITION_CSS =
  '*,*::before,*::after{-webkit-transition:none!important;transition:none!important;-moz-transition:none!important;-o-transition:none!important;}';

const MEDIA_DARK = '(prefers-color-scheme: dark)';
const MEDIA_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia(MEDIA_DARK).matches ? 'dark' : 'light';
}

export function subscribeSystem(cb: (theme: 'light' | 'dark') => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia(MEDIA_DARK);
  const handler = (e: MediaQueryListEvent) => cb(e.matches ? 'dark' : 'light');
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
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
      const toRemove = new Set<string>();
      for (const t of allThemes) {
        const mapped = valueMap?.[t] ?? t;
        for (const c of mapped.split(/\s+/)) if (c) toRemove.add(c);
      }
      if (previousApplied) {
        for (const c of previousApplied.split(/\s+/)) if (c) toRemove.add(c);
      }
      for (const c of toRemove) el.classList.remove(c);
      for (const c of applied.split(/\s+/)) if (c) el.classList.add(c);
    } else {
      el.setAttribute(attr, applied);
    }
  }
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
  if (!themeColor || typeof document === 'undefined') return;
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
  if (typeof document === 'undefined') return () => {};
  if (respectReducedMotion && window.matchMedia(MEDIA_REDUCED_MOTION).matches) return () => {};
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
