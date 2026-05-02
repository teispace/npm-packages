export type Attribute = 'class' | `data-${string}`;

export type StorageMode = 'hybrid' | 'cookie' | 'local' | 'session' | 'none';

export interface CookieOptions {
  name?: string;
  maxAge?: number;
  path?: string;
  domain?: string;
  sameSite?: 'strict' | 'lax' | 'none';
  secure?: boolean;
}

export type StorageConfig =
  | StorageMode
  | {
      mode: StorageMode;
      key?: string;
      cookieOptions?: CookieOptions;
    };

export interface ThemeState {
  /** The selected theme (may be 'system'). */
  theme: string;
  /** The resolved theme after system resolution (always a concrete theme). */
  resolvedTheme: string;
  /** The OS preference, or null if system detection is disabled. */
  systemTheme: 'light' | 'dark' | null;
  /** If set, theme is locked to this value. */
  forcedTheme: string | null;
  /** The list of available themes (excluding 'system'). */
  themes: string[];
}

export type TransitionType = 'fade' | 'circular' | 'none';

export type TransitionOrigin = 'cursor' | 'center' | { x: number; y: number };

export interface TransitionOptions {
  /** Animation style. Default `'fade'`. */
  type?: TransitionType;
  /** Duration in milliseconds. Default `250`. */
  duration?: number;
  /** CSS timing function. Default `'ease'`. */
  easing?: string;
  /**
   * For circular: origin of the reveal. `'cursor'` uses the last
   * pointerdown position; `'center'` uses the viewport center; an explicit
   * `{ x, y }` uses those client coordinates. Default `'cursor'`.
   */
  origin?: TransitionOrigin;
  /**
   * Custom CSS for the `::view-transition-*` pseudo-elements, applied for
   * the duration of the transition. Overrides the built-in `type` CSS.
   */
  css?: string;
}

/** Shorthand aliases accepted on the `transition` prop. */
export type TransitionConfig = boolean | TransitionType | TransitionOptions;

export interface SetThemeOptions {
  /** Override the provider-level transition for this call. */
  transition?: TransitionConfig;
}

/**
 * Accepts either a concrete theme string or an updater function that receives
 * the currently-selected theme and returns the next one. Mirrors React's
 * `Dispatch<SetStateAction<string>>` so code written for upstream `next-themes`
 * (`setTheme(prev => prev === 'dark' ? 'light' : 'dark')`) keeps working.
 */
export type SetThemeAction = string | ((prev: string) => string);

export type ThemeContract = ThemeState & {
  setTheme: (theme: SetThemeAction, options?: SetThemeOptions) => void;
};

export type Listener = (state: ThemeState) => void;
