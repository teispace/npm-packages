import type { ComponentType, DependencyList, ImgHTMLAttributes, ReactNode } from 'react';
import { makeScopedTheme, type ScopedThemeProps } from '../components/scoped-theme';
import { makeThemedIcon } from '../components/themed-icon';
import { makeThemedImage } from '../components/themed-image';
import { createThemeContext } from '../core/context';
import type { SetThemeOptions, ThemeState } from '../core/types';
import { makeUseTheme } from '../hooks/use-theme';
import { makeUseThemeEffect } from '../hooks/use-theme-effect';
import { makeUseThemeValue, type ThemeValueMap } from '../hooks/use-theme-value';
import type { ThemeProviderProps } from '../providers/props';

export interface CreateThemesConfig<T extends readonly string[]>
  extends Omit<ThemeProviderProps, 'children' | 'themes' | 'defaultTheme' | 'forcedTheme'> {
  /** The literal theme tuple (`as const` for inference). */
  themes: T;
  /** Default selected theme; `'system'` stays valid when `enableSystem` is true. */
  defaultTheme?: T[number] | 'system';
}

export interface ThemesApi<T extends readonly string[]> {
  ThemeProvider: ComponentType<
    Partial<Omit<ThemeProviderProps, 'themes'>> & { children?: ReactNode }
  >;
  useTheme: () => Omit<ThemeState, 'theme' | 'resolvedTheme'> & {
    theme: T[number] | 'system';
    resolvedTheme: T[number];
    setTheme: (theme: T[number] | 'system', options?: SetThemeOptions) => void;
  };
  useThemeValue: <V>(map: ThemeValueMap<T[number], V>) => V | undefined;
  useThemeEffect: (
    effect: (theme: T[number] | 'system', resolvedTheme: T[number]) => void | (() => void),
    deps?: DependencyList,
  ) => void;
  ThemedImage: ComponentType<
    Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
      sources: Partial<Record<T[number] | 'system', string>>;
      fallbackSrc?: string;
    }
  >;
  ThemedIcon: ComponentType<{
    variants: Partial<Record<T[number] | 'system', ReactNode>>;
    fallback?: ReactNode;
  }>;
  ScopedTheme: ComponentType<Omit<ScopedThemeProps<T[number]>, 'theme'> & { theme: T[number] }>;
}

/**
 * Internal factory builder. Users call one of the entry-point-specific
 * `createThemes` exports (from `@teispace/next-themes` or
 * `@teispace/next-themes/client`), which thread in the appropriate
 * `BaseProvider`.
 */
export function makeCreateThemes(
  BaseProvider: ComponentType<ThemeProviderProps>,
): <T extends readonly string[]>(config: CreateThemesConfig<T>) => ThemesApi<T> {
  return function createThemes<T extends readonly string[]>(
    config: CreateThemesConfig<T>,
  ): ThemesApi<T> {
    // A private context per factory call. Without this, two createThemes()
    // APIs in one app shared the module-level context: whichever provider was
    // nearest in the tree served BOTH hook sets, so an embedded widget's
    // useTheme() could silently report the app shell's themes.
    const ThemeCtx = createThemeContext();

    const baseProps: ThemeProviderProps = {
      ...config,
      themes: config.themes as unknown as string[],
      defaultTheme: config.defaultTheme,
      themeContext: ThemeCtx,
    };

    const TypedProvider: ComponentType<
      Partial<Omit<ThemeProviderProps, 'themes'>> & { children?: ReactNode }
    > = (props) => {
      const { children, ...overrides } = props;
      return (
        // `themeContext` is applied after the overrides so a caller cannot
        // accidentally detach the typed hooks from their provider.
        <BaseProvider {...baseProps} {...overrides} themeContext={ThemeCtx}>
          {children}
        </BaseProvider>
      );
    };
    TypedProvider.displayName = 'TypedThemeProvider';

    // Every hook and component below is bound to `ThemeCtx`, so this whole API
    // reads from — and only from — the provider returned alongside it.
    const boundUseTheme = makeUseTheme(ThemeCtx);

    return {
      ThemeProvider: TypedProvider,
      useTheme: boundUseTheme as ThemesApi<T>['useTheme'],
      useThemeValue: makeUseThemeValue(boundUseTheme) as ThemesApi<T>['useThemeValue'],
      useThemeEffect: makeUseThemeEffect(boundUseTheme) as ThemesApi<T>['useThemeEffect'],
      ThemedImage: makeThemedImage(boundUseTheme) as unknown as ThemesApi<T>['ThemedImage'],
      ThemedIcon: makeThemedIcon(boundUseTheme) as unknown as ThemesApi<T>['ThemedIcon'],
      ScopedTheme: makeScopedTheme(ThemeCtx) as unknown as ThemesApi<T>['ScopedTheme'],
    };
  };
}
