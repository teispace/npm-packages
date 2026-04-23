'use client';

import { createThemes } from '@teispace/next-themes';

/**
 * Typed theme API for the `/typed` demo. The `as const` assertion on the
 * `themes` tuple is what gives `useTheme()` its literal union type.
 *
 * The package has no built-in concept of "light and dark" — you can define
 * any number of themes. Here we ship 7 (including `'system'` from the root
 * provider's universe): light, dark, sepia, mint, solarized, dracula, nord.
 */
export const {
  ThemeProvider: TypedThemeProvider,
  useTheme: useTypedTheme,
  useThemeValue: useTypedThemeValue,
  ScopedTheme: TypedScopedTheme,
} = createThemes({
  themes: ['light', 'dark', 'sepia', 'mint', 'solarized', 'dracula', 'nord'] as const,
  defaultTheme: 'light',
  enableSystem: false,
  attribute: 'class',
  storage: 'hybrid',
  storageKey: 'typed-theme',
  disableTransitionOnChange: true,
});
