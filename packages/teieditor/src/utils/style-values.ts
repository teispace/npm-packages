/**
 * Checks for CSS values written as inline styles (text colours, fonts,
 * table cell backgrounds), from code or from pasted HTML.
 */

/** The CSS properties a document may carry inline. */
export type SafeStyleProperty = 'font-family' | 'font-size' | 'color' | 'background-color';

const COLOR =
  /^(#[\da-f]{3,8}|(rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\([\d\s.,%/+a-z-]*\)|[a-z]+)$/i;
const LENGTH = /^\d+(\.\d+)?(px|pt|em|rem|%)$/;
const FAMILY = /^[\w\s,'"-]+$/;
/** Values that say "no style" and only add noise (Google Docs writes them on everything). */
const NOISE = new Set(['transparent', 'inherit', 'initial', 'unset', 'currentcolor', 'normal']);

/**
 * Whether a value is safe and meaningful for a property: no `url()`, no
 * `expression()`, no declarations smuggled in after a `;`.
 */
export function isSafeStyleValue(property: SafeStyleProperty, value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 200 || NOISE.has(v.toLowerCase())) return false;
  if (property === 'font-size') return LENGTH.test(v);
  if (property === 'font-family') return FAMILY.test(v);
  // A colour function takes no nested parentheses, so no `url(` or `expression(`.
  return COLOR.test(v);
}
