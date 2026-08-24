/**
 * rMQR geometry and capacity tables (ISO/IEC 23941).
 *
 * Rectangular Micro QR is a 2022 symbology for surfaces that are long and thin
 * — test tubes, cable wraps, PCB edges — where neither a square QR symbol nor
 * a Micro QR symbol fits. It defines 32 fixed sizes from 7x43 up to 17x139.
 *
 * These are spec values, listed rather than derived because rMQR's block
 * structure has no closed form: the same symbol can split into blocks of two
 * different lengths, and the split differs per error correction level.
 *
 * Verified module-for-module against `rmqrcode`, an independent MIT-licensed
 * implementation of the same standard.
 */

/** One Reed-Solomon block group: `num` blocks of `c` total codewords, `k` of them data. */
export interface RmqrBlockGroup {
  readonly num: number;
  readonly c: number;
  readonly k: number;
}

export interface RmqrVersionSpec {
  /** 0-31, encoded into the format information. */
  readonly indicator: number;
  readonly height: number;
  readonly width: number;
  /** Modules left over after the codewords, filled with zeros. */
  readonly remainder: number;
  /** Character-count field width per mode. */
  readonly countBits: Readonly<Record<'numeric' | 'alphanumeric' | 'byte' | 'kanji', number>>;
  readonly codewordsTotal: number;
  /** Block structure per level. rMQR offers only M and H. */
  readonly blocks: Readonly<Record<'M' | 'H', readonly RmqrBlockGroup[]>>;
  /** Usable data bits per level. */
  readonly dataBits: Readonly<Record<'M' | 'H', number>>;
}

/** Every rMQR size, smallest first. */
export type RmqrVersion =
  | 'R7x43'
  | 'R7x59'
  | 'R7x77'
  | 'R7x99'
  | 'R7x139'
  | 'R9x43'
  | 'R9x59'
  | 'R9x77'
  | 'R9x99'
  | 'R9x139'
  | 'R11x27'
  | 'R11x43'
  | 'R11x59'
  | 'R11x77'
  | 'R11x99'
  | 'R11x139'
  | 'R13x27'
  | 'R13x43'
  | 'R13x59'
  | 'R13x77'
  | 'R13x99'
  | 'R13x139'
  | 'R15x43'
  | 'R15x59'
  | 'R15x77'
  | 'R15x99'
  | 'R15x139'
  | 'R17x43'
  | 'R17x59'
  | 'R17x77'
  | 'R17x99'
  | 'R17x139';

export const RMQR_VERSIONS: readonly RmqrVersion[] = [
  'R7x43',
  'R7x59',
  'R7x77',
  'R7x99',
  'R7x139',
  'R9x43',
  'R9x59',
  'R9x77',
  'R9x99',
  'R9x139',
  'R11x27',
  'R11x43',
  'R11x59',
  'R11x77',
  'R11x99',
  'R11x139',
  'R13x27',
  'R13x43',
  'R13x59',
  'R13x77',
  'R13x99',
  'R13x139',
  'R15x43',
  'R15x59',
  'R15x77',
  'R15x99',
  'R15x139',
  'R17x43',
  'R17x59',
  'R17x77',
  'R17x99',
  'R17x139',
] as const;

/** Only M and H; rMQR has no L or Q. */
export const RMQR_LEVELS = ['M', 'H'] as const;
export type RmqrLevel = (typeof RMQR_LEVELS)[number];

/**
 * One correction to the reference data this was checked against.
 *
 * `rmqrcode` lists R17x43-M as a single block of 60 codewords, but the same
 * version's total is 61 and its H blocks sum to exactly 61. Every other one of
 * the 32 versions has blocks summing to its own total, and the module count
 * settles it: R17x43 has 61*8 + 1 remainder = 489 data modules, so M must
 * carry 61 codewords or nine modules would be left unfilled where the standard
 * allows one. The value here is 61, giving 22 error correction codewords.
 *
 * R17x43-M is therefore excluded from the conformance fixtures — our output is
 * deliberately not the reference's there.
 */
// biome-ignore format: one row per version keeps this table readable against the standard
export const RMQR_SPECS: Readonly<Record<RmqrVersion, RmqrVersionSpec>> = {
  'R7x43': { indicator: 0, height: 7, width: 43, remainder: 0,
    countBits: { numeric: 4, alphanumeric: 3, byte: 3, kanji: 2 },
    codewordsTotal: 13,
    blocks: { M: [{ num: 1, c: 13, k: 6 }], H: [{ num: 1, c: 13, k: 3 }] },
    dataBits: { M: 48, H: 24 } },
  'R7x59': { indicator: 1, height: 7, width: 59, remainder: 3,
    countBits: { numeric: 5, alphanumeric: 5, byte: 4, kanji: 3 },
    codewordsTotal: 21,
    blocks: { M: [{ num: 1, c: 21, k: 12 }], H: [{ num: 1, c: 21, k: 7 }] },
    dataBits: { M: 96, H: 56 } },
  'R7x77': { indicator: 2, height: 7, width: 77, remainder: 5,
    countBits: { numeric: 6, alphanumeric: 5, byte: 5, kanji: 4 },
    codewordsTotal: 32,
    blocks: { M: [{ num: 1, c: 32, k: 20 }], H: [{ num: 1, c: 32, k: 10 }] },
    dataBits: { M: 160, H: 80 } },
  'R7x99': { indicator: 3, height: 7, width: 99, remainder: 6,
    countBits: { numeric: 7, alphanumeric: 6, byte: 5, kanji: 5 },
    codewordsTotal: 44,
    blocks: { M: [{ num: 1, c: 44, k: 28 }], H: [{ num: 1, c: 44, k: 14 }] },
    dataBits: { M: 224, H: 112 } },
  'R7x139': { indicator: 4, height: 7, width: 139, remainder: 1,
    countBits: { numeric: 7, alphanumeric: 6, byte: 6, kanji: 5 },
    codewordsTotal: 68,
    blocks: { M: [{ num: 1, c: 68, k: 44 }], H: [{ num: 2, c: 34, k: 12 }] },
    dataBits: { M: 352, H: 192 } },
  'R9x43': { indicator: 5, height: 9, width: 43, remainder: 2,
    countBits: { numeric: 5, alphanumeric: 5, byte: 4, kanji: 3 },
    codewordsTotal: 21,
    blocks: { M: [{ num: 1, c: 21, k: 12 }], H: [{ num: 1, c: 21, k: 7 }] },
    dataBits: { M: 96, H: 56 } },
  'R9x59': { indicator: 6, height: 9, width: 59, remainder: 3,
    countBits: { numeric: 6, alphanumeric: 5, byte: 5, kanji: 4 },
    codewordsTotal: 33,
    blocks: { M: [{ num: 1, c: 33, k: 21 }], H: [{ num: 1, c: 33, k: 11 }] },
    dataBits: { M: 168, H: 88 } },
  'R9x77': { indicator: 7, height: 9, width: 77, remainder: 1,
    countBits: { numeric: 7, alphanumeric: 6, byte: 5, kanji: 5 },
    codewordsTotal: 49,
    blocks: { M: [{ num: 1, c: 49, k: 31 }], H: [{ num: 1, c: 24, k: 8 }, { num: 1, c: 25, k: 9 }] },
    dataBits: { M: 248, H: 136 } },
  'R9x99': { indicator: 8, height: 9, width: 99, remainder: 4,
    countBits: { numeric: 7, alphanumeric: 6, byte: 6, kanji: 5 },
    codewordsTotal: 66,
    blocks: { M: [{ num: 1, c: 66, k: 42 }], H: [{ num: 2, c: 33, k: 11 }] },
    dataBits: { M: 336, H: 176 } },
  'R9x139': { indicator: 9, height: 9, width: 139, remainder: 5,
    countBits: { numeric: 8, alphanumeric: 7, byte: 6, kanji: 6 },
    codewordsTotal: 99,
    blocks: { M: [{ num: 1, c: 49, k: 31 }, { num: 1, c: 50, k: 32 }], H: [{ num: 3, c: 33, k: 11 }] },
    dataBits: { M: 504, H: 264 } },
  'R11x27': { indicator: 10, height: 11, width: 27, remainder: 2,
    countBits: { numeric: 4, alphanumeric: 4, byte: 3, kanji: 2 },
    codewordsTotal: 15,
    blocks: { M: [{ num: 1, c: 15, k: 7 }], H: [{ num: 1, c: 15, k: 5 }] },
    dataBits: { M: 56, H: 40 } },
  'R11x43': { indicator: 11, height: 11, width: 43, remainder: 1,
    countBits: { numeric: 6, alphanumeric: 5, byte: 5, kanji: 4 },
    codewordsTotal: 31,
    blocks: { M: [{ num: 1, c: 31, k: 19 }], H: [{ num: 1, c: 31, k: 11 }] },
    dataBits: { M: 152, H: 88 } },
  'R11x59': { indicator: 12, height: 11, width: 59, remainder: 0,
    countBits: { numeric: 7, alphanumeric: 6, byte: 5, kanji: 5 },
    codewordsTotal: 47,
    blocks: { M: [{ num: 1, c: 47, k: 31 }], H: [{ num: 1, c: 23, k: 7 }, { num: 1, c: 24, k: 8 }] },
    dataBits: { M: 248, H: 120 } },
  'R11x77': { indicator: 13, height: 11, width: 77, remainder: 2,
    countBits: { numeric: 7, alphanumeric: 6, byte: 6, kanji: 5 },
    codewordsTotal: 67,
    blocks: { M: [{ num: 1, c: 67, k: 43 }], H: [{ num: 1, c: 33, k: 11 }, { num: 1, c: 34, k: 12 }] },
    dataBits: { M: 344, H: 184 } },
  'R11x99': { indicator: 14, height: 11, width: 99, remainder: 7,
    countBits: { numeric: 8, alphanumeric: 7, byte: 6, kanji: 6 },
    codewordsTotal: 89,
    blocks: { M: [{ num: 1, c: 44, k: 28 }, { num: 1, c: 45, k: 29 }], H: [{ num: 1, c: 44, k: 14 }, { num: 1, c: 45, k: 15 }] },
    dataBits: { M: 456, H: 232 } },
  'R11x139': { indicator: 15, height: 11, width: 139, remainder: 6,
    countBits: { numeric: 8, alphanumeric: 7, byte: 7, kanji: 6 },
    codewordsTotal: 132,
    blocks: { M: [{ num: 2, c: 66, k: 42 }], H: [{ num: 3, c: 44, k: 14 }] },
    dataBits: { M: 672, H: 336 } },
  'R13x27': { indicator: 16, height: 13, width: 27, remainder: 4,
    countBits: { numeric: 5, alphanumeric: 5, byte: 4, kanji: 3 },
    codewordsTotal: 21,
    blocks: { M: [{ num: 1, c: 21, k: 14 }], H: [{ num: 1, c: 21, k: 7 }] },
    dataBits: { M: 96, H: 56 } },
  'R13x43': { indicator: 17, height: 13, width: 43, remainder: 1,
    countBits: { numeric: 6, alphanumeric: 6, byte: 5, kanji: 5 },
    codewordsTotal: 41,
    blocks: { M: [{ num: 1, c: 41, k: 27 }], H: [{ num: 1, c: 41, k: 13 }] },
    dataBits: { M: 216, H: 104 } },
  'R13x59': { indicator: 18, height: 13, width: 59, remainder: 6,
    countBits: { numeric: 7, alphanumeric: 6, byte: 6, kanji: 5 },
    codewordsTotal: 60,
    blocks: { M: [{ num: 1, c: 60, k: 38 }], H: [{ num: 2, c: 30, k: 10 }] },
    dataBits: { M: 304, H: 160 } },
  'R13x77': { indicator: 19, height: 13, width: 77, remainder: 4,
    countBits: { numeric: 7, alphanumeric: 7, byte: 6, kanji: 6 },
    codewordsTotal: 85,
    blocks: { M: [{ num: 1, c: 42, k: 26 }, { num: 1, c: 43, k: 27 }], H: [{ num: 1, c: 42, k: 14 }, { num: 1, c: 43, k: 15 }] },
    dataBits: { M: 424, H: 232 } },
  'R13x99': { indicator: 20, height: 13, width: 99, remainder: 3,
    countBits: { numeric: 8, alphanumeric: 7, byte: 7, kanji: 6 },
    codewordsTotal: 113,
    blocks: { M: [{ num: 1, c: 56, k: 36 }, { num: 1, c: 57, k: 37 }], H: [{ num: 1, c: 37, k: 11 }, { num: 2, c: 38, k: 12 }] },
    dataBits: { M: 584, H: 280 } },
  'R13x139': { indicator: 21, height: 13, width: 139, remainder: 0,
    countBits: { numeric: 8, alphanumeric: 8, byte: 7, kanji: 7 },
    codewordsTotal: 166,
    blocks: { M: [{ num: 2, c: 55, k: 35 }, { num: 1, c: 56, k: 36 }], H: [{ num: 2, c: 41, k: 13 }, { num: 2, c: 42, k: 14 }] },
    dataBits: { M: 848, H: 432 } },
  'R15x43': { indicator: 22, height: 15, width: 43, remainder: 1,
    countBits: { numeric: 7, alphanumeric: 6, byte: 6, kanji: 5 },
    codewordsTotal: 51,
    blocks: { M: [{ num: 1, c: 51, k: 33 }], H: [{ num: 1, c: 25, k: 7 }, { num: 1, c: 26, k: 8 }] },
    dataBits: { M: 264, H: 120 } },
  'R15x59': { indicator: 23, height: 15, width: 59, remainder: 4,
    countBits: { numeric: 7, alphanumeric: 7, byte: 6, kanji: 5 },
    codewordsTotal: 74,
    blocks: { M: [{ num: 1, c: 74, k: 48 }], H: [{ num: 2, c: 37, k: 13 }] },
    dataBits: { M: 384, H: 208 } },
  'R15x77': { indicator: 24, height: 15, width: 77, remainder: 6,
    countBits: { numeric: 8, alphanumeric: 7, byte: 7, kanji: 6 },
    codewordsTotal: 103,
    blocks: { M: [{ num: 1, c: 51, k: 33 }, { num: 1, c: 52, k: 34 }], H: [{ num: 2, c: 34, k: 10 }, { num: 1, c: 35, k: 11 }] },
    dataBits: { M: 536, H: 248 } },
  'R15x99': { indicator: 25, height: 15, width: 99, remainder: 7,
    countBits: { numeric: 8, alphanumeric: 7, byte: 7, kanji: 6 },
    codewordsTotal: 136,
    blocks: { M: [{ num: 2, c: 68, k: 44 }], H: [{ num: 4, c: 34, k: 12 }] },
    dataBits: { M: 704, H: 384 } },
  'R15x139': { indicator: 26, height: 15, width: 139, remainder: 2,
    countBits: { numeric: 9, alphanumeric: 8, byte: 7, kanji: 7 },
    codewordsTotal: 199,
    blocks: { M: [{ num: 2, c: 66, k: 42 }, { num: 1, c: 67, k: 43 }], H: [{ num: 1, c: 39, k: 13 }, { num: 4, c: 40, k: 14 }] },
    dataBits: { M: 1016, H: 552 } },
  'R17x43': { indicator: 27, height: 17, width: 43, remainder: 1,
    countBits: { numeric: 7, alphanumeric: 6, byte: 6, kanji: 5 },
    codewordsTotal: 61,
    // c corrected from 60 to 61; see the note above RMQR_SPECS.
    blocks: { M: [{ num: 1, c: 61, k: 39 }], H: [{ num: 1, c: 30, k: 10 }, { num: 1, c: 31, k: 11 }] },
    dataBits: { M: 312, H: 168 } },
  'R17x59': { indicator: 28, height: 17, width: 59, remainder: 2,
    countBits: { numeric: 8, alphanumeric: 7, byte: 6, kanji: 6 },
    codewordsTotal: 88,
    blocks: { M: [{ num: 2, c: 44, k: 28 }], H: [{ num: 2, c: 44, k: 14 }] },
    dataBits: { M: 448, H: 224 } },
  'R17x77': { indicator: 29, height: 17, width: 77, remainder: 0,
    countBits: { numeric: 8, alphanumeric: 7, byte: 7, kanji: 6 },
    codewordsTotal: 122,
    blocks: { M: [{ num: 2, c: 61, k: 39 }], H: [{ num: 1, c: 40, k: 12 }, { num: 2, c: 41, k: 13 }] },
    dataBits: { M: 624, H: 304 } },
  'R17x99': { indicator: 30, height: 17, width: 99, remainder: 3,
    countBits: { numeric: 8, alphanumeric: 8, byte: 7, kanji: 6 },
    codewordsTotal: 160,
    blocks: { M: [{ num: 2, c: 53, k: 33 }, { num: 1, c: 54, k: 34 }], H: [{ num: 4, c: 40, k: 14 }] },
    dataBits: { M: 800, H: 448 } },
  'R17x139': { indicator: 31, height: 17, width: 139, remainder: 4,
    countBits: { numeric: 9, alphanumeric: 8, byte: 8, kanji: 7 },
    codewordsTotal: 232,
    blocks: { M: [{ num: 4, c: 58, k: 38 }], H: [{ num: 2, c: 38, k: 12 }, { num: 4, c: 39, k: 13 }] },
    dataBits: { M: 1216, H: 608 } },
};

/**
 * Alignment pattern centre columns, keyed by symbol width.
 *
 * rMQR places 3x3 alignment patterns on both the top and bottom edges at each
 * of these columns, and runs a vertical timing pattern down every one of them.
 */
export const RMQR_ALIGNMENT_COLUMNS: Readonly<Record<number, readonly number[]>> = {
  27: [],
  43: [21],
  59: [19, 39],
  77: [25, 51],
  99: [23, 49, 75],
  139: [27, 55, 83, 111],
};
