/**
 * Structured Append: one payload spread across up to 16 symbols.
 *
 * A single symbol tops out at 2,953 bytes. Structured Append splits a larger
 * payload across as many as sixteen symbols, each carrying a 20-bit header —
 * its index, the total count, and a parity byte over the *whole* original
 * payload — so a reader can reassemble them in any scan order and refuse a
 * mismatched set.
 *
 * This is part of ISO/IEC 18004 §8, and essentially no JavaScript QR library
 * implements it. Reader support is uneven in the wild (phone cameras often
 * ignore it; dedicated inventory scanners generally honour it), so the docs
 * say plainly where it is and is not appropriate.
 */

import { encode } from './encode.js';
import {
  buildSegments,
  makeByteSegment,
  makeEciSegment,
  planBits,
  planSegments,
} from './segment.js';
import {
  type EccLevel,
  type EncodeOptions,
  QrCapacityError,
  type QrMatrix,
  type QrSegment,
} from './types.js';
import { capacityBits, MAX_VERSION, MIN_VERSION } from './version.js';

/** Mode indicator for a Structured Append header, §8.1. */
const STRUCTURED_APPEND_MODE = 0x3;

/** The spec's hard ceiling: the index and count fields are four bits each. */
export const MAX_SYMBOLS = 16;

/**
 * Parity over the complete payload: XOR of every byte.
 *
 * Computed once over the original data, then repeated identically in every
 * symbol. A reader that has collected a full set checks the parities agree
 * before joining, which catches symbols accidentally mixed between two
 * different Structured Append groups.
 */
export const structuredParity = (data: Uint8Array): number => {
  let parity = 0;
  for (const byte of data) parity ^= byte;
  return parity;
};

/**
 * The 20-bit header segment: 4-bit mode indicator (0b0011), 4-bit index,
 * 4-bit (count - 1), and the 8-bit parity. Like ECI it carries no character
 * count, so the writer emits the indicator and these 16 bits and nothing else.
 */
const structuredHeader = (index: number, total: number, parity: number): QrSegment => {
  const bits = new Uint8Array(2);
  // index (4) | total-1 (4) | parity (8)
  bits[0] = ((index & 0xf) << 4) | ((total - 1) & 0xf);
  bits[1] = parity & 0xff;
  return { mode: 'structured', charCount: 0, bits: { length: 16, bytes: bits } };
};

export interface StructuredOptions extends EncodeOptions {
  /**
   * Symbols to split across. Omit to use the fewest that fit, which is almost
   * always what you want — more symbols means more for the user to scan.
   */
  count?: number;
  /** Cap the version of every symbol, so a set prints at a uniform size. */
  maxVersion?: number;
}

export interface StructuredResult {
  readonly symbols: QrMatrix[];
  /** Parity byte shared by every symbol in the set. */
  readonly parity: number;
  readonly count: number;
}

/**
 * Split `input` across the fewest symbols that fit and encode each one.
 *
 * Splitting happens on the encoded byte stream, so multi-byte characters are
 * never cut in half: the payload is measured in UTF-8 bytes and each chunk is
 * a whole number of them.
 *
 * @example
 * const { symbols } = encodeStructured(longText, { ecc: 'M' });
 * symbols.forEach((s, i) => write(`part-${i + 1}.svg`, renderSvg(s)));
 */
export const encodeStructured = (
  input: string | Uint8Array,
  options: StructuredOptions = {},
): StructuredResult => {
  const {
    count,
    ecc = 'M',
    maxVersion = MAX_VERSION,
    minVersion = MIN_VERSION,
    eci,
    kanji = false,
    ...rest
  } = options;

  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const parity = structuredParity(bytes);

  if (count !== undefined && !(Number.isInteger(count) && count >= 2 && count <= MAX_SYMBOLS)) {
    throw new RangeError(`Structured Append needs 2-${MAX_SYMBOLS} symbols, got ${count}`);
  }

  // A single symbol has no Structured Append header at all, so if the whole
  // payload fits one, say so rather than silently producing a one-symbol set.
  if (count === undefined) {
    try {
      const single = encode(input, { ...rest, ecc, minVersion, maxVersion, eci, kanji });
      return { symbols: [single], parity, count: 1 };
    } catch (error) {
      if (!(error instanceof QrCapacityError)) throw error;
    }
  }

  const total = count ?? findSymbolCount(bytes, ecc, maxVersion, typeof input === 'string');
  const chunkSize = Math.ceil(bytes.length / total);

  const symbols: QrMatrix[] = [];
  for (let i = 0; i < total; i++) {
    const chunk = bytes.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, bytes.length));
    const segments: QrSegment[] = [structuredHeader(i, total, parity)];
    if (eci !== undefined) segments.push(makeEciSegment(eci));

    if (typeof input === 'string') {
      // Re-plan each chunk as text so numeric and alphanumeric runs inside it
      // still get the cheaper modes; fall back to bytes if the chunk split a
      // character (which only a caller-supplied `count` can cause).
      const text = new TextDecoder('utf-8', { fatal: false }).decode(chunk);
      const reencoded = new TextEncoder().encode(text);
      if (reencoded.length === chunk.length) {
        segments.push(...buildSegments(planSegments(text, maxVersion, kanji)));
      } else {
        segments.push(makeByteSegment(chunk));
      }
    } else {
      segments.push(makeByteSegment(chunk));
    }

    symbols.push(encode(segments, { ...rest, ecc, minVersion, maxVersion, eci: undefined, kanji }));
  }

  return { symbols, parity, count: total };
};

/** Smallest symbol count where every chunk fits `maxVersion`. */
const findSymbolCount = (
  bytes: Uint8Array,
  ecc: EccLevel,
  maxVersion: number,
  isText: boolean,
): number => {
  for (let n = 2; n <= MAX_SYMBOLS; n++) {
    const chunkSize = Math.ceil(bytes.length / n);
    // 20 header bits, plus the byte segment's own indicator and count field.
    const headerBits = 4 + 16;
    const chunk = bytes.subarray(0, chunkSize);
    const payloadBits = isText
      ? planBits(planSegments(new TextDecoder().decode(chunk), maxVersion, false), maxVersion)
      : 4 + 16 + chunkSize * 8;
    if (headerBits + payloadBits <= capacityBits(maxVersion, ecc)) return n;
  }
  throw new QrCapacityError(
    bytes.length * 8,
    capacityBits(maxVersion, ecc) * MAX_SYMBOLS,
    maxVersion,
  );
};

/**
 * Read a Structured Append header back out of a decoded symbol's first
 * segment, or `null` when the symbol is standalone.
 */
export const readStructuredHeader = (
  segments: ReadonlyArray<{ mode: string; bits: { length: number; bytes: Uint8Array } }>,
): { index: number; total: number; parity: number } | null => {
  const first = segments[0];
  if (first?.bits.length !== 16) return null;
  return {
    index: first.bits.bytes[0] >>> 4,
    total: (first.bits.bytes[0] & 0xf) + 1,
    parity: first.bits.bytes[1],
  };
};

export { STRUCTURED_APPEND_MODE };
