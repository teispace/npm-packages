'use client';

import type { ImgHTMLAttributes } from 'react';
import { useTheme } from '../hooks/use-theme';

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
 * Reads from the external theme store directly, so when the provider is
 * seeded with `initialTheme` from the server cookie, the very first render
 * (server and client) picks the right `src` — no post-mount swap, no flash.
 * Add `suppressHydrationWarning` if your `initialTheme` is `system` and
 * the resolved value differs between server and client.
 *
 * For zero-flash SSR with system-resolution use CSS (`html[data-theme]`
 * scoped `background-image`) instead.
 */
export function ThemedImage<T extends string = string>({
  sources,
  fallbackSrc,
  alt,
  ...rest
}: ThemedImageProps<T>): React.JSX.Element | null {
  const { resolvedTheme, theme } = useTheme<T>();
  const src =
    sources[resolvedTheme as T] ??
    sources[theme as T | 'system'] ??
    fallbackSrc ??
    Object.values(sources)[0];
  if (!src) return null;
  // biome-ignore lint/performance/noImgElement: provider-agnostic primitive; users can wrap with next/image if desired
  return <img src={src} alt={alt ?? ''} {...rest} />;
}
