/**
 * Symbol geometry and capacity tables from ISO/IEC 18004.
 *
 * Two tables are unavoidable — error correction codewords per block and the
 * number of blocks, both of which the spec simply lists. Everything else is
 * derived, because the geometry is regular enough that a closed form is
 * shorter and far less error-prone than forty rows of hand-entered numbers.
 */

import type { EccLevel } from './types.js';

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

/** Weakest to strongest. Index order matters: `boostEcc` walks it upward. */
export const ECC_ORDER: readonly EccLevel[] = ['L', 'M', 'Q', 'H'] as const;

/** Format-info bit pattern per level. Deliberately not the same order as {@link ECC_ORDER}. */
export const ECC_FORMAT_BITS: Readonly<Record<EccLevel, number>> = { L: 1, M: 0, Q: 3, H: 2 };

/** Approximate fraction of codewords each level can recover. Used for logo coverage guidance. */
export const ECC_RECOVERY: Readonly<Record<EccLevel, number>> = {
  L: 0.07,
  M: 0.15,
  Q: 0.25,
  H: 0.3,
};

const ECC_INDEX: Readonly<Record<EccLevel, number>> = { L: 0, M: 1, Q: 2, H: 3 };

// Indexed [eccIndex][version]; slot 0 is unused so the version indexes directly.
// biome-ignore format: one row per ECC level, one column per version — wrapping destroys it
export const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// biome-ignore format: one row per ECC level, one column per version — wrapping destroys it
export const NUM_ECC_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** Module count across one side of the symbol, excluding the quiet zone. */
export const sizeForVersion = (version: number): number => version * 4 + 17;

const assertVersion = (version: number): void => {
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new RangeError(`Version out of range (${MIN_VERSION}-${MAX_VERSION}): ${version}`);
  }
};

/**
 * Total modules available to data and error correction: the full grid minus
 * every function pattern.
 */
export const numRawDataModules = (version: number): number => {
  assertVersion(version);

  let result = (16 * version + 128) * version + 64;

  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    // Versions 7 and up carry two 18-module version-information blocks.
    if (version >= 7) result -= 36;
  }

  return result;
};

export const eccCodewordsPerBlock = (version: number, ecc: EccLevel): number =>
  ECC_CODEWORDS_PER_BLOCK[ECC_INDEX[ecc]][version];

export const numEccBlocks = (version: number, ecc: EccLevel): number =>
  NUM_ECC_BLOCKS[ECC_INDEX[ecc]][version];

/** Codewords left for data once error correction has taken its share. */
export const numDataCodewords = (version: number, ecc: EccLevel): number =>
  Math.floor(numRawDataModules(version) / 8) -
  eccCodewordsPerBlock(version, ecc) * numEccBlocks(version, ecc);

/** Data bits available at this version and level. */
export const capacityBits = (version: number, ecc: EccLevel): number =>
  numDataCodewords(version, ecc) * 8;

/**
 * Centre coordinates of the alignment patterns, always including 6 and
 * `size - 7`. Version 32 is the single case the general step formula gets
 * wrong, so the spec's value is hardcoded.
 */
export const alignmentPatternPositions = (version: number): number[] => {
  assertVersion(version);
  if (version === 1) return [];

  const numAlign = Math.floor(version / 7) + 2;
  const size = sizeForVersion(version);
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;

  const result: number[] = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }

  return result;
};
