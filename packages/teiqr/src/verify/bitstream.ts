/**
 * Reading a codeword stream back into characters.
 *
 * The four character encodings — numeric, alphanumeric, byte and Kanji — are
 * bit-for-bit identical across QR, Micro QR and rMQR. Only the headers around
 * them differ. Keeping one copy here rather than three next to each decoder is
 * not just tidiness: three transcriptions of the same 13-bit Shift-JIS rebase
 * is exactly how a library ends up reading two of the three symbologies it
 * claims to support.
 */

import { ALPHANUMERIC_CHARSET } from '../core/segment.js';
import type { QrMode } from '../core/types.js';
import { UncorrectableError } from './reed-solomon.js';

/**
 * Reader over a packed codeword stream, most significant bit first.
 *
 * `limit` exists for Micro QR M1 and M3, whose final data codeword is four
 * bits wide: the byte array is rounded up, but reading into that trailing
 * nibble would be reading padding as payload.
 */
export class BitReader {
  private pos = 0;
  private readonly limit: number;

  constructor(
    private readonly bytes: Uint8Array,
    limit?: number,
  ) {
    this.limit = limit ?? bytes.length * 8;
  }

  get remaining(): number {
    return this.limit - this.pos;
  }

  read(width: number): number {
    if (width <= 0) return 0;
    if (width > this.remaining) throw new UncorrectableError('Bitstream exhausted');
    let value = 0;
    for (let i = 0; i < width; i++) {
      value = (value << 1) | ((this.bytes[this.pos >>> 3] >>> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return value;
  }
}

/** The four modes that carry characters, as opposed to the ECI and Structured Append headers. */
export type PayloadMode = 'numeric' | 'alphanumeric' | 'byte' | 'kanji';

const utf8 = new TextDecoder('utf-8');

/**
 * Read one segment's payload, given its mode and character count.
 *
 * `bytes` is returned only for the modes that have a meaningful byte
 * representation of their own: raw bytes for byte mode, Shift-JIS for Kanji.
 * Numeric and alphanumeric text is ASCII, so the caller can encode it itself
 * rather than carry a redundant copy.
 */
export const readPayload = (
  reader: BitReader,
  mode: PayloadMode,
  count: number,
): { text: string; bytes?: Uint8Array } => {
  if (mode === 'numeric') {
    // Three digits per 10 bits, then 7 bits for a trailing pair, 4 for a single.
    let text = '';
    let left = count;
    while (left >= 3) {
      text += String(reader.read(10)).padStart(3, '0');
      left -= 3;
    }
    if (left === 2) text += String(reader.read(7)).padStart(2, '0');
    else if (left === 1) text += String(reader.read(4));
    return { text };
  }

  if (mode === 'alphanumeric') {
    let text = '';
    let left = count;
    while (left >= 2) {
      const pair = reader.read(11);
      text += ALPHANUMERIC_CHARSET[Math.floor(pair / 45)] + ALPHANUMERIC_CHARSET[pair % 45];
      left -= 2;
    }
    if (left === 1) text += ALPHANUMERIC_CHARSET[reader.read(6)];
    return { text };
  }

  if (mode === 'byte') {
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) bytes[i] = reader.read(8);
    return { text: utf8.decode(bytes), bytes };
  }

  // Kanji: 13 bits per character, rebased into one of two Shift-JIS ranges.
  const raw = new Uint8Array(count * 2);
  for (let i = 0; i < count; i++) {
    const packed = reader.read(13);
    const combined = Math.floor(packed / 0xc0) * 0x100 + (packed % 0xc0);
    const sjis = combined + (combined < 0x1f00 ? 0x8140 : 0xc140);
    raw[i * 2] = sjis >>> 8;
    raw[i * 2 + 1] = sjis & 0xff;
  }
  let text = '';
  try {
    text = new TextDecoder('shift_jis').decode(raw);
  } catch {
    // Not every runtime ships the Shift-JIS decoder; the bytes are still exact.
  }
  return { text, bytes: raw };
};

/** One run of characters recovered from a symbol. */
export interface DecodedSegment {
  readonly mode: QrMode;
  /** Decoded text. Byte segments are interpreted per the active ECI, UTF-8 by default. */
  readonly text: string;
  /** Raw bytes, for the modes that have a byte representation of their own. */
  readonly bytes?: Uint8Array;
}

const encoder = new TextEncoder();

/**
 * Concatenate decoded segments into the payload as a whole.
 *
 * `bytes` covers every segment, not only the byte-mode ones: a payload
 * segmented as alphanumeric then byte — which optimal segmentation produces
 * routinely — would otherwise report bytes for the second half alone and
 * silently lose the first. Numeric and alphanumeric text is ASCII, so
 * encoding it here is exact.
 */
export const joinSegments = (
  segments: readonly DecodedSegment[],
): { text: string; bytes: Uint8Array } => {
  const parts: Uint8Array[] = [];
  let text = '';
  for (const segment of segments) {
    // ECI and Structured Append are headers about the payload, not part of it.
    if (segment.mode === 'eci' || segment.mode === 'structured') continue;
    text += segment.text;
    parts.push(segment.bytes ?? encoder.encode(segment.text));
  }

  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return { text, bytes };
};
