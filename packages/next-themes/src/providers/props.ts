import type { ReactNode } from 'react';
import type { Attribute, CookieOptions, StorageMode, TransitionConfig } from '../core/types';

export interface ThemeProviderProps {
  children?: ReactNode;

  /** Available themes. Default: `['light', 'dark']`. */
  themes?: string[];
  /** Default theme used when nothing is stored. Default: `'system'`. */
  defaultTheme?: string;
  /** If set, theme is locked to this value and cannot be changed. */
  forcedTheme?: string;
  /** Enable automatic 'system' theme detection via `prefers-color-scheme`. Default: `true`. */
  enableSystem?: boolean;
  /** Always track the OS preference, ignoring stored values. */
  followSystem?: boolean;

  /** Attribute(s) used to apply the theme. Default: `'data-theme'`. */
  attribute?: Attribute | Attribute[];
  /** Optional map of logical theme name → attribute value (e.g. `{ dark: 'theme-dark' }`). */
  value?: Record<string, string>;
  /** Selector for the element that receives the attribute. Default: `'html'`. */
  target?: string;

  /** Storage backend. Default: `'hybrid'` (cookie + localStorage). */
  storage?: StorageMode;
  /** Key name for local/session storage and fallback cookie name. Default: `'theme'`. */
  storageKey?: string;
  /** Overrides for the cookie channel. */
  cookieOptions?: CookieOptions;

  /** Disable CSS transitions during theme change. Pass `true` or custom CSS. */
  disableTransitionOnChange?: boolean | string;
  /** If true, `disableTransitionOnChange` is a no-op when user prefers reduced motion. Default: `true`. */
  respectReducedMotion?: boolean;

  /** Sync `colorScheme` CSS on the target element. Default: `true`. */
  enableColorScheme?: boolean;
  /** Sync a `<meta name="theme-color">` tag. Can be a fixed color or a map by theme. */
  themeColor?: string | Record<string, string>;

  /** Initial theme seeded by the server (e.g. from a cookie or user profile). */
  initialTheme?: string;

  /** CSP nonce for the inline script. */
  nonce?: string;

  /**
   * Skip injecting the inline anti-FOUC script. Use this when you have
   * already rendered the script in `<head>` via `getThemeScript()` from
   * `@teispace/next-themes/server` — that placement runs strictly before
   * the body's first paint and is the most flicker-resistant option.
   */
  noScript?: boolean;

  /**
   * Animate theme changes with the View Transitions API. Pass `true` for the
   * default fade, `'circular'` for a cursor-origin circular reveal, or a
   * config object for fine-grained control. Gracefully no-ops in browsers
   * that do not support View Transitions.
   */
  transition?: TransitionConfig;

  /** Fired when the theme changes, with both the selected value and the resolved value. */
  onChange?: (theme: string, resolvedTheme: string) => void;
}
