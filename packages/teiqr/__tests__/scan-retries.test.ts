import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { decodePng } from '../src/raster/png.js';
import { toPng } from '../src/raster/scene-raster.js';
import { scan, tryScan } from '../src/verify/api.js';
import { binarize } from '../src/verify/binarize.js';
import { findFinders } from '../src/verify/finder.js';
import { decodeLocation, groupFinders } from '../src/verify/scan.js';

/**
 * The retry ladder, and what each rung is for.
 *
 * `scanPixels` does not give up after one threshold. It tries a local one, a
 * global one, then the image at half size and at double size, and the rungs
 * exist because they were each measured to recover symbols the others do not.
 * These tests pin the two things that are easy to break silently: that a rung
 * still recovers the case it was added for, and that a symbol found on a
 * resized copy is still described in the caller's own coordinates.
 *
 * Every case here first checks that the single-pass route genuinely fails.
 * Without that check a test like this passes whether or not the retry exists,
 * which makes it decorative — and this suite has been bitten by exactly that
 * shape of test before.
 */

interface Image {
  data: Uint8Array;
  width: number;
  height: number;
}

const render = (text: string, scale: number): Image => {
  const image = decodePng(
    toPng(encode(text, {}), {}, { scale, background: '#ffffff', quietZone: 4 }),
  );
  return { data: image.pixels, width: image.width, height: image.height };
};

/**
 * Resample by a non-integer factor, taking the nearest source pixel.
 *
 * This is the thing a camera does that a renderer never does: modules stop
 * being a whole number of pixels wide, so a run that should be three pixels
 * long is sometimes four. That is what defeats the finder scanner's ratio
 * test at small sizes, and it cannot be reproduced by rendering at a smaller
 * scale — an integer scale keeps every run exact.
 */
const resample = (source: Image, factor: number): Image => {
  const width = Math.round(source.width * factor);
  const height = Math.round(source.height * factor);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.floor(x / factor));
      const sy = Math.min(source.height - 1, Math.floor(y / factor));
      const from = (sy * source.width + sx) * 4;
      const to = (y * width + x) * 4;
      data[to] = source.data[from];
      data[to + 1] = source.data[from + 1];
      data[to + 2] = source.data[from + 2];
      data[to + 3] = 255;
    }
  }
  return { data, width, height };
};

/** Decode without the retry ladder: one threshold, one pass. */
const singlePass = (image: Image, options?: { global: boolean }) => {
  const dark = binarize(image.data, image.width, image.height, options);
  for (const location of groupFinders(findFinders(dark, image.width, image.height))) {
    try {
      return decodeLocation(dark, image.width, image.height, location);
    } catch {
      // Try the next grouping.
    }
  }
  return null;
};

describe('the doubling retry', () => {
  // Each of these fails both thresholds at full size and reads once enlarged.
  const cases: { text: string; scale: number; factor: number }[] = [
    { text: 'DOUBLING PROBE', scale: 4, factor: 0.42 },
    { text: 'DOUBLING PROBE', scale: 4, factor: 0.55 },
    { text: 'https://example.com/a-longer-payload-here', scale: 4, factor: 0.42 },
  ];

  for (const { text, scale, factor } of cases) {
    const image = resample(render(text, scale), factor);
    const label = `${text.slice(0, 16)} at ${image.width}x${image.height}`;

    it(`is genuinely needed for ${label}`, () => {
      // The premise. If either of these ever starts passing the test above
      // stops proving anything, and should be given a harder image rather
      // than quietly left in place.
      expect(singlePass(image)).toBeNull();
      expect(singlePass(image, { global: true })).toBeNull();
    });

    it(`recovers ${label}`, () => {
      expect(tryScan({ data: image.data, width: image.width, height: image.height })?.text).toBe(
        text,
      );
    });
  }
});

describe('geometry after a resized retry', () => {
  /**
   * A symbol recovered from an enlarged copy was reporting its pitch and
   * position in the enlarged image's coordinates, so both came back at twice
   * their real value — and the half-size rung had the same bug in the other
   * direction, which is how it went unnoticed for so long. The decoded text is
   * unaffected, so nothing failed; a caller drawing an overlay from `origin`
   * simply drew it in the wrong place, and only for the images that needed a
   * retry.
   */
  const text = 'DOUBLING PROBE';
  const scale = 4;
  const factor = 0.42;
  const image = resample(render(text, scale), factor);

  it('reports the module pitch in the caller’s pixels', () => {
    const result = scan({ data: image.data, width: image.width, height: image.height });
    // The rendered pitch is `scale` pixels, resampled by `factor`.
    const expected = scale * factor;
    expect(result.moduleSize).toBeGreaterThan(expected * 0.6);
    expect(result.moduleSize).toBeLessThan(expected * 1.6);
  });

  it('reports an origin inside the image it was given', () => {
    const result = scan({ data: image.data, width: image.width, height: image.height });
    expect(result.origin.x).toBeGreaterThanOrEqual(0);
    expect(result.origin.y).toBeGreaterThanOrEqual(0);
    expect(result.origin.x).toBeLessThan(image.width);
    expect(result.origin.y).toBeLessThan(image.height);
  });
});

describe('frames with nothing in them', () => {
  /**
   * The resizing rungs are gated on having seen at least one finder-shaped
   * run at full size, because behind a camera the empty frame is the common
   * case and it runs ten times a second. There is no way to assert "did not
   * do the expensive thing" without a timer, and a timing assertion in CI is
   * a flake — so what is pinned here is the observable half: an empty frame
   * produces no finder candidates at all, which is the condition the gate
   * reads.
   */
  it('sees no finder candidates in a blank frame', () => {
    const blank = new Uint8Array(320 * 240 * 4);
    blank.fill(200);
    for (let i = 3; i < blank.length; i += 4) blank[i] = 255;
    expect(findFinders(binarize(blank, 320, 240), 320, 240)).toHaveLength(0);
    expect(tryScan({ data: blank, width: 320, height: 240 })).toBeNull();
  });

  it('sees no finder candidates in high-frequency noise', () => {
    const width = 320;
    const height = 240;
    const noise = new Uint8Array(width * height * 4);
    let seed = 7;
    for (let i = 0; i < width * height; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const value = ((seed >> 16) & 0xff) < 128 ? 30 : 220;
      noise[i * 4] = value;
      noise[i * 4 + 1] = value;
      noise[i * 4 + 2] = value;
      noise[i * 4 + 3] = 255;
    }
    expect(findFinders(binarize(noise, width, height), width, height)).toHaveLength(0);
    expect(tryScan({ data: noise, width, height })).toBeNull();
  });
});
