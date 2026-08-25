/**
 * Boundary checks for numeric options.
 *
 * Every public entry point takes numbers from a caller, and JavaScript will
 * carry `NaN` and `Infinity` through arithmetic without complaint. What comes
 * out the far end is not an error but a *file*: an SVG whose coordinates read
 * `NaN`, a PDF whose `MediaBox` is `[0 0 NaN NaN]` — which Apple's own
 * CoreGraphics refuses to open — or a print report full of non-finite
 * millimetres. All of it produced silently, and all of it useless.
 *
 * This has bitten three separate times: the DEFLATE reader running past its
 * buffer, `logoGeometry` computing `Math.max(0, undefined)`, and the export
 * options here. The pattern is always the same, and it is worth naming: a
 * comparison against `NaN` is false, so guards pass, loops do not run, and the
 * wrong answer arrives wearing the shape of a right one.
 *
 * Zero and negative values are deliberately *not* rejected. They have obvious
 * meanings that the code already clamps sensibly — a `quietZone` of 0 is a
 * code with no margin, which is a real thing to ask for. Only the values that
 * cannot mean anything are refused.
 */

/**
 * Throw unless `value` is a finite number.
 *
 * Returns the value, so it can wrap an expression in place.
 */
export const requireFinite = (value: number, name: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${String(value)}`);
  }
  return value;
};

/**
 * Check several optional numeric fields at once, ignoring the absent ones.
 *
 * `undefined` means "not supplied, use the default" and is always allowed;
 * this is only concerned with values that were supplied and cannot be used.
 */
export const requireFiniteOptions = (
  options: Readonly<Record<string, unknown>>,
  names: readonly string[],
  prefix: string,
): void => {
  for (const name of names) {
    const value = options[name];
    if (value === undefined) continue;
    requireFinite(value as number, `${prefix}.${name}`);
  }
};
