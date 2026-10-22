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
  // biome-ignore lint/correctness/noComponentHookFactories: built once per createThemes() call, at module level
  return function useThemeEffect<T extends string = string>(
    effect: (theme: T | 'system', resolvedTheme: T) => void | (() => void),
    deps: DependencyList = [],
  ): void {
    const { theme, resolvedTheme } = useThemeHook<T>();
    // The theme seen on mount, and whether it has changed since. A plain
    // "skip the first run" flag fired on mount under StrictMode, which runs
    // every effect twice: the second run was no longer "first". Comparing
    // against the mount-time theme skips both runs. Refs are only touched
    // inside the effect, so this stays clean under React Compiler.
    const baseline = useRef<string | null>(null);
    const changed = useRef(false);
    // biome-ignore lint/correctness/useExhaustiveDependencies: user-supplied deps array
    useEffect(() => {
      if (!changed.current) {
        const key = `${theme}\u0000${resolvedTheme}`;
        if (baseline.current === null) baseline.current = key;
        if (baseline.current === key) return;
        changed.current = true;
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
export const useThemeEffect: UseThemeEffectHook = /*#__PURE__*/ makeUseThemeEffect(useTheme);
