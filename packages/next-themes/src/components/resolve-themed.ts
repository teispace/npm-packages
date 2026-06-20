/**
 * Shared theme-keyed lookup for the themed components (`ThemedImage`,
 * `ThemedIcon`). Both pick a value by the active resolved theme, falling back to
 * the raw selection (which may be `'system'`), then a caller-supplied fallback,
 * then the first declared entry. Extracted so the resolution order lives in one
 * place rather than being copy-pasted per component.
 *
 * @param map        theme key → value (keys may include any theme or `'system'`)
 * @param resolvedTheme the concrete resolved theme (e.g. `'light'`/`'dark'`)
 * @param theme      the raw selection (may be `'system'`)
 * @param fallback   value used when no theme key matches
 */
export function resolveThemedValue<V>(
  map: Partial<Record<string, V>>,
  resolvedTheme: string | undefined,
  theme: string | undefined,
  fallback?: V,
): V | undefined {
  return (
    (resolvedTheme != null ? map[resolvedTheme] : undefined) ??
    (theme != null ? map[theme] : undefined) ??
    fallback ??
    Object.values(map)[0]
  );
}
