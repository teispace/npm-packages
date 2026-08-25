/**
 * Read an rMQR symbol back into its payload.
 *
 * Built on the same layout builder the encoder uses, so the two cannot drift
 * apart. rMQR makes decoding simpler than QR in one respect — there is exactly
 * one mask pattern, so there is nothing to identify — and harder in another:
 * the format information is written twice under two *different* XOR masks, and
 * the block structure can mix two block sizes within one symbol.
 */

import {
  RMQR_SPECS,
  RMQR_VERSIONS,
  type RmqrLevel,
  type RmqrMode,
  type RmqrVersion,
  rmqrFormatBits,
  rmqrLayout,
  rmqrMask,
} from '../core/rmqr.js';
import { ALPHANUMERIC_CHARSET } from '../core/segment.js';
import { MODULE, type QrMatrix } from '../core/types.js';
import { correct, UncorrectableError } from './reed-solomon.js';

const MODE_BY_INDICATOR: Readonly<Record<number, RmqrMode>> = {
  1: 'numeric',
  2: 'alphanumeric',
  3: 'byte',
  4: 'kanji',
};

/** Must match the encoder's masks; the two copies are distinguished by them. */
const FORMAT_MASK_FINDER = 0b011111101010110010;
const FORMAT_MASK_SUB_FINDER = 0b100000101001111011;

export interface RmqrDecodeResult {
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly version: RmqrVersion;
  readonly ecc: RmqrLevel;
  readonly mode: RmqrMode;
  /** Codewords Reed-Solomon repaired across all blocks. */
  readonly corrected: number;
}

/**
 * Recover the version indicator and level from the format information.
 *
 * Both copies are read and every valid pattern is compared against each; the
 * single best match across the two wins. Reading both is what makes the
 * symbol survive damage to one end of it, which for a symbol up to 139 modules
 * long is a realistic failure — a scuffed label rarely damages both ends.
 */
export const readRmqrFormat = (
  modules: Uint8Array,
  width: number,
  height: number,
): { indicator: number; ecc: RmqrLevel } => {
  const at = (x: number, y: number): number => modules[y * width + x];

  let finderCopy = 0;
  for (let n = 0; n < 18; n++) {
    finderCopy |= at(8 + Math.floor(n / 5), 1 + (n % 5)) << n;
  }
  finderCopy ^= FORMAT_MASK_FINDER;

  let subCopy = 0;
  const baseY = height - 6;
  const baseX = width - 8;
  for (let n = 0; n < 15; n++) {
    subCopy |= at(baseX + Math.floor(n / 5), baseY + (n % 5)) << n;
  }
  subCopy |= at(width - 5, baseY) << 15;
  subCopy |= at(width - 4, baseY) << 16;
  subCopy |= at(width - 3, baseY) << 17;
  subCopy ^= FORMAT_MASK_SUB_FINDER;

  let best: { indicator: number; ecc: RmqrLevel } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const version of RMQR_VERSIONS) {
    const indicator = RMQR_SPECS[version].indicator;
    for (const ecc of ['M', 'H'] as const) {
      const candidate = rmqrFormatBits(indicator, ecc);
      for (const observed of [finderCopy, subCopy]) {
        let distance = 0;
        for (let bit = 0; bit < 18; bit++) {
          if (((candidate ^ observed) >>> bit) & 1) distance++;
        }
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { indicator, ecc };
        }
      }
    }
  }

  // BCH(18,6) here has a minimum distance of at least 5, so two bit errors are
  // correctable and three would be ambiguous.
  if (!best || bestDistance > 2) {
    throw new UncorrectableError(
      `rMQR format information is unreadable (${bestDistance} bit errors in both copies)`,
    );
  }
  return best;
};

/** Undo the interleave, then repair each block. */
const deinterleaveAndCorrect = (
  stream: Uint8Array,
  version: RmqrVersion,
  ecc: RmqrLevel,
): { data: Uint8Array; corrected: number } => {
  const groups = RMQR_SPECS[version].blocks[ecc];

  const dataLengths: number[] = [];
  const eccLengths: number[] = [];
  for (const group of groups) {
    for (let i = 0; i < group.num; i++) {
      dataLengths.push(group.k);
      eccLengths.push(group.c - group.k);
    }
  }

  const dataBlocks = dataLengths.map((n) => new Uint8Array(n));
  const eccBlocks = eccLengths.map((n) => new Uint8Array(n));

  // Reverse of the encoder's column walk. Blocks that have run out are skipped
  // and the walk continues — using `break` here is the bug that loses the tail
  // of the longer blocks, and it is what the reference implementation does.
  let pos = 0;
  const maxData = Math.max(...dataLengths);
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < dataBlocks.length; b++) {
      if (i < dataLengths[b]) dataBlocks[b][i] = stream[pos++];
    }
  }
  const maxEcc = Math.max(...eccLengths);
  for (let i = 0; i < maxEcc; i++) {
    for (let b = 0; b < eccBlocks.length; b++) {
      if (i < eccLengths[b]) eccBlocks[b][i] = stream[pos++];
    }
  }

  let corrected = 0;
  const data: number[] = [];
  for (let b = 0; b < dataBlocks.length; b++) {
    const block = new Uint8Array(dataLengths[b] + eccLengths[b]);
    block.set(dataBlocks[b]);
    block.set(eccBlocks[b], dataLengths[b]);
    corrected += correct(block, eccLengths[b]);
    for (let i = 0; i < dataLengths[b]; i++) data.push(block[i]);
  }

  return { data: Uint8Array.from(data), corrected };
};

/** Read the payload out of the recovered data codewords. */
const readSegment = (
  data: Uint8Array,
  version: RmqrVersion,
): { text: string; bytes: Uint8Array; mode: RmqrMode } => {
  const capacity = data.length * 8;
  let pos = 0;
  const read = (width: number): number => {
    if (pos + width > capacity) throw new UncorrectableError('rMQR bitstream exhausted');
    let value = 0;
    for (let i = 0; i < width; i++) {
      value = (value << 1) | ((data[pos >>> 3] >>> (7 - (pos & 7))) & 1);
      pos++;
    }
    return value;
  };

  const indicator = read(3);
  const mode = MODE_BY_INDICATOR[indicator];
  if (!mode) throw new UncorrectableError(`Unknown rMQR mode indicator ${indicator}`);

  const count = read(RMQR_SPECS[version].countBits[mode]);
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
 * Decode an rMQR symbol.
 *
 * @throws {UncorrectableError} when the symbol is too damaged to read.
 */
export const decodeRmqrMatrix = (
  matrix: Pick<QrMatrix, 'modules'> & { width?: number; height?: number; size?: number },
): RmqrDecodeResult => {
  const width = matrix.width ?? matrix.size ?? 0;
  const height = matrix.height ?? 0;

  const version = RMQR_VERSIONS.find(
    (v) => RMQR_SPECS[v].width === width && RMQR_SPECS[v].height === height,
  );
  if (!version) {
    throw new UncorrectableError(`${width}x${height} is not an rMQR size`);
  }

  const { ecc } = readRmqrFormat(matrix.modules, width, height);
  const { kinds, order } = rmqrLayout(version);

  // One mask pattern, so there is nothing to select.
  const cleaned = Uint8Array.from(matrix.modules);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (kinds[i] === MODULE.DATA && rmqrMask(x, y)) cleaned[i] ^= 1;
    }
  }

  const spec = RMQR_SPECS[version];
  const stream = new Uint8Array(spec.codewordsTotal);
  for (let i = 0; i < spec.codewordsTotal * 8 && i < order.length; i++) {
    if (cleaned[order[i]]) stream[i >>> 3] |= 0x80 >>> (i & 7);
  }

  const { data, corrected } = deinterleaveAndCorrect(stream, version, ecc);
  const { text, bytes, mode } = readSegment(data, version);
  return { text, bytes, version, ecc, mode, corrected };
};
