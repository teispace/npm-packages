import { makeCreateThemes } from './factory/create-themes';
import { ThemeProvider as ClientThemeProvider } from './providers/client';

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
export { ThemeProvider } from './providers/client';
export type { ThemeProviderProps } from './providers/props';

/** See {@link createThemes} in the default entry. This variant binds the generic React provider (non-Next). */
export const createThemes = makeCreateThemes(ClientThemeProvider);
