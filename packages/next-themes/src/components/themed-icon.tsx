'use client';

import type { ReactNode } from 'react';
import { useTheme } from '../hooks/use-theme';

export interface ThemedIconProps<T extends string = string> {
  /** Map of theme → React node. Keys may include any theme plus `'system'`. */
  variants: Partial<Record<T | 'system', ReactNode>>;
  /** Rendered when no variant matches the active theme. */
  fallback?: ReactNode;
}

/**
 * Render different content per theme. Useful for SVG icons, logos, or any
 * JSX that should switch on theme.
 *
 * Reads the external theme store directly so when `initialTheme` is seeded
 * from a server cookie the very first render picks the correct variant —
 * no mounted-flag delay. Add `suppressHydrationWarning` on the wrapper if
 * the resolved theme could legitimately differ between server and client
 * (`'system'` with no cookie / no `Sec-CH-Prefers-Color-Scheme` hint).
 */
export function ThemedIcon<T extends string = string>({
  variants,
  fallback = null,
}: ThemedIconProps<T>): React.JSX.Element {
  const { resolvedTheme, theme } = useTheme<T>();
  const node = variants[resolvedTheme as T] ?? variants[theme as T | 'system'] ?? fallback;
  return <>{node ?? null}</>;
}
