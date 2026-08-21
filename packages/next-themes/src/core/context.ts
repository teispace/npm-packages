'use client';

import { createContext } from 'react';
import type { ThemeStore } from './store';

/**
 * The React context that carries a {@link ThemeStore} down the tree.
 *
 * `null` means "no provider above me" — `useTheme()` treats that as the inert
 * state rather than throwing, so a component rendered outside a provider (an
 * `error.tsx` above the boundary, a portal, a parallel-route slot) degrades
 * instead of crashing.
 */
export type ThemeContext = ReturnType<typeof createThemeContext>;

/**
 * Mint a fresh, independent theme context.
 *
 * Why this exists: every hook and component used to read one module-level
 * context singleton. That is fine for the common case — one `ThemeProvider` at
 * the root — but it made two independently-created typed theme APIs collide.
 * Calling `createThemes()` twice (say a `createThemes(['light','dark'])` for the
 * app shell and a `createThemes(['a','b','c'])` for an embedded widget) produced
 * two providers writing into, and two hook sets reading from, the *same*
 * context. Whichever provider was nearest in the tree won, silently, for both
 * APIs — so the widget's `useTheme()` could report the shell's themes.
 *
 * Each `createThemes()` call now gets its own context, so the two are properly
 * isolated and can even be nested.
 */
export function createThemeContext() {
  return createContext<ThemeStore | null>(null);
}

/**
 * The context backing the top-level exports (`ThemeProvider`, `useTheme`,
 * `<ThemedImage>`, …). Kept as a module singleton so the overwhelmingly common
 * single-provider setup needs no wiring at all — you import `ThemeProvider` and
 * `useTheme` from different files and they find each other.
 */
export const DefaultThemeContext: ThemeContext = createThemeContext();
