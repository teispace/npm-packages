'use client';

import { useContext, useSyncExternalStore } from 'react';
import { DefaultThemeContext, type ThemeContext } from '../core/context';
import type { SetThemeOptions, ThemeContract, ThemeState } from '../core/types';

/**
 * Re-exported under its historical name so existing imports keep working.
 * New code should prefer {@link DefaultThemeContext} from `core/context`.
 */
export const ThemeStoreContext = DefaultThemeContext;

/**
 * Inert state used when `useTheme()` is called outside a `ThemeProvider`.
 * Empty strings (rather than `'system'`/`'light'` placeholders) are deliberate:
 * a consumer that branches on `theme === 'dark'` should NOT accidentally match
 * because there happened to be a default sentinel value.
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

function noopSubscribe(): () => void {
  return () => {};
}
function getEmpty(): ThemeState {
  return EMPTY;
}

/** The shape every bound `useTheme` returns, generic over the theme union. */
export type UseThemeHook = <T extends string = string>() => ThemeContract & {
  theme: T | 'system';
  resolvedTheme: T;
  setTheme: (
    theme: T | 'system' | ((prev: T | 'system') => T | 'system'),
    options?: SetThemeOptions,
  ) => void;
};

/**
 * Build a `useTheme` bound to a specific {@link ThemeContext}.
 *
 * `createThemes()` uses this to bind its hooks to its own private context, so
 * two typed theme APIs in one app cannot read each other's store. The top-level
 * `useTheme` export below is simply this factory applied to the default
 * context.
 */
export function makeUseTheme(Context: ThemeContext): UseThemeHook {
  // Deliberately non-generic internally: the theme union `T` is a pure
  // compile-time narrowing with no runtime effect, so declaring it here would
  // be an unused type parameter. The single cast on the returned function
  // applies the generic `UseThemeHook` signature to callers.
  function useTheme() {
    const store = useContext(Context);
    const state = useSyncExternalStore(
      store ? store.subscribe : noopSubscribe,
      store ? store.getState : getEmpty,
      // Server snapshot: with a provider, reflect the cookie-seeded initial
      // state so SSR renders the correct theme (no post-hydration flip for
      // theme-dependent UI). Without a provider, stay inert.
      store ? store.getServerSnapshot : getEmpty,
    );
    if (!store) {
      if (process.env.NODE_ENV !== 'production') warnNoProvider();
      return {
        ...state,
        setTheme: NOOP_SET,
      } as ThemeContract as ReturnType<UseThemeHook>;
    }
    return {
      ...state,
      setTheme: store.setTheme,
    } as ReturnType<UseThemeHook>;
  }
  return useTheme as UseThemeHook;
}

/**
 * Read the current theme state and obtain a setter. Must be called inside a
 * ThemeProvider. `T` narrows the accepted theme values for setTheme.
 */
export const useTheme: UseThemeHook = makeUseTheme(DefaultThemeContext);
