/**
 * A small, complete DEFLATE compressor (RFC 1951) with a zlib wrapper
 * (RFC 1950).
 *
 * ### Why this exists
 * PNG needs zlib-compressed scanlines. Every other JavaScript QR library gets
 * them by delegating to a canvas (`toDataURL`), which ties PNG output to a
 * browser or to a native `node-canvas` build. That single dependency is why
 * `qrcode` cannot run on Cloudflare Workers and why `qr-code-styling` needs
 * extra setup on the server.
 *
 * `CompressionStream('deflate')` would do the job and exists in Node 18+,
 * browsers, Workers, Deno and Bun — but it is asynchronous, which would force
 * every PNG call to be a Promise. Writing the compressor is ~200 lines and
 * buys a synchronous, dependency-free API that behaves identically everywhere.
 *
 * ### What it implements
 * LZ77 matching over a 32 kB window with a hash chain, emitted with DEFLATE's
 * fixed Huffman tables. Fixed tables rather than dynamic ones is a deliberate
 * trade: dynamic tables would save perhaps another 10% on a QR bitmap, at the
 * cost of the tree-construction and code-length-encoding machinery. QR images
 * are already dominated by long runs of identical pixels, which LZ77 alone
 * handles extremely well.
 */

import { DIST_BASE, DIST_EXTRA, LENGTH_BASE, LENGTH_EXTRA } from './deflate-tables.js';

/** LSB-first bit writer, which is the order DEFLATE packs its bitstream in. */
class BitStream {
  private bytes: Uint8Array;
  private length = 0;
  private bitBuffer = 0;
  private bitCount = 0;

  constructor(capacity: number) {
    this.bytes = new Uint8Array(Math.max(64, capacity));
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
  }

  /** Write `count` bits of `value`, least significant bit first. */
  write(value: number, count: number): void {
    this.bitBuffer |= (value & ((1 << count) - 1)) << this.bitCount;
    this.bitCount += count;
    this.ensure(4);
    while (this.bitCount >= 8) {
      this.bytes[this.length++] = this.bitBuffer & 0xff;
      this.bitBuffer >>>= 8;
      this.bitCount -= 8;
    }
  }

  /**
   * Write a Huffman code. Codes travel most-significant-bit-first even though
   * the surrounding stream is LSB-first — the one genuinely confusing corner
   * of the format, and the usual source of "almost works" implementations.
   */
  writeCode(code: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) this.write((code >>> i) & 1, 1);
  }

  finish(): Uint8Array {
    if (this.bitCount > 0) {
      this.ensure(1);
      this.bytes[this.length++] = this.bitBuffer & 0xff;
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
    return this.bytes.subarray(0, this.length);
  }
}

/** Fixed literal/length code and bit-width, RFC 1951 §3.2.6. */
const fixedLiteral = (symbol: number): { code: number; bits: number } => {
  if (symbol < 144) return { code: 0x30 + symbol, bits: 8 };
  if (symbol < 256) return { code: 0x190 + symbol - 144, bits: 9 };
  if (symbol < 280) return { code: symbol - 256, bits: 7 };
  return { code: 0xc0 + symbol - 280, bits: 8 };
};

const lengthCode = (length: number): number => {
  // Linear scan over 29 entries; matches are short-lived and this never shows
  // up in profiles next to the hash-chain walk.
  for (let i = LENGTH_BASE.length - 1; i >= 0; i--) if (length >= LENGTH_BASE[i]) return i;
  return 0;
};

const distanceCode = (distance: number): number => {
  for (let i = DIST_BASE.length - 1; i >= 0; i--) if (distance >= DIST_BASE[i]) return i;
  return 0;
};

const WINDOW = 32768;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
const HASH_BITS = 15;
const HASH_SIZE = 1 << HASH_BITS;

/** Adler-32 checksum, which the zlib wrapper carries as a trailer. */
export const adler32 = (data: Uint8Array): number => {
  let a = 1;
  let b = 0;
  // 5552 is the largest block that cannot overflow the accumulators before
  // the modulo, so the inner loop stays free of division.
  for (let i = 0; i < data.length; ) {
    const end = Math.min(i + 5552, data.length);
    for (; i < end; i++) {
      a += data[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
};

/**
 * Compress with DEFLATE using fixed Huffman codes.
 *
 * `level` controls how hard the matcher looks: 0 stores literals only, 9 walks
 * the full hash chain. The default of 6 is a good balance for image data.
 */
export const deflateRaw = (data: Uint8Array, level = 6): Uint8Array => {
  const out = new BitStream(Math.max(64, data.length >>> 1));

  // Single final block with fixed Huffman codes: BFINAL=1, BTYPE=01.
  out.write(1, 1);
  out.write(1, 2);

  const maxChain = level <= 0 ? 0 : level >= 9 ? 4096 : level * 32;
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(data.length).fill(-1);

  const hashAt = (i: number): number =>
    ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & (HASH_SIZE - 1);

  const emitLiteral = (byte: number): void => {
    const { code, bits } = fixedLiteral(byte);
    out.writeCode(code, bits);
  };

  let pos = 0;
  while (pos < data.length) {
    let bestLength = 0;
    let bestDistance = 0;

    if (maxChain > 0 && pos + MIN_MATCH <= data.length) {
      const h = hashAt(pos);
      let candidate = head[h];
      let chain = maxChain;
      const limit = Math.max(0, pos - WINDOW);

      while (candidate >= limit && chain-- > 0) {
        // Cheap rejection before the full comparison.
        if (data[candidate + bestLength] === data[pos + bestLength]) {
          let length = 0;
          const max = Math.min(MAX_MATCH, data.length - pos);
          while (length < max && data[candidate + length] === data[pos + length]) length++;
          if (length > bestLength) {
            bestLength = length;
            bestDistance = pos - candidate;
            if (length >= max) break;
          }
        }
        candidate = prev[candidate];
      }
    }

    if (bestLength >= MIN_MATCH) {
      const lc = lengthCode(bestLength);
      const { code, bits } = fixedLiteral(257 + lc);
      out.writeCode(code, bits);
      out.write(bestLength - LENGTH_BASE[lc], LENGTH_EXTRA[lc]);

      const dc = distanceCode(bestDistance);
      // Distance codes use a flat 5-bit fixed encoding.
      out.writeCode(dc, 5);
      out.write(bestDistance - DIST_BASE[dc], DIST_EXTRA[dc]);

      // Register every position the match covers, so later matches can find them.
      for (let i = 0; i < bestLength; i++) {
        if (pos + i + MIN_MATCH <= data.length) {
          const h = hashAt(pos + i);
          prev[pos + i] = head[h];
          head[h] = pos + i;
        }
      }
      pos += bestLength;
    } else {
      if (maxChain > 0 && pos + MIN_MATCH <= data.length) {
        const h = hashAt(pos);
        prev[pos] = head[h];
        head[h] = pos;
      }
      emitLiteral(data[pos]);
      pos++;
    }
  }

  // End-of-block symbol 256.
  const end = fixedLiteral(256);
  out.writeCode(end.code, end.bits);

  return out.finish();
};

/** Wrap a DEFLATE stream in the zlib container PNG's IDAT chunks require. */
export const zlibDeflate = (data: Uint8Array, level = 6): Uint8Array => {
  const body = deflateRaw(data, level);
  const out = new Uint8Array(body.length + 6);
  // CMF: deflate method, 32 kB window. FLG chosen so CMF*256+FLG is a multiple of 31.
  out[0] = 0x78;
  out[1] = 0x9c;
  out.set(body, 2);

  const checksum = adler32(data);
  out[body.length + 2] = (checksum >>> 24) & 0xff;
  out[body.length + 3] = (checksum >>> 16) & 0xff;
  out[body.length + 4] = (checksum >>> 8) & 0xff;
  out[body.length + 5] = checksum & 0xff;
  return out;
};
