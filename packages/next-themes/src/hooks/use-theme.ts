'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ThemeStore } from '../core/store';
import type { SetThemeOptions, ThemeContract, ThemeState } from '../core/types';

export const ThemeStoreContext = createContext<ThemeStore | null>(null);

const EMPTY: ThemeState = {
  theme: 'system',
  resolvedTheme: 'light',
  systemTheme: null,
  forcedTheme: null,
  themes: [],
};

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
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[@teispace/next-themes] useTheme() called outside a ThemeProvider. Returning inert values.',
      );
    }
    return {
      ...state,
      setTheme: () => {},
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
