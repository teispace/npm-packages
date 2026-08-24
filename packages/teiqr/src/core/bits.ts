/**
 * Packed bit I/O.
 *
 * The obvious representation for a bitstream is `number[]`, one element per
 * bit, and it is what most JavaScript QR encoders use. It costs eight bytes
 * per bit: a version-40 symbol carries 23,648 data bits, so the intermediate
 * array alone runs to ~189 kB before a single module is placed. Packing into
 * a `Uint8Array` costs 2,956 bytes for the same symbol and makes the final
 * copy into codewords a memcpy rather than a per-bit loop.
 */

import type { BitArray } from './types.js';

/** Append-only bit writer backed by a growing `Uint8Array`. */
export class BitWriter {
  private buf: Uint8Array;
  private bitLength = 0;

  constructor(initialBytes = 32) {
    this.buf = new Uint8Array(Math.max(1, initialBytes));
  }

  /** Significant bits written so far. */
  get length(): number {
    return this.bitLength;
  }

  private ensure(extraBits: number): void {
    const needed = (this.bitLength + extraBits + 7) >>> 3;
    if (needed <= this.buf.length) return;
    // Double until it fits: amortised O(1) per write, and version-40 symbols
    // reach their final size in a handful of reallocations.
    let size = this.buf.length * 2;
    while (size < needed) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf);
    this.buf = next;
  }

  /** Append one bit. */
  push(bit: number): void {
    this.ensure(1);
    if (bit & 1) this.buf[this.bitLength >>> 3] |= 0x80 >>> (this.bitLength & 7);
    this.bitLength++;
  }

  /**
   * Append the low `width` bits of `value`, most significant first.
   *
   * `width` must be 0-32 and `value` must fit it. Values are masked rather
   * than validated on the hot path; callers derive widths from the spec's own
   * tables, so an overflow is a bug in this library, not in user input.
   */
  pushBits(value: number, width: number): void {
    if (width <= 0) return;
    this.ensure(width);
    for (let i = width - 1; i >= 0; i--) {
      const bit = (value >>> i) & 1;
      if (bit) this.buf[this.bitLength >>> 3] |= 0x80 >>> (this.bitLength & 7);
      this.bitLength++;
    }
  }

  /** Append every bit of a packed run. */
  pushArray(bits: BitArray): void {
    this.ensure(bits.length);
    // Byte-aligned runs are the common case (byte-mode payloads), so copy
    // whole bytes when the destination cursor allows it.
    if ((this.bitLength & 7) === 0) {
      const whole = bits.length >>> 3;
      this.buf.set(bits.bytes.subarray(0, whole), this.bitLength >>> 3);
      this.bitLength += whole * 8;
      for (let i = whole * 8; i < bits.length; i++) {
        this.push((bits.bytes[i >>> 3] >>> (7 - (i & 7))) & 1);
      }
      return;
    }
    for (let i = 0; i < bits.length; i++) {
      this.push((bits.bytes[i >>> 3] >>> (7 - (i & 7))) & 1);
    }
  }

  /** Pad with zero bits until the length is a multiple of eight. */
  padToByte(): void {
    while (this.bitLength & 7) this.push(0);
  }

  /** Snapshot as an immutable {@link BitArray}. Copies, so the writer stays usable. */
  toBitArray(): BitArray {
    return { length: this.bitLength, bytes: this.buf.slice(0, (this.bitLength + 7) >>> 3) };
  }

  /**
   * Copy the written bits into `out`, which must be at least
   * `ceil(length / 8)` bytes. Trailing bytes are left untouched so the caller
   * can pre-fill them with pad codewords.
   */
  copyInto(out: Uint8Array): void {
    out.set(this.buf.subarray(0, (this.bitLength + 7) >>> 3));
  }
}

/** An empty run, shared because it is immutable. */
export const EMPTY_BITS: BitArray = { length: 0, bytes: new Uint8Array(0) };

/** Read one bit from a packed run. */
export const bitAt = (bits: BitArray, index: number): number =>
  (bits.bytes[index >>> 3] >>> (7 - (index & 7))) & 1;
