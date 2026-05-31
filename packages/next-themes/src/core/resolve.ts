/**
 * Coerce a raw theme value into something the library's contract guarantees:
 *   • `'system'` only when `enableSystem` is true.
 *   • Otherwise a concrete entry from `themes`.
 *   • Last-resort fallback: the first configured theme, or `'light'`.
 *
 * Callers compute `resolvedTheme` as `theme === 'system' ? systemTheme : theme`,
 * so a `'system'` result here only survives when the system theme can resolve
 * it — guaranteeing `resolvedTheme` is always concrete.
 */
export function normalizeSelection(
  raw: string | null | undefined,
  themes: string[],
  defaultTheme: string,
  enableSystem: boolean,
): string {
  const systemAllowed = enableSystem;
  if (raw === 'system' && systemAllowed) return 'system';
  if (raw && themes.includes(raw)) return raw;
  if (defaultTheme === 'system' && systemAllowed) return 'system';
  if (themes.includes(defaultTheme)) return defaultTheme;
  return themes[0] ?? 'light';
}
