import { inflateRawSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { adler32, deflateRaw, zlibDeflate } from '../src/raster/deflate.js';

/** Deterministic pseudo-random bytes, so a failure is reproducible. */
const lcg = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
};

const CASES: Array<[string, Uint8Array]> = [
  ['empty', new Uint8Array(0)],
  ['one byte', Uint8Array.from([42])],
  ['two bytes', Uint8Array.from([0, 255])],
  ['all zeros 10k', new Uint8Array(10_000)],
  ['all 0xff 10k', new Uint8Array(10_000).fill(0xff)],
  ['every byte value', Uint8Array.from({ length: 256 }, (_, i) => i)],
  ['repeating 3-byte run', Uint8Array.from({ length: 9999 }, (_, i) => i % 3)],
  ['long single run', Uint8Array.from({ length: 5000 }, () => 7)],
  ['ascii text', new TextEncoder().encode('the quick brown fox '.repeat(500))],
  [
    'match at exactly the window edge',
    (() => {
      const a = new Uint8Array(32768 + 64);
      for (let i = 0; i < 32; i++) a[i] = i + 1;
      a.set(a.subarray(0, 32), 32768);
      return a;
    })(),
  ],
];

describe('DEFLATE', () => {
  it('produces raw streams Node can inflate, byte for byte', () => {
    for (const [name, input] of CASES) {
      const round = new Uint8Array(inflateRawSync(deflateRaw(input)));
      expect(Array.from(round), `raw: ${name}`).toEqual(Array.from(input));
    }
  });

  it('produces zlib streams Node can inflate, byte for byte', () => {
    for (const [name, input] of CASES) {
      const round = new Uint8Array(inflateSync(zlibDeflate(input)));
      expect(Array.from(round), `zlib: ${name}`).toEqual(Array.from(input));
    }
  });

  it('round trips random data at every compression level', () => {
    const rand = lcg(7);
    const input = Uint8Array.from({ length: 20_000 }, () => Math.floor(rand() * 256));
    for (let level = 0; level <= 9; level++) {
      const round = new Uint8Array(inflateSync(zlibDeflate(input, level)));
      expect(Array.from(round), `level ${level}`).toEqual(Array.from(input));
    }
  });

  it('round trips data with long-range repeats at every level', () => {
    // Highly compressible and window-spanning, which is what PNG scanlines of
    // a QR code actually look like.
    const unit = new TextEncoder().encode('QR module row pattern 0101010101 ');
    const input = new Uint8Array(unit.length * 3000);
    for (let i = 0; i < 3000; i++) input.set(unit, i * unit.length);
    for (let level = 0; level <= 9; level++) {
      expect(new Uint8Array(inflateSync(zlibDeflate(input, level)))).toEqual(input);
    }
  });

  it('actually compresses repetitive data', () => {
    const input = new Uint8Array(50_000).fill(0xab);
    const compressed = zlibDeflate(input);
    // A stored encoding would be ~50 kB; LZ77 should manage two orders better.
    expect(compressed.length).toBeLessThan(input.length / 100);
  });

  it('matches Node for the Adler-32 trailer', () => {
    for (const [name, input] of CASES) {
      const ours = adler32(input);
      // Node writes the same checksum into the last four bytes of its own output.
      const nodeStream = new Uint8Array(require('node:zlib').deflateSync(input));
      const theirs =
        (nodeStream[nodeStream.length - 4] << 24) |
        (nodeStream[nodeStream.length - 3] << 16) |
        (nodeStream[nodeStream.length - 2] << 8) |
        nodeStream[nodeStream.length - 1];
      expect(ours, `adler32: ${name}`).toBe(theirs >>> 0);
    }
  });
});
