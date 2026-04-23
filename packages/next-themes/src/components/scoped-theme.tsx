import { type ElementType, type ReactNode, useMemo } from 'react';
import type { ThemeStore } from '../core/store';
import type { Attribute, Listener, ThemeState } from '../core/types';
import { ThemeStoreContext } from '../hooks/use-theme';

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
export function ScopedTheme<T extends string = string>({
  theme,
  children,
  as: Component = 'div',
  attribute = 'class',
  value,
  className,
  style,
  ...rest
}: ScopedThemeProps<T> & Record<string, unknown>): React.JSX.Element {
  const store = useMemo<ThemeStore>(() => makeScopedStore(theme), [theme]);
  const applied = value?.[theme] ?? theme;
  const attrs = Array.isArray(attribute) ? attribute : [attribute];

  const scopedProps: Record<string, unknown> = { style, ...rest };
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
    <ThemeStoreContext.Provider value={store}>
      <Component {...scopedProps}>{children}</Component>
    </ThemeStoreContext.Provider>
  );
}

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
  };
}
