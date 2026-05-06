import type { FaviconShape } from './types';

const escapeForXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Build an SVG mask (white shape on transparent) sized to `size` × `size`.
 * Used as a destIn composite over the resized source to clip it to the shape.
 */
export const buildShapeMask = (
  shape: FaviconShape,
  size: number,
  radiusPercent: number,
): string => {
  switch (shape) {
    case 'square':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="white"/></svg>`;
    case 'circle': {
      const r = size / 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`;
    }
    case 'rounded': {
      const r = Math.round((size * radiusPercent) / 100);
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/></svg>`;
    }
    case 'squircle':
      return buildSquircle(size);
  }
};

/**
 * iOS-style squircle (superellipse, n≈4). Approximated with a cubic-bezier path.
 */
const buildSquircle = (size: number): string => {
  const s = size;
  const c = s * 0.225; // bezier control offset for a smooth ~iOS squircle
  const path = [
    `M 0 ${c}`,
    `C 0 0 0 0 ${c} 0`,
    `L ${s - c} 0`,
    `C ${s} 0 ${s} 0 ${s} ${c}`,
    `L ${s} ${s - c}`,
    `C ${s} ${s} ${s} ${s} ${s - c} ${s}`,
    `L ${c} ${s}`,
    `C 0 ${s} 0 ${s} 0 ${s - c}`,
    'Z',
  ].join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><path d="${escapeForXml(path)}" fill="white"/></svg>`;
};

/**
 * Build a flat-color background SVG of the given size.
 */
export const buildBackground = (size: number, color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${escapeForXml(color)}"/></svg>`;
