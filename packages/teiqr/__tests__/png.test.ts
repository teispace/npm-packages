import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, decodePng, encodePng } from '../src/raster/png.js';

const makePixels = (
  w: number,
  h: number,
  fn: (x: number, y: number) => [number, number, number, number],
) => {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * w + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  return px;
};

describe('PNG encoding', () => {
  it('writes a valid signature, IHDR and IEND', () => {
    const png = encodePng(
      makePixels(4, 4, () => [255, 0, 0, 255]),
      4,
      4,
    );
    expect(Array.from(png.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe('IHDR');
    expect(String.fromCharCode(...png.subarray(png.length - 8, png.length - 4))).toBe('IEND');
  });

  it('writes chunk CRCs an independent reader can verify', () => {
    const png = encodePng(
      makePixels(8, 8, (x, y) => [x * 30, y * 30, 0, 255]),
      8,
      8,
    );
    let offset = 8;
    let chunks = 0;
    while (offset < png.length) {
      const length =
        ((png[offset] << 24) |
          (png[offset + 1] << 16) |
          (png[offset + 2] << 8) |
          png[offset + 3]) >>>
        0;
      const stored =
        ((png[offset + 8 + length] << 24) |
          (png[offset + 9 + length] << 16) |
          (png[offset + 10 + length] << 8) |
          png[offset + 11 + length]) >>>
        0;
      expect(crc32(png.subarray(offset + 4, offset + 8 + length))).toBe(stored);
      chunks++;
      offset += length + 12;
    }
    expect(chunks).toBeGreaterThanOrEqual(3);
  });

  it('produces IDAT that Node zlib can inflate to correctly filtered scanlines', () => {
    const w = 16,
      h = 16;
    const pixels = makePixels(w, h, (x, y) => [x * 16, y * 16, 128, 255]);
    const png = encodePng(pixels, w, h);

    // Pull the IDAT out and inflate it with Node, entirely independent of our code.
    let offset = 8;
    let idat: Uint8Array | null = null;
    while (offset < png.length) {
      const length =
        ((png[offset] << 24) |
          (png[offset + 1] << 16) |
          (png[offset + 2] << 8) |
          png[offset + 3]) >>>
        0;
      if (String.fromCharCode(...png.subarray(offset + 4, offset + 8)) === 'IDAT') {
        idat = png.subarray(offset + 8, offset + 8 + length);
        break;
      }
      offset += length + 12;
    }
    expect(idat).not.toBeNull();

    const raw = new Uint8Array(inflateSync(idat as Uint8Array));
    // One filter byte plus w*4 bytes per row.
    expect(raw.length).toBe(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) expect(raw[y * (w * 4 + 1)]).toBeLessThanOrEqual(4);
  });

  it('round trips pixels exactly, including alpha', () => {
    for (const [w, h] of [
      [1, 1],
      [3, 7],
      [64, 64],
      [17, 5],
    ] as const) {
      const pixels = makePixels(w, h, (x, y) => [
        (x * 7 + y * 13) & 0xff,
        (x * 31) & 0xff,
        (y * 17) & 0xff,
        (x + y) % 2 ? 255 : 128,
      ]);
      const decoded = decodePng(encodePng(pixels, w, h));
      expect(decoded.width).toBe(w);
      expect(decoded.height).toBe(h);
      expect(Array.from(decoded.pixels)).toEqual(Array.from(pixels));
    }
  });

  it('compresses a QR-like bitmap hard', () => {
    // Large blocks of solid colour, which is what a scaled QR code looks like.
    const w = 400,
      h = 400;
    const pixels = makePixels(w, h, (x, y) =>
      (Math.floor(x / 10) + Math.floor(y / 10)) % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const png = encodePng(pixels, w, h);
    expect(png.length).toBeLessThan(pixels.length / 100);
  });

  it('records physical resolution when a dpi is given', () => {
    const png = encodePng(
      makePixels(2, 2, () => [0, 0, 0, 255]),
      2,
      2,
      { dpi: 300 },
    );
    const marker = String.fromCharCode(...png).indexOf('pHYs');
    expect(marker).toBeGreaterThan(0);
    // 300 dpi is 11811 pixels per metre.
    const at = marker + 4;
    const perMetre =
      ((png[at] << 24) | (png[at + 1] << 16) | (png[at + 2] << 8) | png[at + 3]) >>> 0;
    expect(perMetre).toBe(11811);
  });

  it('rejects a mismatched pixel buffer', () => {
    expect(() => encodePng(new Uint8Array(10), 4, 4)).toThrow(RangeError);
  });
});
