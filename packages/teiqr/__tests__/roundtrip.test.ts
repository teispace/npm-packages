import { describe, expect, it } from 'vitest';
import { ECI } from '../src/core/eci.js';
import { encode } from '../src/core/encode.js';
import { makeAlphanumericSegment, makeNumericSegment } from '../src/core/segment.js';
import type { EccLevel } from '../src/core/types.js';
import { capacityBits, MAX_VERSION } from '../src/core/version.js';
import { decodeMatrix } from '../src/verify/decode-matrix.js';

const LEVELS: EccLevel[] = ['L', 'M', 'Q', 'H'];

/** Deterministic pseudo-random text, so a failure is always reproducible. */
const lcg = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
};

describe('encode → decode round trip', () => {
  it('recovers plain ASCII at every error correction level', () => {
    for (const ecc of LEVELS) {
      const text = 'https://example.com/order/1234567890';
      const result = decodeMatrix(encode(text, { ecc }));
      expect(result.text).toBe(text);
      expect(result.corrected).toBe(0);
    }
  });

  it('recovers text at every version from 1 to 40', () => {
    for (let version = 1; version <= MAX_VERSION; version++) {
      // Fill most of the version's byte capacity so it cannot silently fall
      // back to a smaller symbol.
      const budget = Math.floor(capacityBits(version, 'L') / 8) - 4;
      const text = 'A'.repeat(Math.max(1, budget));
      const matrix = encode(text, { ecc: 'L', minVersion: version, maxVersion: version });
      expect(matrix.version).toBe(version);
      expect(decodeMatrix(matrix).text).toBe(text);
    }
  });

  it('recovers arbitrary binary payloads byte for byte', () => {
    const rand = lcg(42);
    for (const size of [1, 2, 17, 100, 512, 2000]) {
      const bytes = Uint8Array.from({ length: size }, () => Math.floor(rand() * 256));
      const result = decodeMatrix(encode(bytes, { ecc: 'L' }));
      expect(Array.from(result.bytes)).toEqual(Array.from(bytes));
    }
  });

  it('recovers mixed-mode text, preserving the segmentation', () => {
    const text = 'HELLO WORLD 1234567890 lowercase tail';
    const result = decodeMatrix(encode(text));
    expect(result.text).toBe(text);
    // The optimiser should have used more than one mode here.
    expect(new Set(result.segments.map((s) => s.mode)).size).toBeGreaterThan(1);
  });

  it('recovers multi-byte UTF-8 without an ECI header', () => {
    for (const text of ['héllo wörld', '日本語テキスト', 'emoji 🎉 tail', 'Ω≈ç√∫˜µ']) {
      expect(decodeMatrix(encode(text)).text).toBe(text);
    }
  });

  it('recovers text through a declared UTF-8 ECI header', () => {
    const text = 'café — 12345';
    const result = decodeMatrix(encode(text, { eci: ECI.UTF8 }));
    expect(result.eci).toBe(ECI.UTF8);
    expect(result.text).toBe(text);
  });

  it('honours hand-built segments', () => {
    const segments = [makeAlphanumericSegment('ABC123'), makeNumericSegment('98765')];
    const result = decodeMatrix(encode(segments));
    expect(result.text).toBe('ABC12398765');
    expect(result.segments.map((s) => s.mode)).toEqual(['alphanumeric', 'numeric']);
  });

  it('round trips every pinned mask', () => {
    for (let mask = 0; mask < 8; mask++) {
      const matrix = encode('mask trial', { mask });
      expect(matrix.mask).toBe(mask);
      expect(decodeMatrix(matrix).text).toBe('mask trial');
    }
  });

  it('reads level and mask back out of the format information alone', () => {
    for (const ecc of LEVELS) {
      const matrix = encode('format info', { ecc, boostEcc: false });
      // trustHeader: false forces the 15-bit BCH pattern to be matched instead
      // of the convenience fields, which is the path a scanned symbol takes.
      const result = decodeMatrix(matrix, { trustHeader: false });
      expect(result.ecc).toBe(ecc);
      expect(result.mask).toBe(matrix.mask);
      expect(result.text).toBe('format info');
    }
  });
});

describe('Structured Append', () => {
  it('stays a single symbol when the payload fits one', async () => {
    const { encodeStructured } = await import('../src/core/structured.js');
    const { symbols, count } = encodeStructured('short');
    expect(count).toBe(1);
    expect(symbols).toHaveLength(1);
    // A lone symbol carries no Structured Append header at all.
    expect(decodeMatrix(symbols[0]).structured).toBeUndefined();
  });

  it('splits a large payload and tags every symbol with its position', async () => {
    const { encodeStructured, structuredParity } = await import('../src/core/structured.js');
    // Comfortably past the 2,953-byte single-symbol ceiling.
    const text = 'abcdefghij0123456789'.repeat(400);
    const { symbols, parity, count } = encodeStructured(text, { ecc: 'L' });

    expect(count).toBeGreaterThan(1);
    expect(symbols).toHaveLength(count);
    expect(parity).toBe(structuredParity(new TextEncoder().encode(text)));

    const parts = symbols.map((s) => decodeMatrix(s));
    parts.forEach((part, i) => {
      expect(part.structured).toBeDefined();
      expect(part.structured?.index).toBe(i);
      expect(part.structured?.total).toBe(count);
      // Every symbol repeats the parity of the whole original payload, which is
      // what lets a reader reject symbols mixed in from a different set.
      expect(part.structured?.parity).toBe(parity);
    });

    expect(parts.map((p) => p.text).join('')).toBe(text);
  });

  it('honours an explicit symbol count', async () => {
    const { encodeStructured } = await import('../src/core/structured.js');
    const text = 'x'.repeat(600);
    const { symbols } = encodeStructured(text, { count: 4, ecc: 'L' });
    expect(symbols).toHaveLength(4);
    const joined = symbols.map((s) => decodeMatrix(s).text).join('');
    expect(joined).toBe(text);
  });

  it('rejects a symbol count outside the spec range', async () => {
    const { encodeStructured } = await import('../src/core/structured.js');
    expect(() => encodeStructured('x', { count: 1 })).toThrow(RangeError);
    expect(() => encodeStructured('x', { count: 17 })).toThrow(RangeError);
  });
});
