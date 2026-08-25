import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { decodePng } from '../src/raster/png.js';
import { rasterize } from '../src/raster/scene-raster.js';
import { scan } from '../src/verify/api.js';

/**
 * PNGs in every shape the format allows, none of them written by this package.
 *
 * `scan()` takes images from anywhere, and a QR code is a two-colour image —
 * precisely the kind every encoder and optimiser stores as 1-bit palette or
 * greyscale rather than as RGBA. For a long time this decoder read back only
 * what {@link encodePng} emits, 8-bit RGB and RGBA, which meant it rejected
 * most QR PNGs in existence with "Unsupported colour type: 3".
 *
 * So these fixtures are built here, by hand, from the spec's own tables, and
 * compressed with Node's zlib rather than the bundled deflater — the point is
 * to face the reader with bytes it did not produce.
 */

const PAYLOAD = 'https://example.com/png-variants';

/** Reference image: what the renderer produces, as plain RGBA. */
const reference = rasterize(encode(PAYLOAD), {}, { scale: 5 });

/** True where the reference pixel is a light module. */
const isLight = (x: number, y: number): boolean =>
  reference.pixels[(y * reference.width + x) * 4] > 127;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Adam7 passes as `[xStart, yStart, xStep, yStep]`. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const uint32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

const chunk = (type: string, data: ArrayLike<number>): number[] => {
  const body = [...type].map((c) => c.charCodeAt(0)).concat(Array.from(data));
  return [...uint32(body.length - 4), ...body, ...uint32(crc32(Uint8Array.from(body)))];
};

interface Variant {
  readonly depth: number;
  readonly colour: number;
  readonly interlace?: boolean;
  readonly palette?: readonly number[];
  readonly trns?: readonly number[];
  /** Samples for one pixel, at the variant's own bit depth. */
  readonly sample: (x: number, y: number) => readonly number[];
}

/**
 * Assemble a PNG, packing samples at the declared depth and, when asked,
 * splitting them across the seven Adam7 passes.
 *
 * Every scanline uses filter 0. Filtering is exercised thoroughly elsewhere;
 * what is under test here is the colour model, and an unfiltered row keeps the
 * fixture readable enough to check by eye.
 */
const buildPng = (variant: Variant): Uint8Array => {
  const { depth, colour, interlace = false, palette, trns, sample } = variant;
  const { width, height } = reference;
  const channels = CHANNELS[colour];
  const passes = interlace ? ADAM7 : ([[0, 0, 1, 1]] as const);
  const raw: number[] = [];

  for (const [xStart, yStart, xStep, yStep] of passes) {
    const wide = Math.ceil((width - xStart) / xStep);
    const rows = Math.ceil((height - yStart) / yStep);
    if (wide <= 0 || rows <= 0) continue;
    const stride = Math.ceil((depth * channels * wide) / 8);

    for (let row = 0; row < rows; row++) {
      const line = new Uint8Array(stride);
      for (let col = 0; col < wide; col++) {
        const values = sample(xStart + col * xStep, yStart + row * yStep);
        for (let k = 0; k < channels; k++) {
          const index = col * channels + k;
          const value = values[k];
          if (depth === 16) {
            line[index * 2] = (value >> 8) & 0xff;
            line[index * 2 + 1] = value & 0xff;
          } else if (depth === 8) {
            line[index] = value & 0xff;
          } else {
            const bit = index * depth;
            line[bit >> 3] |= (value & ((1 << depth) - 1)) << (8 - depth - (bit & 7));
          }
        }
      }
      raw.push(0, ...line);
    }
  }

  return Uint8Array.from([
    ...SIGNATURE,
    ...chunk('IHDR', [...uint32(width), ...uint32(height), depth, colour, 0, 0, interlace ? 1 : 0]),
    ...(palette ? chunk('PLTE', palette) : []),
    ...(trns ? chunk('tRNS', trns) : []),
    ...chunk('IDAT', deflateSync(Buffer.from(raw))),
    ...chunk('IEND', []),
  ]);
};

/** Widen a sample of `depth` bits to the 0-255 the decoder must return. */
const widen = (value: number, depth: number): number =>
  depth === 16 ? value >> 8 : value * { 1: 255, 2: 85, 4: 17, 8: 1 }[depth]!;

describe('decoding PNGs this package did not write', () => {
  /**
   * Greyscale at every depth it is allowed. The sample is the full-scale value
   * for a light module and zero for a dark one, so the decoded pixel must come
   * back as pure white or pure black however few bits carried it.
   */
  it.each([1, 2, 4, 8, 16])('reads %i-bit greyscale', (depth) => {
    const max = depth === 16 ? 0xffff : (1 << depth) - 1;
    const png = buildPng({
      depth,
      colour: 0,
      sample: (x, y) => [isLight(x, y) ? max : 0],
    });

    const image = decodePng(png);
    expect(image.width).toBe(reference.width);
    expect(image.pixels).toEqual(reference.pixels);
    expect(scan(png).text).toBe(PAYLOAD);
  });

  /**
   * Palette at every depth it is allowed. A two-entry palette is what a
   * minimising encoder picks for a QR code, and at 1 bit it is eight pixels
   * per byte — the densest the format goes.
   */
  it.each([1, 2, 4, 8])('reads %i-bit palette', (depth) => {
    const png = buildPng({
      depth,
      colour: 3,
      palette: [0, 0, 0, 255, 255, 255],
      sample: (x, y) => [isLight(x, y) ? 1 : 0],
    });

    expect(decodePng(png).pixels).toEqual(reference.pixels);
    expect(scan(png).text).toBe(PAYLOAD);
  });

  it.each([8, 16])('reads %i-bit greyscale with an alpha channel', (depth) => {
    const max = depth === 16 ? 0xffff : 0xff;
    const png = buildPng({
      depth,
      colour: 4,
      sample: (x, y) => [isLight(x, y) ? max : 0, max],
    });

    expect(decodePng(png).pixels).toEqual(reference.pixels);
    expect(scan(png).text).toBe(PAYLOAD);
  });

  it.each([8, 16])('reads %i-bit truecolour', (depth) => {
    const max = depth === 16 ? 0xffff : 0xff;
    const png = buildPng({
      depth,
      colour: 2,
      sample: (x, y) => (isLight(x, y) ? [max, max, max] : [0, 0, 0]),
    });

    expect(decodePng(png).pixels).toEqual(reference.pixels);
    expect(scan(png).text).toBe(PAYLOAD);
  });

  /**
   * 16-bit samples are truncated to their high byte, so a value whose halves
   * disagree must follow the high one. Encoding 0xAB00 rather than 0xABAB is
   * what separates "takes the high byte" from "averages" or "takes the low".
   */
  it('truncates 16-bit samples to the high byte rather than rescaling', () => {
    const png = buildPng({
      depth: 16,
      colour: 2,
      sample: () => [0xab00, 0x12ff, 0xcd01],
    });

    const { pixels } = decodePng(png);
    expect(Array.from(pixels.subarray(0, 4))).toEqual([0xab, 0x12, 0xcd, 0xff]);
  });

  it('widens sub-byte greyscale across the full range', () => {
    // 2-bit greyscale has four levels, which must land on 0, 85, 170 and 255 —
    // evenly spaced and reaching both ends. Scaling by 64 instead of 85 would
    // put "white" at 192 and quietly grey out every light module.
    const png = buildPng({ depth: 2, colour: 0, sample: (x) => [x % 4] });
    const { pixels } = decodePng(png);
    expect([0, 1, 2, 3].map((v) => pixels[v * 4])).toEqual([0, 85, 170, 255]);
    expect([0, 1, 2, 3].map((v) => widen(v, 2))).toEqual([0, 85, 170, 255]);
  });
});

describe('Adam7 interlacing', () => {
  /**
   * Interlaced images arrive as seven independently filtered sub-images on
   * different lattices. Getting the lattice arithmetic wrong scrambles the
   * pixels rather than failing, so both the exact pixels and a real decode are
   * asserted: a scan that still succeeds proves the modules landed where they
   * belong.
   */
  it.each([
    ['greyscale', 8, 0, undefined],
    ['1-bit palette', 1, 3, [0, 0, 0, 255, 255, 255]],
    ['truecolour + alpha', 8, 6, undefined],
  ] as const)('reads interlaced %s', (_label, depth, colour, palette) => {
    const png = buildPng({
      depth,
      colour,
      interlace: true,
      palette,
      sample: (x, y) => {
        const light = isLight(x, y);
        if (colour === 3) return [light ? 1 : 0];
        if (colour === 6) return light ? [255, 255, 255, 255] : [0, 0, 0, 255];
        return [light ? 255 : 0];
      },
    });

    expect(decodePng(png).pixels).toEqual(reference.pixels);
    expect(scan(png).text).toBe(PAYLOAD);
  });

  it('places every pass on its own lattice', () => {
    // A gradient makes a misplaced pass obvious in a way a two-colour image
    // cannot: every pixel has a distinct expected value, so any pass written
    // to the wrong lattice lands on a value that is wrong rather than merely
    // the same colour as its neighbour.
    const value = (x: number, y: number) => (x * 7 + y * 13) & 0xff;
    const png = buildPng({ depth: 8, colour: 0, interlace: true, sample: (x, y) => [value(x, y)] });
    const { pixels, width, height } = decodePng(png);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        expect(pixels[(y * width + x) * 4], `at ${x},${y}`).toBe(value(x, y));
      }
    }
  });
});

describe('tRNS transparency', () => {
  /**
   * Each of these encodes the light modules as *black but transparent*. The
   * binariser composites over white, so honouring tRNS turns them back into a
   * readable symbol — and ignoring it leaves an all-black square that cannot
   * decode at all. That is the point: these fail loudly if transparency is
   * dropped, rather than passing because black-on-green happens to scan.
   */
  it('honours a palette alpha table', () => {
    const png = buildPng({
      depth: 8,
      colour: 3,
      palette: [0, 0, 0, 0, 0, 0],
      trns: [255, 0],
      sample: (x, y) => [isLight(x, y) ? 1 : 0],
    });

    expect(scan(png).text).toBe(PAYLOAD);
    // Without tRNS the very same pixels are a uniform black field.
    const opaque = buildPng({
      depth: 8,
      colour: 3,
      palette: [0, 0, 0, 0, 0, 0],
      sample: (x, y) => [isLight(x, y) ? 1 : 0],
    });
    expect(new Set(decodePng(opaque).pixels.filter((_, i) => i % 4 === 0)).size).toBe(1);
  });

  it('treats a short palette alpha table as opaque past its end', () => {
    // tRNS may stop before the palette does; entries it never reaches are
    // fully opaque. Here only entry 0 is listed, so entry 1 must stay solid.
    const png = buildPng({
      depth: 8,
      colour: 3,
      palette: [0, 0, 0, 255, 255, 255],
      trns: [128],
      sample: (x, y) => [isLight(x, y) ? 1 : 0],
    });

    const { pixels } = decodePng(png);
    const alphas = new Set<number>();
    for (let i = 3; i < pixels.length; i += 4) alphas.add(pixels[i]);
    expect(alphas).toEqual(new Set([128, 255]));
  });

  it('honours a greyscale colour key', () => {
    const png = buildPng({
      depth: 8,
      colour: 0,
      trns: [0, 5],
      sample: (x, y) => [isLight(x, y) ? 5 : 0],
    });

    expect(scan(png).text).toBe(PAYLOAD);
  });

  it('honours a truecolour colour key', () => {
    const png = buildPng({
      depth: 8,
      colour: 2,
      trns: [0, 1, 0, 0, 0, 0],
      sample: (x, y) => (isLight(x, y) ? [1, 0, 0] : [0, 0, 0]),
    });

    expect(scan(png).text).toBe(PAYLOAD);
  });

  it('compares the colour key at the image bit depth', () => {
    // tRNS always stores 16-bit values; at lower depths only the low bits are
    // significant. Comparing the raw 16-bit word against a 4-bit sample would
    // never match, and every pixel would come back opaque.
    const png = buildPng({
      depth: 4,
      colour: 0,
      trns: [0, 9],
      sample: (x) => [x % 2 === 0 ? 9 : 0],
    });

    const { pixels } = decodePng(png);
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(255);
  });
});

describe('headers the spec does not allow', () => {
  const build = (depth: number, colour: number, interlace = 0): Uint8Array => {
    const png = buildPng({ depth: 8, colour: 0, sample: () => [0] });
    png[24] = depth;
    png[25] = colour;
    png[28] = interlace;
    return png;
  };

  it.each([1, 5, 7, 9])('rejects colour type %i', (colour) => {
    expect(() => decodePng(build(8, colour))).toThrow(/colour type/);
  });

  it.each([
    [3, 0],
    [0, 0],
    [32, 0],
  ])('rejects bit depth %i', (depth, colour) => {
    expect(() => decodePng(build(depth, colour))).toThrow(/bit depth/);
  });

  it.each([
    [16, 3],
    [4, 2],
    [1, 6],
    [2, 4],
  ])('rejects depth %i paired with colour type %i', (depth, colour) => {
    // Each field is individually legal; the combination is not.
    expect(() => decodePng(build(depth, colour))).toThrow(/bit depth/);
  });

  it('rejects an unknown interlace method', () => {
    expect(() => decodePng(build(8, 0, 2))).toThrow(/interlace/);
  });

  it('rejects a palette image with no PLTE chunk', () => {
    const png = buildPng({ depth: 8, colour: 0, sample: () => [0] });
    png[25] = 3;
    expect(() => decodePng(png)).toThrow(/PLTE/);
  });

  it('rejects a palette index the PLTE chunk does not define', () => {
    const png = buildPng({
      depth: 8,
      colour: 3,
      palette: [0, 0, 0, 255, 255, 255],
      sample: () => [7],
    });
    expect(() => decodePng(png)).toThrow(/palette index/);
  });

  it('rejects image data shorter than the header declares', () => {
    // Truncated data would not hang — past the end a typed array yields
    // `undefined`, which coerces to zero — but it would invent grey pixels and
    // report success. Saying so is the difference between a decode error and a
    // silently wrong image.
    const short = buildPng({ depth: 8, colour: 0, sample: () => [0] });
    const full = decodePng(short);
    expect(full.pixels.length).toBe(reference.width * reference.height * 4);

    const truncated = buildPng({ depth: 8, colour: 0, sample: () => [0] });
    // Halve the declared height's worth of data by claiming twice the height.
    const doubled = reference.height * 2;
    truncated[20] = (doubled >>> 24) & 0xff;
    truncated[21] = (doubled >>> 16) & 0xff;
    truncated[22] = (doubled >>> 8) & 0xff;
    truncated[23] = doubled & 0xff;
    expect(() => decodePng(truncated)).toThrow(/shorter than declared/);
  });
});

describe('malformed ancillary chunks', () => {
  it('ignores a tRNS chunk too short for its colour type', () => {
    // Reading past a short chunk yields `undefined`, which coerces to zero —
    // and zero is black, the one value a QR code cannot afford to lose. A
    // half-read key would turn every dark module transparent, composite it to
    // white, and produce a blank image rather than an error.
    const png = buildPng({
      depth: 8,
      colour: 0,
      trns: [0],
      sample: (x, y) => [isLight(x, y) ? 255 : 0],
    });

    const { pixels } = decodePng(png);
    const alphas = new Set<number>();
    for (let i = 3; i < pixels.length; i += 4) alphas.add(pixels[i]);
    expect(alphas).toEqual(new Set([255]));
    expect(scan(png).text).toBe(PAYLOAD);
  });
});
