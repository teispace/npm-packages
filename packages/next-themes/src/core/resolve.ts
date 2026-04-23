import type { StorageMode } from './types';

export interface ResolveInput {
  forcedTheme: string | null;
  storageMode: StorageMode;
  storageKey: string;
  cookieName: string;
  initialTheme: string | null;
  defaultTheme: string;
  themes: string[];
  enableSystem: boolean;
  systemTheme: 'light' | 'dark';
  readCookie: (name: string) => string | null;
  readLocal: (key: string) => string | null;
  readSession: (key: string) => string | null;
}

export interface ResolveOutput {
  theme: string;
  resolvedTheme: string;
}

/**
 * Coerce a raw theme value into something the library's contract guarantees:
 *   • `'system'` only when `enableSystem` is true.
 *   • Otherwise a concrete entry from `themes`.
 *   • Last-resort fallback: the first configured theme, or `'light'`.
 *
 * This is the one place that enforces `resolvedTheme` is never `'system'`.
 */
export function normalizeSelection(
  raw: string | null | undefined,
  themes: string[],
  defaultTheme: string,
  enableSystem: boolean,
): string {
  const systemAllowed = enableSystem;
  if (raw === 'system' && systemAllowed) return 'system';
  if (raw && themes.includes(raw)) return raw;
  if (defaultTheme === 'system' && systemAllowed) return 'system';
  if (themes.includes(defaultTheme)) return defaultTheme;
  return themes[0] ?? 'light';
}

/**
 * Pure theme resolution. Shared semantics with the inline script.
 * Given the current env (forced, storages, system), return the effective
 * selected theme and its resolved form.
 *
 * Invariant: `resolvedTheme` is always a concrete theme (never `'system'`).
 */
export function resolveTheme(i: ResolveInput): ResolveOutput {
  let rawTheme: string | null = null;
  if (i.forcedTheme) {
    rawTheme = i.forcedTheme;
  } else {
    const chain: StorageMode[] =
      i.storageMode === 'hybrid'
        ? ['cookie', 'local']
        : i.storageMode === 'none'
          ? []
          : [i.storageMode];
    for (const mode of chain) {
      if (rawTheme) break;
      if (mode === 'cookie') rawTheme = i.readCookie(i.cookieName);
      else if (mode === 'local') rawTheme = i.readLocal(i.storageKey);
      else if (mode === 'session') rawTheme = i.readSession(i.storageKey);
    }
    if (!rawTheme && i.initialTheme) rawTheme = i.initialTheme;
    if (!rawTheme) rawTheme = i.defaultTheme;
  }

  const theme = normalizeSelection(rawTheme, i.themes, i.defaultTheme, i.enableSystem);
  const resolvedTheme = theme === 'system' ? i.systemTheme : theme;
  return { theme, resolvedTheme };
}
