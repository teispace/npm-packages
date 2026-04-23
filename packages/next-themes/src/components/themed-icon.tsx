import { type ReactNode, useEffect, useState } from 'react';
import { useTheme } from '../hooks/use-theme';

export interface ThemedIconProps<T extends string = string> {
  /** Map of theme → React node. Keys may include any theme plus `'system'`. */
  variants: Partial<Record<T | 'system', ReactNode>>;
  /** Rendered on the server and before hydration. */
  fallback?: ReactNode;
}

/**
 * Render different content per theme. Useful for SVG icons, logos, or any
 * JSX that should switch on theme. Same SSR-safety pattern as `ThemedImage`.
 */
export function ThemedIcon<T extends string = string>({
  variants,
  fallback = null,
}: ThemedIconProps<T>): React.JSX.Element {
  const { resolvedTheme, theme } = useTheme<T>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const node = mounted
    ? (variants[resolvedTheme as T] ?? variants[theme as T | 'system'] ?? fallback)
    : fallback;
  return <>{node ?? null}</>;
}
