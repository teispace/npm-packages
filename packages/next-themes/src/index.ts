import { makeCreateThemes } from './factory/create-themes';
import { ThemeProvider as NextThemeProvider } from './providers/next';

export type {
  ScopedThemeProps,
  ThemedIconProps,
  ThemedImageProps,
} from './components/index';
export { ScopedTheme, ThemedIcon, ThemedImage } from './components/index';
export type {
  Attribute,
  CookieOptions,
  SetThemeOptions,
  StorageConfig,
  StorageMode,
  ThemeState,
  TransitionConfig,
  TransitionOptions,
  TransitionOrigin,
  TransitionType,
} from './core/types';
export type { CreateThemesConfig, ThemesApi } from './factory/create-themes';
export { useTheme } from './hooks/use-theme';
export { useThemeEffect } from './hooks/use-theme-effect';
export { type ThemeValueMap, useThemeValue } from './hooks/use-theme-value';
export { ThemeProvider } from './providers/next';
export type { ThemeProviderProps } from './providers/props';

/**
 * Create a typed theme API bound to a literal theme tuple. Returns a
 * pre-configured `ThemeProvider` plus typed hooks and components that know
 * your theme names at compile time.
 *
 * @example
 *   export const { ThemeProvider, useTheme, useThemeValue } = createThemes({
 *     themes: ['light', 'dark', 'sepia'] as const,
 *     defaultTheme: 'system',
 *   });
 */
export const createThemes = makeCreateThemes(NextThemeProvider);
