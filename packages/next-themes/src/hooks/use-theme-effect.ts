'use client';

import { type DependencyList, useEffect, useRef } from 'react';
import type { UseThemeHook } from './use-theme';
import { useTheme } from './use-theme';

export type UseThemeEffectHook = <T extends string = string>(
  effect: (theme: T | 'system', resolvedTheme: T) => void | (() => void),
  deps?: DependencyList,
) => void;

/**
 * Build a `useThemeEffect` bound to a specific `useTheme`. See `makeUseTheme`.
 */
export function makeUseThemeEffect(useThemeHook: UseThemeHook): UseThemeEffectHook {
  return function useThemeEffect<T extends string = string>(
    effect: (theme: T | 'system', resolvedTheme: T) => void | (() => void),
    deps: DependencyList = [],
  ): void {
    const { theme, resolvedTheme } = useThemeHook<T>();
    const firstRun = useRef(true);
    // biome-ignore lint/correctness/useExhaustiveDependencies: user-supplied deps array
    useEffect(() => {
      // `firstRun.current` is read inside the effect, not during render, so this
      // stays clean under React Compiler's ref-access validation.
      if (firstRun.current) {
        firstRun.current = false;
        return;
      }
      return effect(theme as T, resolvedTheme as T);
    }, [theme, resolvedTheme, ...deps]);
  };
}

/**
 * Run an effect whenever the theme changes. Unlike a raw `useEffect` based on
 * `useTheme()`, this hook *does not* fire on first mount — it only fires on
 * subsequent theme changes, so it is safe for "on change" side-effects like
 * analytics or server persistence.
 *
 * Return a cleanup function to run on the next change, same as `useEffect`.
 */
export const useThemeEffect: UseThemeEffectHook = makeUseThemeEffect(useTheme);
