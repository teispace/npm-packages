import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { encodeMicro } from '../src/core/micro.js';
import { encodeRmqr } from '../src/core/rmqr.js';
import { decodePng } from '../src/raster/png.js';
import { toPng } from '../src/raster/scene-raster.js';
import { scan, tryScan } from '../src/verify/api.js';
import {
  quadrilateralToQuadrilateral,
  sampleGrid,
  transformPoint,
} from '../src/verify/perspective.js';

/** Render to RGBA pixels the way a camera frame would arrive. */
const pixelsOf = (matrix: Parameters<typeof toPng>[0], scale = 8) => {
  const image = decodePng(toPng(matrix, {}, { scale, background: '#ffffff' }));
  return { data: image.pixels, width: image.width, height: image.height };
};

/**
 * Re-project an image through a homography, the way an off-axis photograph
 * of a flat surface is projected onto a sensor.
 *
 * Destination pixels are inverse-mapped into the source and sampled, so no
 * destination pixel is ever left unwritten — the forward direction would leave
 * holes wherever the transform stretches.
 */
const warp = (
  source: { data: Uint8Array; width: number; height: number },
  corners: [number, number][],
): { data: Uint8Array; width: number; height: number } => {
  const { width: sw, height: sh } = source;
  // Destination canvas large enough to hold every corner, with margin.
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const width = Math.ceil(Math.max(...xs)) + 20;
  const height = Math.ceil(Math.max(...ys)) + 20;

  // Destination -> source, so every output pixel gets a value.
  const inverse = quadrilateralToQuadrilateral(
    corners[0][0],
    corners[0][1],
    corners[1][0],
    corners[1][1],
    corners[2][0],
    corners[2][1],
    corners[3][0],
    corners[3][1],
    0,
    0,
    sw,
    0,
    sw,
    sh,
    0,
    sh,
  );

  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = transformPoint(inverse, x + 0.5, y + 0.5);
      const sx = Math.floor(point.x);
      const sy = Math.floor(point.y);
      const target = (y * width + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
      const from = (sy * sw + sx) * 4;
      data[target] = source.data[from];
      data[target + 1] = source.data[from + 1];
      data[target + 2] = source.data[from + 2];
      data[target + 3] = 255;
    }
  }
  return { data, width, height };
};

describe('the perspective transform itself', () => {
  it('maps the unit square onto the corners it was built from', () => {
    const t = quadrilateralToQuadrilateral(
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      10,
      20,
      110,
      30,
      100,
      140,
      20,
      120,
    );
    const round = (p: { x: number; y: number }) => [Math.round(p.x), Math.round(p.y)];
    expect(round(transformPoint(t, 0, 0))).toEqual([10, 20]);
    expect(round(transformPoint(t, 1, 0))).toEqual([110, 30]);
    expect(round(transformPoint(t, 1, 1))).toEqual([100, 140]);
    expect(round(transformPoint(t, 0, 1))).toEqual([20, 120]);
  });

  it('handles a parallelogram, where the projective terms vanish', () => {
    // The affine special case exists because the general formula divides by a
    // determinant that is zero here — the case a flat, rendered symbol hits.
    const t = quadrilateralToQuadrilateral(0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 10, 0, 10, 10, 0, 10);
    expect(t.a13).toBe(0);
    expect(t.a23).toBe(0);
    expect(transformPoint(t, 0.5, 0.5)).toEqual({ x: 5, y: 5 });
  });

  it('is its own inverse when composed with the reverse mapping', () => {
    const forward = quadrilateralToQuadrilateral(
      0,
      0,
      20,
      0,
      20,
      20,
      0,
      20,
      5,
      7,
      95,
      15,
      88,
      105,
      12,
      92,
    );
    const back = quadrilateralToQuadrilateral(
      5,
      7,
      95,
      15,
      88,
      105,
      12,
      92,
      0,
      0,
      20,
      0,
      20,
      20,
      0,
      20,
    );
    for (const [x, y] of [
      [3, 4],
      [10, 10],
      [17, 2],
    ]) {
      const round = transformPoint(
        back,
        transformPoint(forward, x, y).x,
        transformPoint(forward, x, y).y,
      );
      expect(round.x).toBeCloseTo(x, 6);
      expect(round.y).toBeCloseTo(y, 6);
    }
  });

  it('refuses a grid that falls outside the image rather than sampling garbage', () => {
    const dark = new Uint8Array(100);
    const outside = quadrilateralToQuadrilateral(
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      500,
      500,
      600,
      500,
      600,
      600,
      500,
      600,
    );
    expect(sampleGrid(dark, 10, 10, 4, 4, outside)).toBeNull();
  });
});

describe('scanning a symbol photographed off-axis', () => {
  const text = 'https://example.com/perspective-check';

  it('reads a symbol under a mild perspective tilt', () => {
    const flat = pixelsOf(encode(text));
    const { width: w, height: h } = flat;
    // Top edge pushed away from the camera: the far edge is shorter.
    const tilted = warp(flat, [
      [30, 10],
      [w - 30, 10],
      [w, h],
      [0, h],
    ]);
    expect(scan(tilted).text).toBe(text);
  });

  it('reads a symbol tilted the other way, and about a different axis', () => {
    const flat = pixelsOf(encode(text));
    const { width: w, height: h } = flat;
    const leaning = warp(flat, [
      [0, 0],
      [w, 25],
      [w, h - 25],
      [0, h],
    ]);
    expect(scan(leaning).text).toBe(text);
  });

  it('reads a larger symbol, where the alignment pattern carries the correction', () => {
    // Version 1 has no alignment pattern and falls back to an extrapolated
    // corner; from version 2 up the fourth correspondence is measured, which
    // is what keeps sampling honest across a wide symbol.
    const payload = `${text}/${'0'.repeat(200)}`;
    const big = encode(payload);
    expect(big.version).toBeGreaterThan(2);
    const flat = pixelsOf(big, 6);
    const { width: w, height: h } = flat;
    const tilted = warp(flat, [
      [40, 12],
      [w - 40, 12],
      [w, h],
      [0, h],
    ]);
    expect(scan(tilted).text).toBe(payload);
  });

  it('still reads a perfectly flat symbol, which is the affine case', () => {
    expect(scan(pixelsOf(encode(text))).text).toBe(text);
  });

  it('returns null rather than nonsense when the tilt is too extreme to resolve', () => {
    const flat = pixelsOf(encode(text));
    const { width: w, height: h } = flat;
    // Collapsed almost to a line: the finder ratios no longer hold.
    const collapsed = warp(flat, [
      [0, 0],
      [w, h / 2 - 2],
      [w, h / 2 + 2],
      [0, h],
    ]);
    expect(tryScan(collapsed)).toBeNull();
  });
});

describe('locating Micro QR and rMQR in an image', () => {
  it('finds and reads a Micro QR symbol from pixels', () => {
    for (const payload of ['12345', 'HELLO', 'hello world']) {
      const result = tryScan(pixelsOf(encodeMicro(payload)));
      expect(result?.text, payload).toBe(payload);
    }
  });

  it('finds and reads an rMQR symbol from pixels', () => {
    for (const payload of ['SERIAL-4417', 'HELLO WORLD 123']) {
      const result = tryScan(pixelsOf(encodeRmqr(payload)));
      expect(result?.text, payload).toBe(payload);
    }
  });

  it('reads a rotated Micro QR symbol', () => {
    const flat = pixelsOf(encodeMicro('12345'));
    const { width: w, height: h } = flat;
    // A quarter turn: the single finder moves to another corner, which is the
    // whole difficulty of locating Micro QR compared with QR.
    const turned = warp(flat, [
      [0, h],
      [0, 0],
      [w, 0],
      [w, h],
    ]);
    expect(tryScan(turned)?.text).toBe('12345');
  });
});

describe('compact symbologies under rotation and tilt', () => {
  /** Rotate a quarter turn clockwise, swapping the canvas dimensions with it. */
  const quarterTurn = (source: { data: Uint8Array; width: number; height: number }) =>
    warp(source, [
      [source.height, 0],
      [source.height, source.width],
      [0, source.width],
      [0, 0],
    ]);

  it('reads a rotated rMQR symbol', () => {
    // Worth stating why the corners look like that: a rectangular symbol
    // turned a quarter turn needs a canvas whose dimensions are swapped too.
    // Reusing the square-image corners squashes it back to the original aspect
    // ratio, which is a rotation *and* an anisotropic scale — something no
    // similarity transform can represent, and a test failure that says nothing
    // about the code.
    const flat = pixelsOf(encodeRmqr('SERIAL-4417'));
    expect(tryScan(quarterTurn(flat))?.text).toBe('SERIAL-4417');
  });

  it('reads a rotated Micro QR symbol at every version', () => {
    for (const [payload, version] of [
      ['12345', 'M1'],
      ['HELLO', 'M2'],
      ['hello', 'M3'],
      ['hello world', 'M4'],
    ] as const) {
      const flat = pixelsOf(encodeMicro(payload, { version }));
      expect(tryScan(quarterTurn(flat))?.text, version).toBe(payload);
    }
  });

  it('reads a tilted rMQR symbol, using its sub-finder as a second point', () => {
    // The finder alone gives position and scale measured across seven modules.
    // Pairing it with the sub-finder in the opposite corner measures both over
    // the symbol's whole diagonal, which is what makes a tilt survivable.
    const flat = pixelsOf(encodeRmqr('SERIAL-4417'));
    const { width: w, height: h } = flat;
    const tilted = warp(flat, [
      [w * 0.06, h * 0.1],
      [w * 0.94, h * 0.1],
      [w, h],
      [0, h],
    ]);
    expect(tryScan(tilted)?.text).toBe('SERIAL-4417');
  });

  it('reads a tilted Micro QR symbol', () => {
    const flat = pixelsOf(encodeMicro('HELLO'));
    const { width: w, height: h } = flat;
    const tilted = warp(flat, [
      [w * 0.06, h * 0.1],
      [w * 0.94, h * 0.1],
      [w, h],
      [0, h],
    ]);
    expect(tryScan(tilted)?.text).toBe('HELLO');
  });

  it('does not pretend to read a wide rMQR symbol under real perspective', () => {
    // The honest boundary. Two points fix position, scale and rotation, and
    // that is a similarity transform — it cannot express foreshortening. On a
    // 99-module-wide symbol the mismatch accumulates past a module long before
    // the far end. Reading it would need four correspondences, and rMQR's
    // remaining landmarks are a handful of modules in the other two corners,
    // too small to locate reliably. Returning nothing is the right answer;
    // returning a wrong payload would not be.
    const payload = 'HELLO WORLD 123';
    const flat = pixelsOf(encodeRmqr(payload, { version: 'R13x99' }));
    const { width: w, height: h } = flat;
    const tilted = warp(flat, [
      [w * 0.06, h * 0.1],
      [w * 0.94, h * 0.1],
      [w, h],
      [0, h],
    ]);
    const result = tryScan(tilted);
    expect(result === null || result.text === payload).toBe(true);
  });
});
