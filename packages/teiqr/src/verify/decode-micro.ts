/**
 * Read a Micro QR symbol back into its payload.
 *
 * Structurally the mirror of `core/micro.ts`, and deliberately built on the
 * same layout builder rather than a second transcription of the geometry: an
 * encoder and decoder that each carry their own copy of the tables will agree
 * with each other long after they have both stopped agreeing with the
 * standard.
 *
 * The one behaviour worth calling out is M1. It carries error *detection*
 * only — two check codewords with no correction capability — so a damaged M1
 * symbol is reported as unreadable rather than repaired. That is the standard's
 * design, not a limitation here.
 */

import {
  MICRO_CODEWORDS,
  MICRO_COUNT_BITS,
  MICRO_LEVELS,
  MICRO_MASK_FUNCTIONS,
  MICRO_MODE_INDICATOR,
  MICRO_SYMBOL_NUMBER,
  MICRO_VERSIONS,
  type MicroMode,
  type MicroVersion,
  microDataBits,
  microDataSequence,
  microFormatBits,
  microLayout,
  microModeBits,
} from '../core/micro.js';
import { ALPHANUMERIC_CHARSET } from '../core/segment.js';
import { type EccLevel, MODULE, type QrMatrix } from '../core/types.js';
import { correct, UncorrectableError } from './reed-solomon.js';

/** Reverse of {@link MICRO_MODE_INDICATOR}. */
const MODE_BY_INDICATOR: Readonly<Record<number, MicroMode>> = {
  0: 'numeric',
  1: 'alphanumeric',
  2: 'byte',
  3: 'kanji',
};

/** Reverse of {@link MICRO_SYMBOL_NUMBER}: symbol number to version and level. */
const BY_SYMBOL_NUMBER: ReadonlyArray<{ version: MicroVersion; ecc: EccLevel }> = (() => {
  const out: { version: MicroVersion; ecc: EccLevel }[] = [];
  for (const version of MICRO_VERSIONS) {
    for (const ecc of MICRO_LEVELS[version]) {
      out[MICRO_SYMBOL_NUMBER[`${version}-${ecc}`]] = { version, ecc };
    }
  }
  return out;
})();

export interface MicroDecodeResult {
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly version: MicroVersion;
  readonly ecc: EccLevel;
  readonly mask: number;
  readonly mode: MicroMode;
  /** Codewords Reed-Solomon repaired. Always 0 for M1, which cannot correct. */
  readonly corrected: number;
}

/**
 * Recover the symbol number and mask from the format information.
 *
 * All 32 valid patterns are compared and the nearest by Hamming distance wins,
 * which tolerates up to three bit errors in the format area itself — the same
 * approach the QR decoder takes, against a different table.
 */
export const readMicroFormat = (
  modules: Uint8Array,
  size: number,
): { symbolNumber: number; mask: number } => {
  let actual = 0;
  // Mirrors the encoder's placement: down column 8, then leftward along row 8.
  for (let i = 0; i <= 7; i++) actual |= modules[(i + 1) * size + 8] << i;
  for (let i = 8; i <= 14; i++) actual |= modules[8 * size + (15 - i)] << i;

  let bestSymbol = 0;
  let bestMask = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let symbol = 0; symbol < 8; symbol++) {
    for (let mask = 0; mask < 4; mask++) {
      const candidate = microFormatBits(symbol, mask);
      let distance = 0;
      for (let bit = 0; bit < 15; bit++) {
        if (((candidate ^ actual) >>> bit) & 1) distance++;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSymbol = symbol;
        bestMask = mask;
      }
    }
  }

  if (bestDistance > 3) {
    throw new UncorrectableError(
      `Micro QR format information is unreadable (${bestDistance} bit errors, 3 is the limit)`,
    );
  }
  return { symbolNumber: bestSymbol, mask: bestMask };
};

/** Read the payload out of the recovered data codewords. */
const readSegment = (
  data: Uint8Array,
  version: MicroVersion,
  capacity: number,
): { text: string; bytes: Uint8Array; mode: MicroMode } => {
  let pos = 0;
  const read = (width: number): number => {
    if (width === 0) return 0;
    if (pos + width > capacity) throw new UncorrectableError('Micro QR bitstream exhausted');
    let value = 0;
    for (let i = 0; i < width; i++) {
      value = (value << 1) | ((data[pos >>> 3] >>> (7 - (pos & 7))) & 1);
      pos++;
    }
    return value;
  };

  const modeBits = microModeBits(version);
  // M1 has a zero-width mode indicator: it is numeric-only by definition.
  const mode = modeBits === 0 ? 'numeric' : MODE_BY_INDICATOR[read(modeBits)];
  if (!mode) throw new UncorrectableError('Unknown Micro QR mode indicator');

  const countBits = MICRO_COUNT_BITS[mode][version];
  if (countBits === undefined) {
    throw new UncorrectableError(`Micro QR ${version} cannot carry ${mode} data`);
  }
  const count = read(countBits);

  const encoder = new TextEncoder();
  if (mode === 'numeric') {
    let text = '';
    let left = count;
    while (left >= 3) {
      text += String(read(10)).padStart(3, '0');
      left -= 3;
    }
    if (left === 2) text += String(read(7)).padStart(2, '0');
    else if (left === 1) text += String(read(4));
    return { text, bytes: encoder.encode(text), mode };
  }

  if (mode === 'alphanumeric') {
    let text = '';
    let left = count;
    while (left >= 2) {
      const pair = read(11);
      text += ALPHANUMERIC_CHARSET[Math.floor(pair / 45)] + ALPHANUMERIC_CHARSET[pair % 45];
      left -= 2;
    }
    if (left === 1) text += ALPHANUMERIC_CHARSET[read(6)];
    return { text, bytes: encoder.encode(text), mode };
  }

  if (mode === 'byte') {
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) bytes[i] = read(8);
    return { text: new TextDecoder('utf-8').decode(bytes), bytes, mode };
  }

  // Kanji: 13 bits per character, rebased into one of two Shift-JIS ranges.
  const bytes: number[] = [];
  for (let i = 0; i < count; i++) {
    const packed = read(13);
    const combined = Math.floor(packed / 0xc0) * 0x100 + (packed % 0xc0);
    const sjis = combined + (combined < 0x1f00 ? 0x8140 : 0xc140);
    bytes.push(sjis >>> 8, sjis & 0xff);
  }
  const raw = Uint8Array.from(bytes);
  let text = '';
  try {
    text = new TextDecoder('shift_jis').decode(raw);
  } catch {
    // Not every runtime ships the Shift-JIS decoder; the bytes are still exact.
  }
  return { text, bytes: raw, mode };
};

/**
 * Decode a Micro QR symbol.
 *
 * @throws {UncorrectableError} when the symbol is too damaged to read. M1
 * cannot be repaired at all, so any damage to one is fatal by design.
 */
export const decodeMicroMatrix = (
  matrix: Pick<QrMatrix, 'size' | 'modules'> & Partial<Pick<QrMatrix, 'version' | 'kinds'>>,
): MicroDecodeResult => {
  const { size, modules } = matrix;

  const versionIndex = MICRO_VERSIONS.findIndex(
    (v) => 9 + 2 * (MICRO_VERSIONS.indexOf(v) + 1) === size,
  );
  if (versionIndex === -1) {
    throw new UncorrectableError(`${size}x${size} is not a Micro QR size (11, 13, 15 or 17)`);
  }
  const version = MICRO_VERSIONS[versionIndex];

  const { symbolNumber, mask } = readMicroFormat(modules, size);
  const declared = BY_SYMBOL_NUMBER[symbolNumber];
  if (!declared) throw new UncorrectableError(`Invalid Micro QR symbol number ${symbolNumber}`);
  if (declared.version !== version) {
    throw new UncorrectableError(
      `Format information says ${declared.version} but the symbol is ${size}x${size}`,
    );
  }
  const ecc = declared.ecc;

  // Rebuild the layout from the version, then undo the mask over data cells.
  const { kinds } = microLayout(version);
  const cleaned = Uint8Array.from(modules);
  const maskFn = MICRO_MASK_FUNCTIONS[mask];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (kinds[i] === MODULE.DATA && maskFn(x, y)) cleaned[i] ^= 1;
    }
  }

  // Read the placed bitstream: the data bits, then the parity bits.
  const order = microDataSequence(size, kinds);
  const capacity = microDataBits(version, ecc);
  const { ecc: eccCount } = MICRO_CODEWORDS[`${version}-${ecc}`];
  const totalBits = capacity + eccCount * 8;
  if (order.length < totalBits) {
    throw new UncorrectableError('Micro QR symbol has too few data modules');
  }

  // Data occupies `capacity` bits, which for M1 and M3 is not a whole number
  // of bytes — the final data codeword is four bits wide.
  const dataBytes = new Uint8Array(Math.ceil(capacity / 8));
  for (let i = 0; i < capacity; i++) {
    if (cleaned[order[i]]) dataBytes[i >>> 3] |= 0x80 >>> (i & 7);
  }
  const parity = new Uint8Array(eccCount);
  for (let i = 0; i < eccCount * 8; i++) {
    const bit = cleaned[order[capacity + i]];
    if (bit) parity[i >>> 3] |= 0x80 >>> (i & 7);
  }

  // Micro QR is always a single Reed-Solomon block.
  const block = new Uint8Array(dataBytes.length + parity.length);
  block.set(dataBytes);
  block.set(parity, dataBytes.length);

  let corrected = 0;
  if (version === 'M1') {
    // Detection only: verify the parity is consistent and refuse to guess.
    const check = Uint8Array.from(block);
    try {
      if (correct(check, eccCount) !== 0) {
        throw new UncorrectableError('M1 carries error detection only and this symbol is damaged');
      }
    } catch (error) {
      throw error instanceof UncorrectableError
        ? error
        : new UncorrectableError('M1 symbol failed its error detection check');
    }
  } else {
    corrected = correct(block, eccCount);
    dataBytes.set(block.subarray(0, dataBytes.length));
  }

  const { text, bytes, mode } = readSegment(dataBytes, version, capacity);
  return { text, bytes, version, ecc, mask, mode, corrected };
};
