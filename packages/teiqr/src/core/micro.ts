/**
 * Micro QR (ISO/IEC 18004 §7.3.2 and Annex).
 *
 * A separate symbology that shares QR's Reed-Solomon machinery and almost
 * nothing else. Where a version-1 QR symbol is 21 modules across and spends
 * three corners on finder patterns, an M1 symbol is 11 across with a single
 * finder — which makes it roughly a quarter of the area for short payloads.
 * That matters on things a full QR code will not fit: circuit boards,
 * pharmaceutical blisters, cable labels.
 *
 * The differences from QR that this module has to account for:
 *
 * - Four versions, M1 to M4, sized 11, 13, 15 and 17 modules.
 * - One finder pattern, top-left. Timing patterns run the full top row and
 *   left column rather than sitting between separators.
 * - Four mask patterns instead of eight, and they are QR's masks 1, 4, 6 and 7.
 * - Format information uses the same BCH(15,5) code as QR but a different XOR
 *   mask (0x4445), and encodes a combined "symbol number" rather than separate
 *   version and level fields.
 * - Mode indicators are 0 bits wide in M1, 1 in M2, 2 in M3 and 3 in M4, and
 *   character-count fields are narrower than QR's throughout.
 * - Error correction levels are restricted per version: M1 has detection only,
 *   M2 and M3 offer L and M, and only M4 offers Q. There is no H.
 * - The final data codeword of M1 and M3 is four bits, not eight.
 *
 * Correctness here is checked against `segno`, an independent ISO-conformant
 * implementation, module for module across every version, level and mask.
 */

import { BitWriter } from './bits.js';
import { computeDivisor, computeRemainder } from './galois.js';
import {
  ALPHANUMERIC_CHARSET,
  makeAlphanumericSegment,
  makeByteSegment,
  makeNumericSegment,
} from './segment.js';
import { type EccLevel, MODULE, QrCapacityError, type QrMatrix } from './types.js';

/** Micro QR versions, in ascending capacity. */
export type MicroVersion = 'M1' | 'M2' | 'M3' | 'M4';

export const MICRO_VERSIONS: readonly MicroVersion[] = ['M1', 'M2', 'M3', 'M4'] as const;

/**
 * Levels each version permits, §7.3.2.
 *
 * M1 carries error *detection* only — it has check codewords but no capacity
 * to correct with, so a damaged M1 symbol is rejected rather than repaired.
 * `'L'` is used as its nominal level because the API has to name something.
 */
export const MICRO_LEVELS: Readonly<Record<MicroVersion, readonly EccLevel[]>> = {
  M1: ['L'],
  M2: ['L', 'M'],
  M3: ['L', 'M'],
  M4: ['L', 'M', 'Q'],
};

/** Module count per side. */
export const microSize = (version: MicroVersion): number =>
  9 + 2 * (MICRO_VERSIONS.indexOf(version) + 1);

/**
 * Symbol number, §7.9.1 Table 13. This is what the format information encodes,
 * combining version and level into one five-bit field.
 */
export const MICRO_SYMBOL_NUMBER: Readonly<Record<string, number>> = {
  'M1-L': 0,
  'M2-L': 1,
  'M2-M': 2,
  'M3-L': 3,
  'M3-M': 4,
  'M4-L': 5,
  'M4-M': 6,
  'M4-Q': 7,
};

/** Usable data bits per version and level, §7.4.10 Table 7/9. */
const DATA_BITS: Readonly<Record<string, number>> = {
  'M1-L': 20,
  'M2-L': 40,
  'M2-M': 32,
  'M3-L': 84,
  'M3-M': 68,
  'M4-L': 128,
  'M4-M': 112,
  'M4-Q': 80,
};

/** Total and error correction codewords per version and level. */
export const MICRO_CODEWORDS: Readonly<Record<string, { total: number; ecc: number }>> = {
  'M1-L': { total: 5, ecc: 2 },
  'M2-L': { total: 10, ecc: 5 },
  'M2-M': { total: 10, ecc: 6 },
  'M3-L': { total: 17, ecc: 6 },
  'M3-M': { total: 17, ecc: 8 },
  'M4-L': { total: 24, ecc: 8 },
  'M4-M': { total: 24, ecc: 10 },
  'M4-Q': { total: 24, ecc: 14 },
};

/** Width of the mode indicator, §7.4.1: 0 bits in M1, rising to 3 in M4. */
export const microModeBits = (version: MicroVersion): number => MICRO_VERSIONS.indexOf(version);

/** Micro QR mode indicator values. Kanji is 3 but is not encoded here. */
export const MICRO_MODE_INDICATOR = { numeric: 0, alphanumeric: 1, byte: 2, kanji: 3 } as const;

export type MicroMode = keyof typeof MICRO_MODE_INDICATOR;

/**
 * Character-count field widths, §7.4.1 Table 3.
 *
 * A blank entry means the mode is unavailable at that version: M1 is
 * numeric-only, and M2 adds alphanumeric but still cannot carry bytes.
 */
export const MICRO_COUNT_BITS: Readonly<
  Record<MicroMode, Readonly<Record<MicroVersion, number | undefined>>>
> = {
  numeric: { M1: 3, M2: 4, M3: 5, M4: 6 },
  alphanumeric: { M1: undefined, M2: 3, M3: 4, M4: 5 },
  byte: { M1: undefined, M2: undefined, M3: 4, M4: 5 },
  kanji: { M1: undefined, M2: undefined, M3: 3, M4: 4 },
};

/** Terminator length, §7.4.9: 3 bits in M1, 5 in M2, 7 in M3, 9 in M4. */
const terminatorBits = (version: MicroVersion): number => 3 + 2 * MICRO_VERSIONS.indexOf(version);

/**
 * The four Micro QR mask patterns, §7.8.2 Table 10.
 *
 * These are QR's masks 1, 4, 6 and 7 — the standard reuses those four rather
 * than defining new ones, and numbers them 0 to 3.
 */
export const MICRO_MASK_FUNCTIONS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (_x, y) => y % 2 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/**
 * 15-bit format information.
 *
 * Identical BCH(15,5) machinery to QR — same 0x537 generator polynomial — with
 * a different XOR mask. Computed rather than tabulated: all 32 values were
 * checked against an independent implementation's hardcoded table and match
 * exactly, so a 32-entry constant would be redundant surface area.
 */
export const microFormatBits = (symbolNumber: number, mask: number): number => {
  const data = (symbolNumber << 2) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return (((data << 10) | rem) ^ 0x4445) >>> 0;
};

const key = (version: MicroVersion, ecc: EccLevel): string => `${version}-${ecc}`;

/** Usable data bits at a version and level. */
export const microDataBits = (version: MicroVersion, ecc: EccLevel): number => {
  const bits = DATA_BITS[key(version, ecc)];
  if (bits === undefined) {
    throw new RangeError(
      `Micro QR ${version} does not support level ${ecc}. Available: ${MICRO_LEVELS[version].join(', ')}.`,
    );
  }
  return bits;
};

interface Grid {
  size: number;
  modules: Uint8Array;
  kinds: Uint8Array;
}

const set = (g: Grid, x: number, y: number, dark: boolean, kind: number): void => {
  if (x < 0 || y < 0 || x >= g.size || y >= g.size) return;
  g.modules[y * g.size + x] = dark ? 1 : 0;
  g.kinds[y * g.size + x] = kind;
};

/**
 * Draw the function patterns: one finder with its separator, and timing along
 * the top row and left column.
 */
const drawFunctionPatterns = (g: Grid): void => {
  const { size } = g;

  // Finder: 7x7 at the origin, with the separator on its right and bottom.
  for (let dy = 0; dy <= 7; dy++) {
    for (let dx = 0; dx <= 7; dx++) {
      if (dx === 7 || dy === 7) {
        set(g, dx, dy, false, MODULE.SEPARATOR);
        continue;
      }
      const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      set(g, dx, dy, dist !== 2, MODULE.FINDER);
    }
  }

  // Timing runs the full length of the top row and left column, unlike QR
  // where it sits between the separators.
  for (let i = 8; i < size; i++) {
    set(g, i, 0, i % 2 === 0, MODULE.TIMING);
    set(g, 0, i, i % 2 === 0, MODULE.TIMING);
  }
};

/**
 * Place the 15 format bits, §7.9.1.
 *
 * Bits 0-7 run down column 8 from row 1, then bits 8-14 run leftward along
 * row 8 from column 7. There is only one copy — a Micro QR symbol has no room
 * for the redundant second copy a QR symbol carries.
 */
const drawFormat = (g: Grid, symbolNumber: number, mask: number): void => {
  const bits = microFormatBits(symbolNumber, mask);
  const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i <= 7; i++) set(g, 8, i + 1, bit(i), MODULE.FORMAT);
  for (let i = 8; i <= 14; i++) set(g, 15 - i, 8, bit(i), MODULE.FORMAT);
};

/**
 * The order data bits are written: two-module columns walked right to left,
 * alternating upward and downward, skipping function patterns.
 *
 * Simpler than QR's walk because there is no vertical timing column to step
 * over mid-symbol — the timing sits on the outer edges instead.
 */
/**
 * Rebuild a version's function-pattern layout, with no data placed.
 *
 * The decoder needs this: having read a grid of light and dark modules out of
 * an image, it knows nothing about which cells are finder, timing or format
 * patterns, and {@link microDataSequence} cannot run without that. Function
 * patterns depend on nothing but the version, so regenerating them is exact.
 *
 * Sharing one layout builder between the encoder and the decoder is also what
 * stops the two drifting apart — the class of bug that makes an encoder and
 * its own decoder agree with each other and with nothing else.
 */
export const microLayout = (version: MicroVersion): { size: number; kinds: Uint8Array } => {
  const size = microSize(version);
  const g: Grid = {
    size,
    modules: new Uint8Array(size * size),
    kinds: new Uint8Array(size * size),
  };
  drawFunctionPatterns(g);
  // Values are irrelevant here; only the cells the format occupies matter.
  drawFormat(g, 0, 0);
  return { size, kinds: g.kinds };
};

export const microDataSequence = (size: number, kinds: Uint8Array): Int32Array => {
  const order = new Int32Array(size * size);
  let count = 0;

  // Direction alternates by column *pair*, starting upward at the right edge.
  //
  // The QR encoder derives this from the absolute column index with
  // `((right + 1) & 2) === 0`, which is correct there only because QR sizes are
  // always 4v+17. Micro QR sizes are 9+2v, so that same expression starts the
  // rightmost pair going downward and every subsequent bit lands in the wrong
  // cell — producing a symbol that is internally consistent, decodes with our
  // own reader, and is rejected by every conforming scanner.
  let pair = 0;
  for (let right = size - 1; right >= 1; right -= 2, pair++) {
    const upward = pair % 2 === 0;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = upward ? size - 1 - vert : vert;
        const idx = y * size + x;
        if (kinds[idx] === MODULE.DATA) order[count++] = idx;
      }
    }
  }
  return order.subarray(0, count);
};

const applyMask = (g: Grid, mask: number, order: Int32Array): void => {
  const fn = MICRO_MASK_FUNCTIONS[mask];
  for (const idx of order) {
    if (fn(idx % g.size, (idx / g.size) | 0)) g.modules[idx] ^= 1;
  }
};

/**
 * Micro QR mask evaluation, §7.8.3.2.
 *
 * Nothing like QR's four-feature penalty. The score is computed from the dark
 * modules on the right edge and bottom edge, and the *highest* score wins
 * rather than the lowest — a reversal that is easy to miss and produces a
 * valid-looking symbol with the wrong mask.
 */
const evaluateMask = (g: Grid): number => {
  const { size, modules } = g;
  let dark1 = 0;
  let dark2 = 0;

  for (let i = 1; i < size; i++) {
    if (modules[i * size + (size - 1)]) dark1++; // right edge
    if (modules[(size - 1) * size + i]) dark2++; // bottom edge
  }

  return dark1 <= dark2 ? dark1 * 16 + dark2 : dark2 * 16 + dark1;
};

/**
 * Serialise a segment into the data codewords for a version and level.
 *
 * The padding rules diverge from QR in a way that is easy to miss, §7.4.10:
 *
 * - M2 and M4 behave like QR — pad to the codeword boundary with zero bits,
 *   then fill with the alternating pad codewords 0xEC and 0x11.
 * - **M1 and M3 do neither.** Their final data codeword is four bits, so there
 *   is no byte boundary to pad to, and the remainder of the capacity is filled
 *   with plain zero bits rather than pad codewords. The standard spells this
 *   out: "The Pad Codeword used in the final data symbol character position in
 *   Micro QR Code versions M1 and M3 symbols shall be represented as 0000."
 *
 * Getting this wrong is invisible for payloads that happen to fill the symbol
 * exactly — every M1 test here did, which is why the error survived until a
 * short M3 payload exposed it.
 */
const buildDataCodewords = (
  text: string,
  mode: MicroMode,
  version: MicroVersion,
  ecc: EccLevel,
): Uint8Array => {
  const capacity = microDataBits(version, ecc);
  const shortFinalCodeword = version === 'M1' || version === 'M3';

  const w = new BitWriter(Math.ceil(capacity / 8));
  const modeBits = microModeBits(version);
  if (modeBits > 0) w.pushBits(MICRO_MODE_INDICATOR[mode], modeBits);

  const countBits = MICRO_COUNT_BITS[mode][version];
  if (countBits === undefined) {
    throw new RangeError(`Micro QR ${version} cannot encode ${mode} data`);
  }

  const segment =
    mode === 'numeric'
      ? makeNumericSegment(text)
      : mode === 'alphanumeric'
        ? makeAlphanumericSegment(text)
        : makeByteSegment(new TextEncoder().encode(text));

  w.pushBits(segment.charCount, countBits);
  w.pushArray(segment.bits);

  if (w.length > capacity) throw new QrCapacityError(w.length, capacity, 0);

  // Terminator, truncated when the tail is nearly full.
  w.pushBits(0, Math.min(terminatorBits(version), capacity - w.length));

  if (shortFinalCodeword) {
    // Zero-fill the rest of the capacity; no byte alignment, no pad codewords.
    while (w.length < capacity) w.push(0);
  } else {
    w.padToByte();
    for (let i = 0; w.length < capacity; i++) {
      w.pushBits(i % 2 === 0 ? 0xec : 0x11, 8);
    }
  }

  // Pack into whole bytes for Reed-Solomon. For M1 and M3 the trailing four
  // bits land in the high nibble of the final byte, which is exactly how the
  // standard has them participate in the parity calculation.
  const bytes = new Uint8Array(Math.ceil(capacity / 8));
  w.copyInto(bytes);
  return bytes;
};

export interface MicroEncodeOptions {
  /** Minimum error correction level. Defaults to the weakest the version offers. */
  ecc?: EccLevel;
  /** Force a specific version instead of choosing the smallest that fits. */
  version?: MicroVersion;
  /** Pin a mask, 0-3. Micro QR has four mask patterns, not eight. */
  mask?: number;
  /**
   * Raise the level to the strongest that still fits the chosen version, at no
   * size cost — the same free-redundancy trade the QR encoder makes, and on by
   * default for the same reason. Set `false` to get exactly the level asked
   * for, which is what conformance comparisons against another implementation
   * need.
   */
  boostEcc?: boolean;
}

/** Pick the narrowest mode that can represent the text. */
const detectMode = (text: string): MicroMode => {
  if (/^[0-9]*$/.test(text)) return 'numeric';
  if ([...text].every((c) => ALPHANUMERIC_CHARSET.includes(c))) return 'alphanumeric';
  return 'byte';
};

/**
 * Encode a Micro QR symbol.
 *
 * Chooses the smallest version and the strongest level that fit, unless told
 * otherwise. Throws {@link QrCapacityError} when the payload cannot fit even
 * M4 — Micro QR tops out at 35 digits, 21 alphanumeric characters or 15 bytes,
 * so this is a normal outcome rather than an exceptional one, and the message
 * says to use a full QR symbol instead.
 *
 * @example encodeMicro('12345')            // M1
 * @example encodeMicro('HELLO', { ecc: 'M' })
 */
export const encodeMicro = (text: string, options: MicroEncodeOptions = {}): QrMatrix => {
  const { ecc: requested = 'L', version: forced, mask: forcedMask, boostEcc = true } = options;
  const mode = detectMode(text);

  if (
    forcedMask !== undefined &&
    (!Number.isInteger(forcedMask) || forcedMask < 0 || forcedMask > 3)
  ) {
    throw new RangeError(`Micro QR masks are 0-3, got ${forcedMask}`);
  }

  const candidates = forced ? [forced] : MICRO_VERSIONS;
  let chosen: { version: MicroVersion; ecc: EccLevel } | null = null;

  for (const version of candidates) {
    if (MICRO_COUNT_BITS[mode][version] === undefined) continue;
    // Prefer the strongest level this version offers that still fits, so a
    // small payload gets the most protection available at no size cost.
    const available = MICRO_LEVELS[version];
    const atLeastRequested = available.filter(
      (level) => available.indexOf(level) >= available.indexOf(requested),
    );
    if (atLeastRequested.length === 0) continue;

    // Boosting tries the strongest level first and settles for the weakest
    // that fits; without it, only the level actually asked for is considered.
    const order = boostEcc ? [...atLeastRequested].reverse() : [atLeastRequested[0]];

    for (const level of order) {
      try {
        buildDataCodewords(text, mode, version, level);
        chosen = { version, ecc: level };
        break;
      } catch {
        // Does not fit at this level; try a weaker one, then a larger version.
      }
    }
    if (chosen) break;
  }

  if (!chosen) {
    throw new QrCapacityError(text.length * 8, DATA_BITS['M4-L'], 4);
  }

  const { version, ecc } = chosen;
  const size = microSize(version);
  const symbolNumber = MICRO_SYMBOL_NUMBER[key(version, ecc)];

  const data = buildDataCodewords(text, mode, version, ecc);
  const { ecc: eccCount } = MICRO_CODEWORDS[key(version, ecc)];
  // Reed-Solomon operates on whole bytes, so the short final codeword of M1
  // and M3 participates as a byte whose low nibble is zero.
  const parity = computeRemainder(data, computeDivisor(eccCount));

  // The placed bitstream is NOT simply `data` followed by `parity`. In M1 and
  // M3 the final data codeword is four bits wide, so only `capacity` data bits
  // are placed before the error correction bits begin. Writing the full byte
  // shifts every subsequent bit by four and produces a symbol that is wrong
  // from the final data nibble onward — which is exactly what M1 and M3 did
  // before this was accounted for.
  const stream = new BitWriter(Math.ceil((microDataBits(version, ecc) + eccCount * 8) / 8));
  const dataBits = microDataBits(version, ecc);
  for (let i = 0; i < dataBits; i++) {
    stream.push((data[i >>> 3] >>> (7 - (i & 7))) & 1);
  }
  for (const byte of parity) stream.pushBits(byte, 8);
  const placed = stream.toBitArray();

  const g: Grid = {
    size,
    modules: new Uint8Array(size * size),
    kinds: new Uint8Array(size * size),
  };
  drawFunctionPatterns(g);
  drawFormat(g, symbolNumber, 0);

  const order = microDataSequence(size, g.kinds);
  for (let i = 0; i < order.length && i < placed.length; i++) {
    g.modules[order[i]] = (placed.bytes[i >>> 3] >>> (7 - (i & 7))) & 1;
  }

  let mask = forcedMask;
  if (mask === undefined) {
    // Highest score wins here, unlike QR where the lowest penalty wins.
    let best = Number.NEGATIVE_INFINITY;
    for (let m = 0; m < 4; m++) {
      applyMask(g, m, order);
      drawFormat(g, symbolNumber, m);
      const score = evaluateMask(g);
      if (score > best) {
        best = score;
        mask = m;
      }
      applyMask(g, m, order);
    }
  }

  const finalMask = mask ?? 0;
  applyMask(g, finalMask, order);
  drawFormat(g, symbolNumber, finalMask);

  return {
    size,
    // Micro versions are reported as 1-4 alongside `variant: 'micro'`, so the
    // number never collides with a full QR version.
    version: MICRO_VERSIONS.indexOf(version) + 1,
    variant: 'micro',
    ecc,
    mask: finalMask,
    modules: g.modules,
    kinds: g.kinds,
  };
};

/** The Micro QR version label for a matrix produced by {@link encodeMicro}. */
export const microVersionOf = (matrix: Pick<QrMatrix, 'version'>): MicroVersion =>
  MICRO_VERSIONS[matrix.version - 1];
