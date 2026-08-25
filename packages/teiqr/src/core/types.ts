/**
 * Core data types for QR symbol encoding.
 *
 * Everything downstream — renderers, validators, exporters — is written
 * against {@link QrMatrix}. Nothing else in the library reaches back into the
 * encoder, so the symbol can be produced once and reused across any number of
 * outputs.
 */

/** Error correction level, weakest to strongest. */
export type EccLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * Encoding modes.
 *
 * Two of these are headers rather than character encodings, and neither
 * carries a character-count field: `eci` (0b0111) declares the charset of
 * everything that follows, and `structured` (0b0011) marks a symbol's position
 * within a Structured Append set.
 */
export type QrMode = 'numeric' | 'alphanumeric' | 'byte' | 'kanji' | 'eci' | 'structured';

/**
 * Structural role of every module in the grid.
 *
 * This is the piece no other JavaScript QR library exposes, and three features
 * depend on it: renderers style finder patterns independently of the body,
 * the validator works out which modules a logo may safely cover, and the
 * verifier knows which cells carry data. A plain bitmap cannot answer any of
 * those questions.
 */
export const MODULE = {
  DATA: 0,
  FINDER: 1,
  SEPARATOR: 2,
  ALIGNMENT: 3,
  TIMING: 4,
  FORMAT: 5,
  VERSION: 6,
  DARK: 7,
} as const;

export type ModuleKind = (typeof MODULE)[keyof typeof MODULE];

/** A fully-placed QR symbol. */
export interface QrMatrix {
  /**
   * Modules along the longer side, excluding the quiet zone.
   *
   * For square symbologies — QR and Micro QR — this is both dimensions, and
   * `width`/`height` are absent. rMQR is rectangular, so it sets all three.
   */
  readonly size: number;
  /** Modules across. Absent for square symbols, where `size` is both. */
  readonly width?: number;
  /** Modules down. Absent for square symbols, where `size` is both. */
  readonly height?: number;
  /**
   * Symbol version: 1-40 for QR, 1-4 meaning M1-M4 for `'micro'`, or 1-32
   * indexing {@link RMQR_VERSIONS} for `'rmqr'`.
   */
  readonly version: number;
  /**
   * Which symbology this is. Absent means a full QR symbol, so code written
   * before Micro QR and rMQR existed keeps working unchanged.
   */
  readonly variant?: 'qr' | 'micro' | 'rmqr';
  /** The level actually used, which may exceed the requested one when `boostEcc` is on. */
  readonly ecc: EccLevel;
  /** Mask pattern applied, 0-7. */
  readonly mask: number;
  /** Row-major `size * size`; 1 is dark. Index as `y * size + x`. */
  readonly modules: Uint8Array;
  /** Row-major `size * size` of {@link ModuleKind}, parallel to `modules`. */
  readonly kinds: Uint8Array;
}

/**
 * One run of characters in a single mode, with its payload bits already
 * packed. Bits exclude the mode indicator and character-count header, which
 * the writer emits because their width depends on the symbol version.
 */
export interface QrSegment {
  readonly mode: QrMode;
  /** Character count as this mode's own count field measures it. Always 0 for header modes. */
  readonly charCount: number;
  /** Payload bits, most significant first. */
  readonly bits: BitArray;
}

/** A packed, immutable run of bits. */
export interface BitArray {
  /** Number of significant bits. */
  readonly length: number;
  /** Packed bytes, MSB-first; the final byte may be partially used. */
  readonly bytes: Uint8Array;
}

/** Anything that can be turned into a symbol. */
export type QrInput = string | Uint8Array | readonly QrSegment[];

export interface EncodeOptions {
  /**
   * Minimum error correction level. Defaults to `'M'`, the level most scanners
   * are tuned against.
   */
  ecc?: EccLevel;
  /** Lower bound on version. The encoder still grows past it to fit the data. */
  minVersion?: number;
  /** Upper bound on version. Exceeding it throws {@link QrCapacityError}. */
  maxVersion?: number;
  /** Pin a mask (0-7) instead of choosing by penalty score. */
  mask?: number;
  /**
   * Raise the level to the strongest that still fits the chosen version. The
   * symbol is the same size either way, so the extra redundancy is free and
   * this defaults to `true`.
   */
  boostEcc?: boolean;
  /**
   * Extended Channel Interpretation assignment to declare before the data —
   * for example 26 for UTF-8. Most scanners assume ISO-8859-1 or guess UTF-8,
   * so this is only worth setting when a specific reader requires it.
   */
  eci?: number;
  /**
   * Allow Kanji mode when it would produce a smaller symbol. Requires a
   * registered Shift-JIS table (`import 'teiqr/kanji'`); without one this is
   * ignored, because the table is 13 kB and most users never encode Japanese.
   */
  kanji?: boolean;
}

/** Thrown when the data cannot fit the allowed version range. */
export class QrCapacityError extends Error {
  /** Bits the data needs. */
  readonly needed: number;
  /** Bits available at the largest permitted version and level. */
  readonly available: number;
  readonly maxVersion: number;

  constructor(needed: number, available: number, maxVersion: number) {
    super(
      `Data does not fit: needs ${needed} bits, but version ${maxVersion} holds ${available}. ` +
        'Shorten the data, raise maxVersion, or lower the error correction level.',
    );
    this.name = 'QrCapacityError';
    this.needed = needed;
    this.available = available;
    this.maxVersion = maxVersion;
  }
}
