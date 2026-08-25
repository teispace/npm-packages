import { blockLayout } from '../core/encode.js';
import { dataModuleSequence } from '../core/matrix.js';
import { MODULE, type QrMatrix } from '../core/types.js';

export type CoverageReport = {
  /** Modules the logo obscures. */
  coveredModules: number;
  /** Share of the whole code, for display only — not what determines survival. */
  coveredFraction: number;
  /** Codewords with at least one obscured module. */
  damagedCodewords: number;
  /** Worst per-block damage against that block's correction budget. */
  worstBlockDamaged: number;
  worstBlockCapacity: number;
  /** 0 means untouched, 1 means exactly at the limit, above 1 is unrecoverable. */
  utilisation: number;
  /** Whether error correction can still recover the code. */
  recoverable: boolean;
  /** A finder pattern is obscured, which no amount of error correction survives. */
  breaksFinder: boolean;
};

/**
 * Exactly how much damage an obscured region does.
 *
 * The usual advice — "keep the logo under 30% at level H" — is wrong in both
 * directions. Error correction is applied per Reed-Solomon block, not across
 * the code, so damage concentrated in one block can kill a code covering far
 * less than 30%, while damage spread evenly survives more. And a single module
 * of a finder pattern is fatal at any level, because the decoder needs the
 * finders to locate the code before error correction ever runs.
 *
 * This walks the real placement order and the real interleave map, so the
 * answer is exact rather than a rule of thumb.
 */
export const coverageReport = (matrix: QrMatrix, covered: Set<number>): CoverageReport => {
  const total = matrix.size * matrix.size;

  let breaksFinder = false;
  for (const i of covered) {
    const kind = matrix.kinds[i];
    if (kind === MODULE.FINDER || kind === MODULE.SEPARATOR || kind === MODULE.TIMING) {
      breaksFinder = true;
      break;
    }
  }

  const layout = blockLayout(matrix.version, matrix.ecc);
  const sequence = dataModuleSequence(matrix.size, matrix.kinds);

  // Which codeword each obscured data module belongs to.
  const damaged = new Set<number>();
  for (let bit = 0; bit < sequence.length; bit++) {
    if (covered.has(sequence[bit])) {
      const codeword = bit >>> 3;
      if (codeword < layout.totalCodewords) damaged.add(codeword);
    }
  }

  const perBlock = new Int32Array(layout.numBlocks);
  for (const codeword of damaged) perBlock[layout.ownerOfCodeword[codeword]]++;

  let worst = 0;
  for (const count of perBlock) worst = Math.max(worst, count);

  const capacity = layout.correctablePerBlock;
  const utilisation = capacity === 0 ? Number.POSITIVE_INFINITY : worst / capacity;

  return {
    coveredModules: covered.size,
    coveredFraction: covered.size / total,
    damagedCodewords: damaged.size,
    worstBlockDamaged: worst,
    worstBlockCapacity: capacity,
    utilisation,
    recoverable: !breaksFinder && worst <= capacity,
    breaksFinder,
  };
};
