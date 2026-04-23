import { type ImgHTMLAttributes, useEffect, useState } from 'react';
import { useTheme } from '../hooks/use-theme';

export interface ThemedImageProps<T extends string = string>
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Map of theme → image src. Keys may include any theme plus `'system'`. */
  sources: Partial<Record<T | 'system', string>>;
  /** Fallback src used on the server and until the client resolves the theme. */
  fallbackSrc?: string;
}

/**
 * An `<img>` that swaps `src` based on the active theme. On the server and
 * for the first client render, `fallbackSrc` (or the first source) is used to
 * avoid hydration mismatches; after mount, the theme-appropriate source is
 * applied.
 *
 * For zero-flash SSR switching use CSS (with `html[data-theme]`-scoped
 * `background-image`) or pass an `initialTheme` to the provider.
 */
export function ThemedImage<T extends string = string>({
  sources,
  fallbackSrc,
  alt,
  ...rest
}: ThemedImageProps<T>): React.JSX.Element | null {
  const { resolvedTheme, theme } = useTheme<T>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  let src: string | undefined;
  if (mounted) {
    src = sources[resolvedTheme as T] ?? sources[theme as T | 'system'] ?? fallbackSrc;
  } else {
    src = fallbackSrc ?? Object.values(sources)[0];
  }
  if (!src) return null;
  // biome-ignore lint/performance/noImgElement: provider-agnostic primitive; users can wrap with next/image if desired
  return <img src={src} alt={alt ?? ''} {...rest} />;
}
