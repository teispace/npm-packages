/**
 * Read a placed symbol back into the data that produced it.
 *
 * This is the other half of the encoder, and it exists so the library can make
 * a claim no other JavaScript QR package makes: that a styled, logo-bearing
 * symbol *provably* still decodes. The coverage analysis in `validate` predicts
 * survival from the block layout; this proves it by actually recovering the
 * payload through Reed-Solomon correction.
 *
 * It operates on modules, not pixels, so it needs no rasteriser and runs
 * anywhere. The pixel-level path in `verify/index.ts` binarises an image down
 * to a module grid and then calls straight into this.
 */

import { blockLayout } from '../core/encode.js';
import { dataModuleSequence, formatBits, MASK_FUNCTIONS } from '../core/matrix.js';
import { countBits } from '../core/segment.js';
import { type EccLevel, MODULE, type QrMatrix, type QrMode } from '../core/types.js';
import { eccCodewordsPerBlock, numEccBlocks, numRawDataModules } from '../core/version.js';
import { BitReader, type DecodedSegment, joinSegments, readPayload } from './bitstream.js';
import { decodeMicroMatrix } from './decode-micro.js';
import { decodeRmqrMatrix } from './decode-rmqr.js';
import { correct, UncorrectableError } from './reed-solomon.js';

const MODE_BY_INDICATOR: Readonly<Record<number, QrMode>> = {
  1: 'numeric',
  2: 'alphanumeric',
  3: 'structured',
  4: 'byte',
  7: 'eci',
  8: 'kanji',
};

/** Position of a symbol within a Structured Append set. */
export interface StructuredHeader {
  /** Zero-based position in the set. */
  readonly index: number;
  /** How many symbols the set contains, 2-16. */
  readonly total: number;
  /** XOR parity over the whole original payload, identical in every symbol. */
  readonly parity: number;
}

export interface DecodeResult {
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly version: number;
  readonly ecc: EccLevel;
  readonly mask: number;
  readonly segments: DecodedSegment[];
  /** Codewords Reed-Solomon had to repair. Zero means the symbol was pristine. */
  readonly corrected: number;
  /** Active ECI assignment, when the symbol declared one. */
  readonly eci?: number;
  /** Structured Append position, when the symbol is part of a set. */
  readonly structured?: StructuredHeader;
}

/**
 * Recover the error correction level and mask from the symbol's own format
 * information, rather than trusting the fields on {@link QrMatrix}.
 *
 * This matters for verification: when a caller hands us a matrix reconstructed
 * from pixels, its `ecc`/`mask` fields are guesses. Matching the 15-bit
 * pattern against all 32 valid ones and taking the nearest by Hamming distance
 * is what the standard prescribes, and it tolerates up to three bit errors in
 * the format area itself.
 */
export const readFormatInfo = (
  modules: Uint8Array,
  size: number,
): { ecc: EccLevel; mask: number } => {
  let actual = 0;
  // Same walk the encoder uses for the first copy.
  for (let i = 0; i <= 5; i++) actual |= modules[i * size + 8] << i;
  actual |= modules[7 * size + 8] << 6;
  actual |= modules[8 * size + 8] << 7;
  actual |= modules[8 * size + 7] << 8;
  for (let i = 9; i < 15; i++) actual |= modules[8 * size + (14 - i)] << i;

  let bestEcc: EccLevel = 'M';
  let bestMask = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const ecc of ['L', 'M', 'Q', 'H'] as const) {
    for (let mask = 0; mask < 8; mask++) {
      const candidate = formatBits(ecc, mask);
      let distance = 0;
      for (let bit = 0; bit < 15; bit++) {
        if (((candidate ^ actual) >>> bit) & 1) distance++;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        bestEcc = ecc;
        bestMask = mask;
      }
    }
  }

  if (bestDistance > 3) {
    throw new UncorrectableError(
      `Format information is unreadable (${bestDistance} bit errors, 3 is the limit)`,
    );
  }
  return { ecc: bestEcc, mask: bestMask };
};

/** Undo the mask over data modules only, returning a fresh grid. */
const unmask = (modules: Uint8Array, kinds: Uint8Array, size: number, mask: number): Uint8Array => {
  const out = Uint8Array.from(modules);
  const fn = MASK_FUNCTIONS[mask];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (kinds[i] === MODULE.DATA && fn(x, y)) out[i] ^= 1;
    }
  }
  return out;
};

/** Undo interleaving, correct each block, and concatenate the data halves. */
const deinterleaveAndCorrect = (
  stream: Uint8Array,
  version: number,
  ecc: EccLevel,
): { data: Uint8Array; corrected: number } => {
  const layout = blockLayout(version, ecc);
  const numBlocks = numEccBlocks(version, ecc);
  const eccPerBlock = eccCodewordsPerBlock(version, ecc);
  const total = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (total % numBlocks);
  const shortBlockLen = Math.floor(total / numBlocks);

  // Rebuild per-block buffers by reversing the encoder's column walk.
  const blocks: number[][] = Array.from({ length: numBlocks }, () => []);
  let pos = 0;
  for (let i = 0; i < shortBlockLen + 1; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i === shortBlockLen - eccPerBlock && j < numShortBlocks) continue;
      if (pos < total) blocks[j].push(stream[pos++]);
    }
  }

  let corrected = 0;
  const data: number[] = [];
  for (let j = 0; j < numBlocks; j++) {
    const block = Uint8Array.from(blocks[j]);
    corrected += correct(block, eccPerBlock);
    const dataLen = block.length - eccPerBlock;
    for (let i = 0; i < dataLen; i++) data.push(block[i]);
  }

  void layout;
  return { data: Uint8Array.from(data), corrected };
};

/** Parse the codeword stream back into segments. */
const readSegments = (
  data: Uint8Array,
  version: number,
): { segments: DecodedSegment[]; eci?: number; structured?: StructuredHeader } => {
  const reader = new BitReader(data);
  const segments: DecodedSegment[] = [];
  let eci: number | undefined;
  let structured: StructuredHeader | undefined;

  while (reader.remaining >= 4) {
    const indicator = reader.read(4);
    // 0000 is the terminator; so is running out of meaningful bits.
    if (indicator === 0) break;

    const mode = MODE_BY_INDICATOR[indicator];
    if (!mode) throw new UncorrectableError(`Unknown mode indicator: 0b${indicator.toString(2)}`);

    if (mode === 'structured') {
      // Symbol sequence indicator (index, total - 1) then the parity byte.
      const sequence = reader.read(8);
      const parity = reader.read(8);
      structured = { index: sequence >>> 4, total: (sequence & 0xf) + 1, parity };
      continue;
    }

    if (mode === 'eci') {
      // Self-describing width, mirroring `eciDesignator`.
      const first = reader.read(8);
      if ((first & 0x80) === 0) eci = first;
      else if ((first & 0xc0) === 0x80) eci = ((first & 0x3f) << 8) | reader.read(8);
      else eci = ((first & 0x1f) << 16) | reader.read(16);
      continue;
    }

    const count = reader.read(countBits(mode, version));
    segments.push({ mode, ...readPayload(reader, mode, count) });
  }

  return { segments, eci, structured };
};

/**
 * Decode a symbol back to its payload, repairing damage along the way.
 *
 * Pass `trustHeader: false` (the default for reconstructed matrices) to read
 * the error correction level and mask out of the symbol's own format
 * information rather than the object's fields.
 */
export const decodeMatrix = (
  matrix: Pick<QrMatrix, 'size' | 'version' | 'modules' | 'kinds'> &
    Partial<Pick<QrMatrix, 'ecc' | 'mask' | 'variant' | 'width' | 'height'>>,
  options: { trustHeader?: boolean } = {},
): DecodeResult => {
  // Micro QR and rMQR share Reed-Solomon with QR and almost nothing else, so
  // they route to their own readers rather than being special-cased here.
  if (matrix.variant === 'micro') {
    const result = decodeMicroMatrix(matrix);
    return {
      text: result.text,
      bytes: result.bytes,
      version: matrix.version,
      ecc: result.ecc,
      mask: result.mask,
      segments: result.segments,
      corrected: result.corrected,
    };
  }
  if (matrix.variant === 'rmqr') {
    const result = decodeRmqrMatrix(matrix);
    return {
      text: result.text,
      bytes: result.bytes,
      version: matrix.version,
      ecc: result.ecc as EccLevel,
      mask: 0,
      segments: result.segments,
      corrected: result.corrected,
    };
  }

  const { size, version, modules, kinds } = matrix;
  const trust = options.trustHeader ?? (matrix.ecc !== undefined && matrix.mask !== undefined);

  const { ecc, mask } = trust
    ? { ecc: matrix.ecc as EccLevel, mask: matrix.mask as number }
    : readFormatInfo(modules, size);

  const cleaned = unmask(modules, kinds, size, mask);
  const order = dataModuleSequence(size, kinds);

  const total = Math.floor(numRawDataModules(version) / 8);
  const stream = new Uint8Array(total);
  for (let i = 0; i < order.length && i >>> 3 < total; i++) {
    if (cleaned[order[i]]) stream[i >>> 3] |= 0x80 >>> (i & 7);
  }

  const { data, corrected } = deinterleaveAndCorrect(stream, version, ecc);
  const { segments, eci, structured } = readSegments(data, version);
  const { text, bytes } = joinSegments(segments);

  return {
    text,
    bytes,
    version,
    ecc,
    mask,
    segments,
    corrected,
    ...(eci !== undefined ? { eci } : {}),
    ...(structured !== undefined ? { structured } : {}),
  };
};

export { type DecodedSegment, UncorrectableError };
