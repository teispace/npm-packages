import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { encodeMicro } from '../src/core/micro.js';
import { encodeRmqr } from '../src/core/rmqr.js';
import { decodePng } from '../src/raster/png.js';
import { toPng } from '../src/raster/scene-raster.js';
import { tryScan } from '../src/verify/api.js';
import { binarize } from '../src/verify/binarize.js';
import { findFinders } from '../src/verify/finder.js';
import { groupFinders } from '../src/verify/scan.js';

/**
 * Symbols captured the wrong way round.
 *
 * A code photographed through glass, reflected off a mirror, or printed on the
 * inside of a shop window arrives reversed, and until this was fixed none of
 * the three symbologies could read one. The failure was quiet in the worst
 * way: the symbol located perfectly and then failed Reed-Solomon, because
 * every landmark the locator uses — three finders at the corners of a square,
 * timing along both row six and column six, alignment positions drawn from the
 * same list in each axis — survives the reflection unchanged. On a real
 * photograph the sampled grid scored 0 of 243 function modules wrong while the
 * payload was unrecoverable under all thirty-two combinations of level and
 * mask, which is what pointed at mirroring in the first place.
 */

interface Image {
  data: Uint8Array;
  width: number;
  height: number;
}

const render = (matrix: Parameters<typeof toPng>[0]): Image => {
  const image = decodePng(toPng(matrix, {}, { scale: 8, background: '#ffffff', quietZone: 4 }));
  return { data: image.pixels, width: image.width, height: image.height };
};

/** Reflect an image through one axis, leaving its dimensions alone. */
const reflect = (source: Image, axis: 'x' | 'y'): Image => {
  const { width, height } = source;
  const data = new Uint8Array(source.data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = axis === 'x' ? width - 1 - x : x;
      const sy = axis === 'y' ? height - 1 - y : y;
      const from = (sy * width + sx) * 4;
      const to = (y * width + x) * 4;
      data[to] = source.data[from];
      data[to + 1] = source.data[from + 1];
      data[to + 2] = source.data[from + 2];
      data[to + 3] = 255;
    }
  }
  return { data, width, height };
};

const symbologies: { name: string; text: string; matrix: () => Parameters<typeof toPng>[0] }[] = [
  { name: 'QR', text: 'MIRROR PROBE', matrix: () => encode('MIRROR PROBE', {}) },
  { name: 'Micro QR', text: '12345', matrix: () => encodeMicro('12345', {}) },
  { name: 'rMQR', text: 'MIRROR', matrix: () => encodeRmqr('MIRROR', {}) },
];

describe.each(symbologies)('a mirrored $name symbol', ({ text, matrix }) => {
  const upright = render(matrix());

  it('still reads the right way round', () => {
    // The premise: if this ever fails the fixture is broken, not the feature.
    expect(tryScan(upright)?.text).toBe(text);
  });

  it('reads reflected left to right', () => {
    expect(tryScan(reflect(upright, 'x'))?.text).toBe(text);
  });

  it('reads reflected top to bottom', () => {
    expect(tryScan(reflect(upright, 'y'))?.text).toBe(text);
  });
});

describe('why a mirrored symbol used to fail', () => {
  /**
   * The point of this one is that locating is *not* where the problem was, so
   * a future change that "fixes" location will not have fixed anything. A
   * reflected QR symbol still yields three finder candidates that still group
   * into one symbol — everything up to the payload looks right.
   */
  it('locates a reflected QR symbol exactly as well as an upright one', () => {
    const upright = render(encode('MIRROR PROBE', {}));
    const mirrored = reflect(upright, 'x');
    const groupsIn = (image: Image) =>
      groupFinders(
        findFinders(binarize(image.data, image.width, image.height), image.width, image.height),
      ).length;
    expect(groupsIn(mirrored)).toBe(groupsIn(upright));
    expect(groupsIn(mirrored)).toBeGreaterThan(0);
  });
});
