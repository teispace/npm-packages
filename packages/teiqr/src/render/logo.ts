import { MODULE, type QrMatrix } from '../core/types.js';
import type { LogoOptions } from './types.js';

export type LogoGeometry = {
  /** Logo box in module coordinates, excluding padding. */
  x: number;
  y: number;
  size: number;
  /** The cleared box, including padding. */
  clearX: number;
  clearY: number;
  clearSize: number;
  /** Module indices the logo obscures, in matrix coordinates. */
  covered: Set<number>;
  /** Dark modules among the covered set — what actually gets destroyed. */
  coveredDark: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Work out where the logo sits and exactly which modules it obscures.
 *
 * A logo does not "cover a percentage of the code" in any useful sense — what
 * matters is which modules it destroys, because those map onto specific
 * Reed-Solomon codewords. Finder patterns are reported separately: obscuring
 * one is unrecoverable at any error correction level, since the decoder needs
 * them to locate the code in the first place.
 */
export const logoGeometry = (matrix: QrMatrix, logo: LogoOptions): LogoGeometry => {
  const { size } = matrix;
  const ratio = clamp(logo.sizeRatio, 0.05, 0.5);
  const box = size * ratio;
  const padding = Math.max(0, logo.padding);

  // Centre the logo, snapping to the module grid so the cleared area has
  // straight edges rather than clipping modules in half.
  const x = (size - box) / 2;
  const y = (size - box) / 2;
  const clearSize = box + padding * 2;
  const clearX = (size - clearSize) / 2;
  const clearY = (size - clearSize) / 2;

  const from = Math.max(0, Math.floor(clearX));
  const to = Math.min(size - 1, Math.ceil(clearX + clearSize) - 1);

  const covered = new Set<number>();
  let coveredDark = 0;

  for (let my = from; my <= to; my++) {
    for (let mx = from; mx <= to; mx++) {
      // A module counts as obscured once the logo overlaps its centre.
      const cx = mx + 0.5;
      const cy = my + 0.5;
      if (cx < clearX || cx > clearX + clearSize) continue;
      if (cy < clearY || cy > clearY + clearSize) continue;

      if (logo.shape === 'circle') {
        const r = clearSize / 2;
        const dx = cx - (clearX + r);
        const dy = cy - (clearY + r);
        if (dx * dx + dy * dy > r * r) continue;
      }

      const i = my * size + mx;
      covered.add(i);
      if (matrix.modules[i] === 1) coveredDark++;
    }
  }

  return { x, y, size: box, clearX, clearY, clearSize, covered, coveredDark };
};

/** True when the logo overlaps any finder pattern — always fatal. */
export const touchesFinder = (matrix: QrMatrix, covered: Set<number>): boolean => {
  for (const i of covered) {
    if (matrix.kinds[i] === MODULE.FINDER || matrix.kinds[i] === MODULE.SEPARATOR) return true;
  }
  return false;
};
