'use client';

import type { ImgHTMLAttributes } from 'react';
import { useTheme } from '../hooks/use-theme';
import { resolveThemedValue } from './resolve-themed';

export interface ThemedImageProps<T extends string = string>
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Map of theme → image src. Keys may include any theme plus `'system'`. */
  sources: Partial<Record<T | 'system', string>>;
  /** Fallback src used when no source matches the active theme. */
  fallbackSrc?: string;
}

/**
 * An `<img>` that swaps `src` based on the active theme.
 *
 * Reads the theme store's server snapshot, so when the provider is **seeded
 * with `initialTheme`** (e.g. from the server cookie via `getTheme()`), the
 * server render and the client hydration render both pick the seeded `src` —
 * no post-mount swap, no flash, no hydration warning.
 *
 * ⚠️ If you do NOT pass `initialTheme` (or pass a `system`/unresolved value),
 * the server render cannot know the user's theme: it renders the resolved
 * `defaultTheme` (`system` resolves to `light` on the server), while the client
 * resolves the real stored/OS value. When those differ, React logs a hydration
 * mismatch and you should add `suppressHydrationWarning` to this element.
 *
 * For guaranteed zero-flash SSR with `system` resolution, prefer CSS
 * (`html[data-theme]`-scoped `background-image`) over a JS `src` swap.
 */
export function ThemedImage<T extends string = string>({
  sources,
  fallbackSrc,
  alt,
  ...rest
}: ThemedImageProps<T>): React.JSX.Element | null {
  const { resolvedTheme, theme } = useTheme<T>();
  const src = resolveThemedValue(sources, resolvedTheme, theme, fallbackSrc);
  if (!src) return null;
  // biome-ignore lint/performance/noImgElement: provider-agnostic primitive; users can wrap with next/image if desired
  return <img src={src} alt={alt ?? ''} {...rest} />;
}
