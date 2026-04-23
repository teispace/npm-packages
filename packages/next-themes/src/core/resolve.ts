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
 * Pure theme resolution. Shared semantics with the inline script.
 * Given the current env (forced, storages, system), return the effective
 * selected theme and its resolved form.
 */
export function resolveTheme(i: ResolveInput): ResolveOutput {
  let theme: string | null = null;
  if (i.forcedTheme) {
    theme = i.forcedTheme;
  } else {
    const chain: StorageMode[] =
      i.storageMode === 'hybrid'
        ? ['cookie', 'local']
        : i.storageMode === 'none'
          ? []
          : [i.storageMode];
    for (const mode of chain) {
      if (theme) break;
      if (mode === 'cookie') theme = i.readCookie(i.cookieName);
      else if (mode === 'local') theme = i.readLocal(i.storageKey);
      else if (mode === 'session') theme = i.readSession(i.storageKey);
    }
    if (!theme && i.initialTheme) theme = i.initialTheme;
    if (!theme) theme = i.defaultTheme;
  }

  const isSystem = theme === 'system' && i.enableSystem;
  if (!isSystem && !i.themes.includes(theme)) theme = i.defaultTheme;

  const resolvedTheme = isSystem ? i.systemTheme : theme;
  return { theme, resolvedTheme };
}
