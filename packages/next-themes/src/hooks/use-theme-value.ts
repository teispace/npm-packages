'use client';

import { useTheme } from './use-theme';

export type ThemeValueMap<T extends string, V> = Partial<Record<T | 'system', V>> & {
  default?: V;
};

/**
 * Map the active theme to a value. Resolved theme is preferred (so `'system'`
 * users see the concrete light/dark value); falls back to the raw selection
 * then to `map.default`.
 *
 * @example
 *   const color = useThemeValue({ light: '#fff', dark: '#000', default: '#fff' });
 */
export function useThemeValue<V, T extends string = string>(
  map: ThemeValueMap<T, V>,
): V | undefined {
  const { theme, resolvedTheme } = useTheme<T>();
  const resolvedKey = resolvedTheme as T;
  const selectedKey = theme as T | 'system';
  const hasOwn = (k: string): boolean => Object.hasOwn(map, k);
  if (hasOwn(resolvedKey)) return map[resolvedKey];
  if (hasOwn(selectedKey)) return map[selectedKey];
  return map.default;
}
