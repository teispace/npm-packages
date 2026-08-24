import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { encodeStructured } from '../src/core/structured.js';
import { decodePng } from '../src/raster/png.js';
import { toPng } from '../src/raster/scene-raster.js';
import {
  joinStructured,
  NotFoundError,
  scan,
  scanAll,
  scanAsync,
  tryScan,
} from '../src/verify/api.js';
import { decodeMatrix } from '../src/verify/decode-matrix.js';

const png = (text: string, style = {}) =>
  toPng(encode(text), style, { scale: 8, background: '#ffffff' });

describe('scan() accepts every reasonable input shape', () => {
  const text = 'https://example.com/universal-input';

  it('decodes PNG bytes', () => {
    expect(scan(png(text)).text).toBe(text);
  });

  it('decodes an ArrayBuffer', () => {
    const bytes = png(text);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect(scan(buffer as ArrayBuffer).text).toBe(text);
  });

  it('decodes a Node Buffer', () => {
    expect(scan(Buffer.from(png(text))).text).toBe(text);
  });

  it('decodes a base64 data URL', () => {
    const url = `data:image/png;base64,${Buffer.from(png(text)).toString('base64')}`;
    expect(scan(url).text).toBe(text);
  });

  it('decodes bare base64 with no data-URL prefix', () => {
    expect(scan(Buffer.from(png(text)).toString('base64')).text).toBe(text);
  });

  it('decodes an ImageData-shaped object', () => {
    const image = decodePng(png(text));
    expect(scan({ data: image.pixels, width: image.width, height: image.height }).text).toBe(text);
  });

  it('decodes a Uint8ClampedArray, as a canvas would supply', () => {
    const image = decodePng(png(text));
    const clamped = new Uint8ClampedArray(image.pixels);
    expect(scan({ data: clamped, width: image.width, height: image.height }).text).toBe(text);
  });

  it('decodes 3-channel RGB pixels', () => {
    const image = decodePng(png(text));
    const rgb = new Uint8Array(image.width * image.height * 3);
    for (let i = 0; i < image.width * image.height; i++) {
      rgb[i * 3] = image.pixels[i * 4];
      rgb[i * 3 + 1] = image.pixels[i * 4 + 1];
      rgb[i * 3 + 2] = image.pixels[i * 4 + 2];
    }
    expect(scan({ data: rgb, width: image.width, height: image.height, channels: 3 }).text).toBe(
      text,
    );
  });

  it('decodes single-channel grayscale pixels', () => {
    const image = decodePng(png(text));
    const gray = new Uint8Array(image.width * image.height);
    for (let i = 0; i < gray.length; i++) gray[i] = image.pixels[i * 4];
    expect(scan({ data: gray, width: image.width, height: image.height, channels: 1 }).text).toBe(
      text,
    );
  });

  it('decodes a QrMatrix directly, with no pixels involved', () => {
    expect(scan(encode(text)).text).toBe(text);
  });

  it('decodes asynchronously through the same path', async () => {
    expect((await scanAsync(png(text))).text).toBe(text);
  });
});

describe('scan() robustness', () => {
  it('reads a light-on-dark code by retrying inverted', () => {
    const text = 'inverted code';
    const image = toPng(
      encode(text),
      {
        body: { kind: 'solid', color: '#ffffff' },
        background: { kind: 'solid', color: '#000000' },
      },
      { scale: 8 },
    );
    expect(scan(image).text).toBe(text);
  });

  it('can be told not to retry inverted', () => {
    const image = toPng(
      encode('inverted'),
      {
        body: { kind: 'solid', color: '#ffffff' },
        background: { kind: 'solid', color: '#000000' },
      },
      { scale: 8 },
    );
    expect(() => scan(image, { tryInverted: false })).toThrow();
  });

  it('returns null instead of throwing via tryScan', () => {
    const blank = new Uint8Array(80 * 80 * 4).fill(255);
    expect(tryScan({ data: blank, width: 80, height: 80 })).toBeNull();
    expect(tryScan(png('present'))?.text).toBe('present');
  });

  it('throws NotFoundError on an image with no code', () => {
    const blank = new Uint8Array(80 * 80 * 4).fill(255);
    expect(() => scan({ data: blank, width: 80, height: 80 })).toThrow(NotFoundError);
  });

  it('rejects input it cannot interpret', () => {
    expect(() => scan(Uint8Array.from([1, 2, 3, 4]))).toThrow(TypeError);
    expect(() => scan(42 as unknown as Uint8Array)).toThrow(TypeError);
  });

  it('finds several codes in one image', () => {
    // Tile four codes into a single canvas.
    const texts = ['first code', 'second code', 'third code', 'fourth code'];
    const tiles = texts.map((t) => decodePng(png(t)));
    const tile = tiles[0].width;
    const size = tile * 2;
    const canvas = new Uint8Array(size * size * 4).fill(255);
    tiles.forEach((img, i) => {
      const ox = (i % 2) * tile;
      const oy = Math.floor(i / 2) * tile;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const s = (y * img.width + x) * 4;
          const d = ((oy + y) * size + (ox + x)) * 4;
          canvas.set(img.pixels.subarray(s, s + 4), d);
        }
      }
    });

    const found = scanAll({ data: canvas, width: size, height: size });
    expect(found).toHaveLength(4);
    expect(found.map((f) => f.text).sort()).toEqual([...texts].sort());
  });
});

describe('Structured Append reassembly', () => {
  it('joins a set scanned in a shuffled order', () => {
    const text = 'abcdefghij0123456789'.repeat(400);
    const { symbols, count } = encodeStructured(text, { ecc: 'L' });
    expect(count).toBeGreaterThan(1);

    const decoded = symbols.map((s) => decodeMatrix(s));
    const shuffled = [...decoded].reverse();
    const joined = joinStructured(shuffled);
    expect(joined.text).toBe(text);
    expect(joined.count).toBe(count);
  });

  it('treats a lone standalone symbol as a complete payload', () => {
    expect(joinStructured([decodeMatrix(encode('standalone'))]).text).toBe('standalone');
  });

  it('refuses an incomplete set', () => {
    const { symbols } = encodeStructured('z'.repeat(4000), { ecc: 'L' });
    const decoded = symbols.map((s) => decodeMatrix(s));
    expect(() => joinStructured(decoded.slice(0, -1))).toThrow(/incomplete/i);
  });

  it('refuses symbols from two different sets', () => {
    // Payloads must differ in XOR parity for this test to mean anything: a run
    // of one repeated byte an even number of times XORs to 0, so two such runs
    // would share a parity and the check could never fire.
    const a = encodeStructured(`${'ab'.repeat(2000)}q`, { ecc: 'L' }).symbols.map((s) =>
      decodeMatrix(s),
    );
    const b = encodeStructured(`${'cd'.repeat(2000)}z`, { ecc: 'L' }).symbols.map((s) =>
      decodeMatrix(s),
    );
    expect(a[0].structured?.parity).not.toBe(b[0].structured?.parity);
    // Same indices and same total, different parity — only the parity check catches this.
    expect(() => joinStructured([a[0], b[1]])).toThrow(/different sets/i);
  });

  it('refuses a duplicated index', () => {
    const s = encodeStructured('c'.repeat(4000), { ecc: 'L' }).symbols.map((x) => decodeMatrix(x));
    expect(() => joinStructured([s[0], s[0]])).toThrow(/duplicate/i);
  });
});
