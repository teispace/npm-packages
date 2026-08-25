import type { Fill } from '../render/types.js';

export type Rgb = { r: number; g: number; b: number };

const HEX = /^#?([0-9a-f]{3,8})$/i;

/** Parse #rgb, #rrggbb, #rgba and #rrggbbaa. Returns null for anything else. */
export const parseColor = (value: string): Rgb | null => {
  const match = value.trim().match(HEX);
  if (!match) return null;
  let hex = match[1];

  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length !== 6) return null;

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
};

/** WCAG relative luminance. */
export const luminance = ({ r, g, b }: Rgb): number => {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG contrast ratio, 1 to 21. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Representative colours of a fill. A gradient is judged by its worst stop,
 * because a scanner thresholds locally: one pale stop can wash out that part of
 * the code even when the average looks fine.
 */
export const fillColors = (fill: Fill): Rgb[] => {
  const raw = fill.kind === 'solid' ? [fill.color] : fill.stops.map((s) => s.color);
  return raw.map(parseColor).filter((c): c is Rgb => c !== null);
};

/** Worst-case contrast between any foreground stop and any background stop. */
export const worstContrast = (foreground: Fill, background: Fill | null): number | null => {
  const fg = fillColors(foreground);
  // A transparent background is composited over something unknown; assume white,
  // which is what almost every surface and viewer supplies.
  const bg = background ? fillColors(background) : [{ r: 255, g: 255, b: 255 }];
  if (fg.length === 0 || bg.length === 0) return null;

  let worst = Number.POSITIVE_INFINITY;
  for (const f of fg) {
    for (const b of bg) worst = Math.min(worst, contrastRatio(f, b));
  }
  return worst;
};

/**
 * True when the code is light-on-dark. Most scanners handle inversion, but a
 * meaningful minority — including several point-of-sale and industrial readers
 * — only look for dark-on-light.
 */
export const isInverted = (foreground: Fill, background: Fill | null): boolean => {
  const fg = fillColors(foreground);
  const bg = background ? fillColors(background) : [{ r: 255, g: 255, b: 255 }];
  if (fg.length === 0 || bg.length === 0) return false;

  const avg = (colors: Rgb[]) => colors.reduce((a, c) => a + luminance(c), 0) / colors.length;
  return avg(fg) > avg(bg);
};
