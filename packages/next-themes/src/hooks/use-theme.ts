'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ThemeStore } from '../core/store';
import type { SetThemeOptions, ThemeContract, ThemeState } from '../core/types';

export const ThemeStoreContext = createContext<ThemeStore | null>(null);

/**
 * Inert state used when `useTheme()` is called outside a `ThemeProvider`.
 * Empty strings (rather than the previous `'system'`/`'light'` placeholders)
 * are deliberate: a consumer that branches on `theme === 'dark'` should NOT
 * accidentally match because there happened to be a default sentinel value.
 *
 * `themes: []` is the load-bearing invariant — code can robustly detect
 * "provider not mounted yet" via `themes.length === 0`.
 */
const EMPTY: ThemeState = {
  theme: '',
  resolvedTheme: '',
  systemTheme: null,
  forcedTheme: null,
  themes: [],
};

const NOOP_SET = (): void => {
  /* no provider — set is inert */
};

let warned = false;
function warnNoProvider(): void {
  if (warned) return;
  warned = true;
  // Once-per-session warn so noisy consumer trees don't flood the console.
  console.warn(
    '[@teispace/next-themes] useTheme() called outside a ThemeProvider. Returning inert values (theme="", themes=[]).',
  );
}

/**
 * Read the current theme state and obtain a setter. Must be called inside a
 * ThemeProvider. `T` narrows the accepted theme values for setTheme.
 */
export function useTheme<T extends string = string>(): ThemeContract & {
  theme: T | 'system';
  resolvedTheme: T;
  setTheme: (
    theme: T | 'system' | ((prev: T | 'system') => T | 'system'),
    options?: SetThemeOptions,
  ) => void;
} {
  const store = useContext(ThemeStoreContext);
  const state = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getState : getEmpty,
    getEmpty,
  );
  if (!store) {
    if (process.env.NODE_ENV !== 'production') warnNoProvider();
    return {
      ...state,
      setTheme: NOOP_SET,
    } as ThemeContract as ReturnType<typeof useTheme<T>>;
  }
  return {
    ...state,
    setTheme: store.setTheme,
  } as ReturnType<typeof useTheme<T>>;
}

function noopSubscribe(): () => void {
  return () => {};
}
function getEmpty(): ThemeState {
  return EMPTY;
}
