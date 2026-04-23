const HINT_HEADER = 'sec-ch-prefers-color-scheme';

function getHeader(headers: Headers | Record<string, string>, name: string): string | null {
  // Fetch `Headers` — already case-insensitive.
  const maybeGet = (headers as Headers).get;
  if (typeof maybeGet === 'function') {
    return (headers as Headers).get(name);
  }
  // Plain record — do a case-insensitive linear scan so any casing
  // (`sec-ch-prefers-color-scheme`, `Sec-CH-Prefers-Color-Scheme`, etc.) hits.
  const record = headers as Record<string, string>;
  const target = name.toLowerCase();
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === target) {
      const value = record[key];
      return value ?? null;
    }
  }
  return null;
}

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
  const value = getHeader(headers, HINT_HEADER);
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
