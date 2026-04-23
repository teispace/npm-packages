const HINT_HEADER = 'sec-ch-prefers-color-scheme';

/**
 * Parse the `Sec-CH-Prefers-Color-Scheme` User-Agent Client Hint. When set,
 * this is the browser's current `prefers-color-scheme` value, so the server
 * can render the correct theme for first-time visitors who have no cookie.
 *
 * The hint is opt-in: the server must first respond with the
 * `Accept-CH: Sec-CH-Prefers-Color-Scheme` header on a prior request. Most
 * setups wire this via middleware — see `acceptClientHintsHeader()`.
 */
export function readColorSchemeHint(
  headers: Headers | Record<string, string>,
): 'light' | 'dark' | null {
  const value =
    typeof (headers as Headers).get === 'function'
      ? (headers as Headers).get(HINT_HEADER)
      : ((headers as Record<string, string>)[HINT_HEADER] ??
        (headers as Record<string, string>)[HINT_HEADER.toUpperCase()] ??
        null);
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'dark' || v === 'light') return v;
  return null;
}

/**
 * Returns the value to send as `Accept-CH` to opt into the
 * `prefers-color-scheme` client hint on subsequent requests.
 */
export function acceptClientHintsHeader(): string {
  return 'Sec-CH-Prefers-Color-Scheme';
}
