import { n } from './shapes.js';
import type { Fill } from './types.js';

/**
 * Stable short hash. Gradient ids must be unique per document — two codes on
 * one page would otherwise share a definition — but they must also be stable
 * across renders, or every keystroke churns the DOM and server and client
 * markup disagree. Hashing the style gives both.
 */
export const hashString = (value: string): string => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

export const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type Paint = {
  /** Value for the `fill` attribute — a colour literal or `url(#id)`. */
  ref: string;
  /** Gradient element markup, or an empty string for a solid fill. */
  def: string;
};

const stopsMarkup = (stops: { offset: number; color: string }[]): string =>
  stops
    .map(
      (s) =>
        `<stop offset="${n(Math.max(0, Math.min(1, s.offset)))}" stop-color="${escapeAttr(s.color)}"/>`,
    )
    .join('');

/**
 * Resolve a fill to an attribute value plus any definition it needs.
 * `key` disambiguates the generated id between the body, frame and ball.
 */
export const resolvePaint = (fill: Fill, key: string): Paint => {
  if (fill.kind === 'solid') {
    return { ref: escapeAttr(fill.color), def: '' };
  }

  const id = `qg-${key}-${hashString(JSON.stringify(fill))}`;

  if (fill.kind === 'linear') {
    // Express the angle as unit-square coordinates so the gradient follows the
    // code's own box rather than the viewport.
    const radians = ((fill.angle % 360) * Math.PI) / 180;
    const dx = Math.cos(radians) / 2;
    const dy = Math.sin(radians) / 2;
    const def =
      `<linearGradient id="${id}" x1="${n(0.5 - dx)}" y1="${n(0.5 - dy)}" ` +
      `x2="${n(0.5 + dx)}" y2="${n(0.5 + dy)}">${stopsMarkup(fill.stops)}</linearGradient>`;
    return { ref: `url(#${id})`, def };
  }

  const def =
    `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.7">` +
    `${stopsMarkup(fill.stops)}</radialGradient>`;
  return { ref: `url(#${id})`, def };
};
