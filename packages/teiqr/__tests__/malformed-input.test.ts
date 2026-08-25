import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { decodePng, encodePng } from '../src/raster/png.js';
import { toPng } from '../src/raster/scene-raster.js';
import { scan, tryScan } from '../src/verify/api.js';
import { decodeMatrix } from '../src/verify/decode-matrix.js';
import { decodeMicroMatrix } from '../src/verify/decode-micro.js';
import { decodeRmqrMatrix } from '../src/verify/decode-rmqr.js';

/**
 * Everything here is input the library did not produce.
 *
 * A decoder's entire job is reading bytes someone else wrote, and `scan()` is
 * documented for exactly that. So the rest of the suite — which feeds it
 * output from this package's own encoder — tests the easy half. This file
 * tests the half that decides whether a server stays up.
 *
 * It exists because of a real bug. The DEFLATE bit reader advanced past the
 * end of its buffer and read `undefined`, and `undefined << n` is `0` in
 * JavaScript, so instead of failing it returned an endless stream of zero
 * bits. The two `for (;;)` loops consuming those bits never terminated. Eight
 * bytes — a PNG signature and nothing else — hung the process indefinitely
 * while growing an array, straight through `scan()`, and `tryScan()`, which is
 * documented as never throwing, hung rather than returning `null`.
 *
 * **A regression here hangs rather than fails.** Vitest cannot interrupt a
 * synchronous infinite loop, so the symptom would be a CI job that never
 * finishes rather than a red test. That is worth knowing before you go looking
 * for an assertion that failed.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A real, valid PNG to mutate. */
const validPng = (): Uint8Array => toPng(encode('malformed input suite'), {}, { scale: 4 });

/** Overwrite a big-endian uint32 in place. */
const putUint32 = (bytes: Uint8Array, at: number, value: number): void => {
  bytes[at] = (value >>> 24) & 0xff;
  bytes[at + 1] = (value >>> 16) & 0xff;
  bytes[at + 2] = (value >>> 8) & 0xff;
  bytes[at + 3] = value & 0xff;
};

describe('malformed PNG input', () => {
  it('rejects the signature alone, rather than looping forever on it', () => {
    // The original bug, in its smallest form.
    expect(() => decodePng(Uint8Array.from(SIGNATURE))).toThrow();
  });

  it('rejects a signature followed by garbage', () => {
    expect(() =>
      decodePng(Uint8Array.from([...SIGNATURE, ...new Array(200).fill(0xff)])),
    ).toThrow();
  });

  it('rejects a bad signature', () => {
    expect(() => decodePng(new Uint8Array(64))).toThrow(/bad signature/);
  });

  it('rejects a chunk claiming to run past the end of the buffer', () => {
    const bytes = validPng();
    // The IHDR length field sits immediately after the signature.
    putUint32(bytes, 8, 0x7fffffff);
    expect(() => decodePng(bytes)).toThrow(/past the end/);
  });

  it('rejects absurd dimensions instead of trying to allocate them', () => {
    // Dimensions are unsigned 32-bit on the wire, so a hostile header can ask
    // for billions of pixels; width * height * 4 is what would be allocated.
    const bytes = validPng();
    putUint32(bytes, 16, 0x7fffffff);
    putUint32(bytes, 20, 0x7fffffff);
    expect(() => decodePng(bytes)).toThrow(/out of range/);
  });

  it('rejects zero dimensions', () => {
    const bytes = validPng();
    putUint32(bytes, 16, 0);
    expect(() => decodePng(bytes)).toThrow(/out of range/);
  });

  it('rejects a file with no header chunk', () => {
    expect(() =>
      decodePng(Uint8Array.from([...SIGNATURE, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0])),
    ).toThrow(/no IHDR/);
  });

  it('rejects a header with no image data after it', () => {
    const bytes = validPng();
    // Rename every IDAT so the walk finds none, keeping the file otherwise intact.
    for (let i = 0; i < bytes.length - 4; i++) {
      if (
        bytes[i] === 0x49 &&
        bytes[i + 1] === 0x44 &&
        bytes[i + 2] === 0x41 &&
        bytes[i + 3] === 0x54
      ) {
        bytes[i] = 0x7a; // 'z' — an unknown ancillary chunk, which is skipped
      }
    }
    expect(() => decodePng(bytes)).toThrow(/no image data/);
  });

  it('refuses a stream that inflates beyond the size the header declares', () => {
    // A decompression bomb in miniature: the data is a valid DEFLATE stream,
    // it simply produces far more than an image this size could hold. No
    // amount of input validation catches that, so the output is bounded too.
    const bytes = encodePng(new Uint8Array(64 * 64 * 4).fill(0x40), 64, 64);
    putUint32(bytes, 16, 2);
    putUint32(bytes, 20, 2);
    expect(() => decodePng(bytes)).toThrow(/beyond its declared size/);
  });

  it('rejects unsupported bit depths, colour types and interlacing', () => {
    for (const [offset, value, message] of [
      [24, 16, /bit depth/],
      [25, 3, /colour type/],
      [28, 1, /Interlaced/],
    ] as const) {
      const bytes = validPng();
      bytes[offset] = value;
      expect(() => decodePng(bytes), String(message)).toThrow(message);
    }
  });

  it('survives every truncation of a valid file', () => {
    // The general case of the original bug. Note what is asserted: not that
    // every truncation throws — cutting a file after its last IDAT removes
    // only the IEND trailer and leaves something perfectly readable — but that
    // every truncation *terminates*, with either pixels or an error. Demanding
    // a throw here fails on exactly the truncations that are still valid PNGs,
    // which says nothing about the bug this guards.
    const full = validPng();
    for (let length = 1; length < full.length; length += 7) {
      const bytes = full.subarray(0, length);
      try {
        const image = decodePng(bytes);
        expect(image.pixels.length, `truncated to ${length}`).toBe(image.width * image.height * 4);
      } catch {
        // The other acceptable outcome.
      }
    }
  });

  it('survives a single corrupted byte anywhere in the compressed data', () => {
    // Unlike truncation this often decodes to *something*, which is fine. What
    // matters is that it either produces pixels or throws — never loops.
    const full = validPng();
    for (let at = 40; at < full.length; at += 11) {
      const bytes = Uint8Array.from(full);
      bytes[at] ^= 0xff;
      try {
        const image = decodePng(bytes);
        expect(image.pixels.length).toBe(image.width * image.height * 4);
      } catch {
        // A throw is the other acceptable outcome.
      }
    }
  });
});

describe('malformed input reaching the public scan API', () => {
  const truncated = Uint8Array.from(SIGNATURE);

  it('throws from scan() rather than hanging', () => {
    expect(() => scan(truncated)).toThrow();
  });

  it('returns null from tryScan(), which is documented never to throw', () => {
    // This is the assertion that would have caught the original bug most
    // directly: the safe wrapper offered no safety at all, because it hung
    // before it could catch anything.
    expect(tryScan(truncated)).toBeNull();
  });

  it('handles a truncated data URL', () => {
    expect(tryScan('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
  });

  it('handles base64 that is not an image at all', () => {
    expect(tryScan(`data:image/png;base64,${'A'.repeat(4000)}`)).toBeNull();
  });

  it('handles a pixel buffer smaller than its declared dimensions', () => {
    expect(tryScan({ data: new Uint8Array(16), width: 1000, height: 1000 })).toBeNull();
  });

  it('handles zero-sized input', () => {
    expect(tryScan({ data: new Uint8Array(0), width: 0, height: 0 })).toBeNull();
  });

  it('handles an image of pure noise without finding a symbol in it', () => {
    let state = 12345;
    const data = new Uint8Array(400 * 400 * 4);
    for (let i = 0; i < data.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[i] = state & 255;
    }
    const result = tryScan({ data, width: 400, height: 400 });
    // Finding nothing is the expected answer; finding something would mean the
    // detector accepts arrangements that are not symbols.
    expect(result).toBeNull();
  });
});

describe('malformed matrices', () => {
  const blank = (size: number) => ({
    size,
    modules: new Uint8Array(size * size),
    kinds: new Uint8Array(size * size),
  });

  it('rejects a version outside the range', () => {
    expect(() => decodeMatrix({ ...blank(21), version: 99 })).toThrow();
    expect(() => decodeMatrix({ ...blank(21), version: 0 })).toThrow();
  });

  it('rejects a size that does not match the version', () => {
    expect(() => decodeMatrix({ ...blank(21), version: 40 })).toThrow();
  });

  it('rejects an all-dark and an all-light matrix', () => {
    const dark = { ...blank(21), version: 1 };
    dark.modules.fill(1);
    expect(() => decodeMatrix(dark)).toThrow();
    expect(() => decodeMatrix({ ...blank(21), version: 1 })).toThrow();
  });

  it('rejects a grid that is not a Micro QR or rMQR size', () => {
    expect(() => decodeMicroMatrix({ size: 21, modules: new Uint8Array(441) })).toThrow();
    expect(() =>
      decodeRmqrMatrix({ modules: new Uint8Array(21 * 21), width: 21, height: 21 }),
    ).toThrow();
  });

  it('rejects random module data at every symbology', () => {
    let state = 999;
    const noise = (n: number) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        out[i] = state & 1;
      }
      return out;
    };
    for (let trial = 0; trial < 20; trial++) {
      expect(() =>
        decodeMatrix({ size: 21, version: 1, modules: noise(441), kinds: new Uint8Array(441) }),
      ).toThrow();
      expect(() => decodeMicroMatrix({ size: 11, modules: noise(121) })).toThrow();
    }
  });
});
