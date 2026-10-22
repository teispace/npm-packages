'use client';

import { type ElementType, type ReactNode, useMemo } from 'react';
import { DefaultThemeContext, type ThemeContext } from '../core/context';
import type { ThemeStore } from '../core/store';
import type { Attribute, Listener, ThemeState } from '../core/types';

export interface ScopedThemeProps<T extends string = string> {
  /** The theme to apply to this sub-tree. */
  theme: T;
  children?: ReactNode;
  /** Element tag to render (defaults to `'div'`). */
  as?: ElementType;
  /** Attribute to apply: class, data-* or array. Default `'class'`. */
  attribute?: Attribute | Attribute[];
  /** Map of logical theme → attribute value. */
  value?: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Set `color-scheme` on the wrapper when the scoped theme is `light` or
   * `dark`, so native controls and scrollbars inside match it. Default: `true`.
   */
  enableColorScheme?: boolean;
}

/**
 * Apply a theme to a sub-tree without affecting the page root. Inside this
 * wrapper, `useTheme()` reports the scoped theme and `setTheme` is a no-op.
 * Useful for previews, modals with reversed color-schemes, or embedded widgets.
 *
 * Unlike the top-level `ThemeProvider`, there is no storage, no script, and
 * no DOM root mutation — only a wrapper element with the appropriate
 * attribute(s) and an overriding React context.
 */
export function makeScopedTheme(Context: ThemeContext) {
  return function ScopedTheme<T extends string = string>({
    theme,
    children,
    as: Component = 'div',
    attribute = 'class',
    value,
    className,
    style,
    enableColorScheme = true,
    ...rest
  }: ScopedThemeProps<T> & Record<string, unknown>): React.JSX.Element {
    const store = useMemo<ThemeStore>(() => makeScopedStore(theme), [theme]);
    const applied = value?.[theme] ?? theme;
    const attrs = Array.isArray(attribute) ? attribute : [attribute];

    const scopedProps: Record<string, unknown> = { style, ...rest };
    // Set `color-scheme` through the CSSOM at commit time rather than the
    // `style` prop: server rendering would turn the prop into a `style="…"`
    // attribute, which a strict `style-src-attr` CSP blocks. Only intrinsic
    // elements are guaranteed to accept a ref, and a caller-supplied
    // `colorScheme` style wins.
    const scheme = enableColorScheme && (theme === 'light' || theme === 'dark') ? theme : null;
    if (scheme && typeof Component === 'string' && !style?.colorScheme) {
      scopedProps.ref = (el: HTMLElement | null) => {
        if (el && el.style.colorScheme !== scheme) el.style.colorScheme = scheme;
      };
    }
    let classNames = className;
    for (const attr of attrs) {
      if (attr === 'class') {
        classNames = classNames ? `${classNames} ${applied}` : applied;
      } else {
        scopedProps[attr] = applied;
      }
    }
    if (classNames) scopedProps.className = classNames;

    return (
      <Context.Provider value={store}>
        <Component {...scopedProps}>{children}</Component>
      </Context.Provider>
    );
  };
}

export const ScopedTheme = /*#__PURE__*/ makeScopedTheme(DefaultThemeContext);

function makeScopedStore(theme: string): ThemeStore {
  const state: ThemeState = {
    theme,
    resolvedTheme: theme,
    systemTheme: null,
    forcedTheme: theme,
    themes: [theme],
  };
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    // Scoped trees are forced to a fixed theme, so the server snapshot is the
    // same immutable state — lets ScopedTheme render correctly under SSR.
    getServerSnapshot: () => state,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    setTheme: () => {
      /* forced; no-op */
    },
    mount: () => {},
    unmount: () => {},
    update: () => {
      /* scoped trees are forced — no runtime updates */
    },
  };
}
