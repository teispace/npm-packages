'use client';

import { createThemes } from '@teispace/next-themes';

/**
 * Typed theme API for the `/typed` demo. The `as const` assertion on
 * `themes` is what gives `useTheme()` the literal union type.
 */
export const {
  ThemeProvider: TypedThemeProvider,
  useTheme: useTypedTheme,
  useThemeValue: useTypedThemeValue,
  ScopedTheme: TypedScopedTheme,
} = createThemes({
  themes: ['light', 'dark', 'sepia', 'mint'] as const,
  defaultTheme: 'light',
  enableSystem: false,
  attribute: 'class',
  storage: 'hybrid',
  storageKey: 'typed-theme',
});
