import type { ComponentType, DependencyList, ImgHTMLAttributes, ReactNode } from 'react';
import { ScopedTheme, type ScopedThemeProps } from '../components/scoped-theme';
import { ThemedIcon } from '../components/themed-icon';
import { ThemedImage } from '../components/themed-image';
import type { SetThemeOptions, ThemeState } from '../core/types';
import { useTheme } from '../hooks/use-theme';
import { useThemeEffect } from '../hooks/use-theme-effect';
import { type ThemeValueMap, useThemeValue } from '../hooks/use-theme-value';
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
    const baseProps: ThemeProviderProps = {
      ...config,
      themes: config.themes as unknown as string[],
      defaultTheme: config.defaultTheme,
    };

    const TypedProvider: ComponentType<
      Partial<Omit<ThemeProviderProps, 'themes'>> & { children?: ReactNode }
    > = (props) => {
      const { children, ...overrides } = props;
      return (
        <BaseProvider {...baseProps} {...overrides}>
          {children}
        </BaseProvider>
      );
    };
    TypedProvider.displayName = 'TypedThemeProvider';

    return {
      ThemeProvider: TypedProvider,
      useTheme: useTheme as ThemesApi<T>['useTheme'],
      useThemeValue: useThemeValue as ThemesApi<T>['useThemeValue'],
      useThemeEffect: useThemeEffect as ThemesApi<T>['useThemeEffect'],
      ThemedImage: ThemedImage as unknown as ThemesApi<T>['ThemedImage'],
      ThemedIcon: ThemedIcon as unknown as ThemesApi<T>['ThemedIcon'],
      ScopedTheme: ScopedTheme as unknown as ThemesApi<T>['ScopedTheme'],
    };
  };
}
