/**
 * Top-level symbol encoding: data in, {@link QrMatrix} out.
 */

import { BitWriter } from './bits.js';
import { computeDivisor, computeRemainder } from './galois.js';
import { buildMatrix } from './matrix.js';
import {
  buildSegments,
  countBits,
  makeByteSegment,
  makeEciSegment,
  planBits,
  planSegments,
  qrModel,
  totalBits,
  writeSegments,
} from './segment.js';
import {
  type EccLevel,
  type EncodeOptions,
  QrCapacityError,
  type QrInput,
  type QrMatrix,
  type QrSegment,
} from './types.js';
import {
  capacityBits,
  ECC_ORDER,
  eccCodewordsPerBlock,
  MAX_VERSION,
  MIN_VERSION,
  numDataCodewords,
  numEccBlocks,
  numRawDataModules,
} from './version.js';

/** §7.4.10 padding, applied alternately once the terminator and byte padding are done. */
const PAD_BYTES = [0xec, 0x11] as const;

/**
 * Version bands share a character-count field width, so segmentation can only
 * change at these boundaries. Planning once per band instead of once per
 * version turns the search from 40 dynamic programs into at most 3.
 */
const BAND_REPRESENTATIVES = [1, 10, 27] as const;
const bandOf = (version: number): 0 | 1 | 2 => (version <= 9 ? 0 : version <= 26 ? 1 : 2);

export interface BlockLayout {
  readonly numBlocks: number;
  readonly eccPerBlock: number;
  /** Errors Reed-Solomon can correct in one block when their positions are unknown. */
  readonly correctablePerBlock: number;
  readonly totalCodewords: number;
  /** For each position in the interleaved stream, which block it belongs to. */
  readonly ownerOfCodeword: Int32Array;
}

/**
 * How the interleaved codeword stream maps back onto Reed-Solomon blocks.
 *
 * Error correction is per block, not global: eight damaged codewords spread
 * one per block are harmless, whereas eight in a single block can exceed that
 * block's budget and lose the symbol. Attributing damage correctly needs this
 * mapping, so the loop below mirrors {@link addEccAndInterleave} exactly.
 */
export const blockLayout = (version: number, ecc: EccLevel): BlockLayout => {
  const numBlocks = numEccBlocks(version, ecc);
  const eccPerBlock = eccCodewordsPerBlock(version, ecc);
  const totalCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (totalCodewords % numBlocks);
  const shortBlockLen = Math.floor(totalCodewords / numBlocks);

  const owner = new Int32Array(totalCodewords);
  let pos = 0;
  for (let i = 0; i < shortBlockLen + 1; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i === shortBlockLen - eccPerBlock && j < numShortBlocks) continue;
      if (pos < totalCodewords) owner[pos++] = j;
    }
  }

  return {
    numBlocks,
    eccPerBlock,
    // Reed-Solomon corrects half as many errors as it has check symbols when
    // the error positions are unknown, which is the case for a logo or a smudge.
    correctablePerBlock: Math.floor(eccPerBlock / 2),
    totalCodewords,
    ownerOfCodeword: owner,
  };
};

/** Serialize segments into the version's full data codeword block. */
const buildDataCodewords = (
  segments: readonly QrSegment[],
  version: number,
  ecc: EccLevel,
): Uint8Array => {
  const capacity = capacityBits(version, ecc);
  const w = new BitWriter(capacity >>> 3);

  writeSegments(w, segments, qrModel(version));

  if (w.length > capacity) {
    throw new QrCapacityError(w.length, capacity, version);
  }

  // Terminator: up to four zero bits, truncated when the tail is nearly full.
  w.pushBits(0, Math.min(4, capacity - w.length));
  w.padToByte();

  const bytes = new Uint8Array(capacity >>> 3);
  w.copyInto(bytes);

  // Alternating pad codewords fill whatever remains.
  for (let i = w.length >>> 3, p = 0; i < bytes.length; i++, p++) {
    bytes[i] = PAD_BYTES[p % 2];
  }

  return bytes;
};

/**
 * Split data into blocks, append Reed-Solomon codewords to each, then
 * interleave.
 *
 * Interleaving is what makes a symbol survive a localised smudge: damage that
 * would wipe one block contiguously instead lands one codeword deep across
 * every block.
 */
const addEccAndInterleave = (data: Uint8Array, version: number, ecc: EccLevel): Uint8Array => {
  const numBlocks = numEccBlocks(version, ecc);
  const blockEccLen = eccCodewordsPerBlock(version, ecc);
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const divisor = computeDivisor(blockEccLen);
  const blocks: Uint8Array[] = [];
  const scratch = new Uint8Array(blockEccLen);

  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.subarray(k, k + dataLen);
    k += dataLen;

    const eccBytes = computeRemainder(dat, divisor, scratch);
    // Short blocks get a placeholder byte so every block has the same length
    // and the interleave loop stays a simple column walk. It is skipped on output.
    const block = new Uint8Array(shortBlockLen + 1);
    block.set(dat, 0);
    block.set(eccBytes, dataLen + (i < numShortBlocks ? 1 : 0));
    blocks.push(block);
  }

  const result = new Uint8Array(rawCodewords);
  let pos = 0;
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      // Skip the padding slot that only short blocks carry.
      if (i === shortBlockLen - blockEccLen && j < numShortBlocks) continue;
      result[pos++] = blocks[j][i];
    }
  }

  return result;
};

/** Bit cost of the ECI header, or 0 when none is requested. */
const eciSegments = (eci: number | undefined): QrSegment[] =>
  eci === undefined ? [] : [makeEciSegment(eci)];

interface Resolved {
  version: number;
  segments: QrSegment[];
}

/**
 * Find the smallest version that fits, along with the segments to write into
 * it.
 *
 * Pre-built segments are measured directly. Text is planned per band, so a
 * string is segmented at most three times regardless of how many versions are
 * searched.
 */
const resolve = (
  input: QrInput,
  ecc: EccLevel,
  minVersion: number,
  maxVersion: number,
  eci: number | undefined,
  allowKanji: boolean,
): Resolved => {
  const prefix = eciSegments(eci);
  const prefixBits = (version: number): number => totalBits(prefix, version);

  // Explicit segments, or raw bytes: nothing to optimise, just measure.
  if (typeof input !== 'string') {
    const segments = input instanceof Uint8Array ? [makeByteSegment(input)] : [...input];
    const all = [...prefix, ...segments];
    for (let v = minVersion; v <= maxVersion; v++) {
      if (totalBits(all, v) <= capacityBits(v, ecc)) return { version: v, segments: all };
    }
    throw new QrCapacityError(
      totalBits(all, maxVersion),
      capacityBits(maxVersion, ecc),
      maxVersion,
    );
  }

  // Text: plan once per band, then scan the versions inside it.
  const plans = BAND_REPRESENTATIVES.map((v) => planSegments(input, v, allowKanji));
  for (let v = minVersion; v <= maxVersion; v++) {
    const plan = plans[bandOf(v)];
    if (planBits(plan, v) + prefixBits(v) <= capacityBits(v, ecc)) {
      return { version: v, segments: [...prefix, ...buildSegments(plan)] };
    }
  }

  const worst = plans[bandOf(maxVersion)];
  throw new QrCapacityError(
    planBits(worst, maxVersion) + prefixBits(maxVersion),
    capacityBits(maxVersion, ecc),
    maxVersion,
  );
};

/**
 * Encode data into a QR symbol.
 *
 * Accepts a string (segmented optimally across numeric, alphanumeric, byte and
 * — when a table is registered — Kanji modes), a `Uint8Array` for arbitrary
 * binary, or hand-built segments for full control.
 *
 * @example encode('https://example.com')
 * @example encode(new Uint8Array([0xde, 0xad, 0xbe, 0xef]), { ecc: 'H' })
 * @example encode('hello', { eci: ECI.UTF8, minVersion: 4 })
 */
export const encode = (input: QrInput, options: EncodeOptions = {}): QrMatrix => {
  const {
    ecc = 'M',
    minVersion = MIN_VERSION,
    maxVersion = MAX_VERSION,
    mask,
    boostEcc = true,
    eci,
    kanji = false,
  } = options;

  if (
    !Number.isInteger(minVersion) ||
    !Number.isInteger(maxVersion) ||
    minVersion < MIN_VERSION ||
    maxVersion > MAX_VERSION ||
    minVersion > maxVersion
  ) {
    throw new RangeError(
      `Invalid version range: ${minVersion}..${maxVersion} (must be ${MIN_VERSION}..${MAX_VERSION})`,
    );
  }
  if (mask !== undefined && (!Number.isInteger(mask) || mask < 0 || mask > 7)) {
    throw new RangeError(`Invalid mask: ${mask} (must be an integer 0-7)`);
  }

  const { version, segments } = resolve(input, ecc, minVersion, maxVersion, eci, kanji);

  // The chosen version usually has slack left over. Spending it on stronger
  // error correction is free: same module count, more damage tolerance.
  let level = ecc;
  if (boostEcc) {
    const bits = totalBits(segments, version);
    for (const candidate of ECC_ORDER) {
      if (
        ECC_ORDER.indexOf(candidate) > ECC_ORDER.indexOf(level) &&
        bits <= capacityBits(version, candidate)
      ) {
        level = candidate;
      }
    }
  }

  const data = buildDataCodewords(segments, version, level);
  const codewords = addEccAndInterleave(data, version, level);

  return buildMatrix(version, level, codewords, mask);
};

/**
 * Largest payload that fits a given version and level, in bytes, assuming
 * pure byte mode. Useful for sizing a payload before building it.
 */
export const byteCapacity = (version: number, ecc: EccLevel): number => {
  const available = numDataCodewords(version, ecc) * 8 - 4 - countBits('byte', version);
  return Math.max(0, available >>> 3);
};
