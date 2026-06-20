'use client';

import type { ReactNode } from 'react';
import { useTheme } from '../hooks/use-theme';
import { resolveThemedValue } from './resolve-themed';

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
 * Reads the theme store's server snapshot, so when the provider is **seeded
 * with `initialTheme`** (e.g. from a server cookie) the server render and the
 * client hydration render both pick the correct variant — no mounted-flag
 * delay, no hydration warning.
 *
 * ⚠️ Without `initialTheme` (or with an unresolved `system` value) the server
 * renders the resolved `defaultTheme` while the client resolves the real
 * stored/OS value; when they differ React logs a hydration mismatch. This
 * component renders a fragment, so add `suppressHydrationWarning` to a
 * wrapping element you control in that case.
 */
export function ThemedIcon<T extends string = string>({
  variants,
  fallback = null,
}: ThemedIconProps<T>): React.JSX.Element {
  const { resolvedTheme, theme } = useTheme<T>();
  const node = resolveThemedValue(variants, resolvedTheme, theme, fallback);
  return <>{node ?? null}</>;
}
