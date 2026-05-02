'use client';

import { type DependencyList, useEffect, useRef } from 'react';
import { useTheme } from './use-theme';

/**
 * Run an effect whenever the theme changes. Unlike a raw `useEffect` based on
 * `useTheme()`, this hook *does not* fire on first mount — it only fires on
 * subsequent theme changes, so it is safe for "on change" side-effects like
 * analytics or server persistence.
 *
 * Return a cleanup function to run on the next change, same as `useEffect`.
 */
export function useThemeEffect<T extends string = string>(
  effect: (theme: T | 'system', resolvedTheme: T) => void | (() => void),
  deps: DependencyList = [],
): void {
  const { theme, resolvedTheme } = useTheme<T>();
  const firstRun = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: user-supplied deps array
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    return effect(theme as T, resolvedTheme as T);
  }, [theme, resolvedTheme, ...deps]);
}
