import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { encodeMicro } from '../src/core/micro.js';
import { encodeRmqr } from '../src/core/rmqr.js';
import { decodePng } from '../src/raster/png.js';
import { toPng } from '../src/raster/scene-raster.js';
import { scan, tryScan } from '../src/verify/api.js';
import { binarize } from '../src/verify/binarize.js';
import { findFinders } from '../src/verify/finder.js';
import { decodeLocation, groupFinders } from '../src/verify/scan.js';

/**
 * Scanning things that are not clean.
 *
 * Every other scanner test in this package feeds it pixels it rendered itself:
 * exact colours, hard edges, uniform light. That flatters it. A photograph has
 * none of those, and the failure it produces is not a slightly wrong module —
 * it is half the symbol read as solid black because a shadow moved the global
 * histogram.
 *
 * These are simulations, not photographs, and worth being honest about: real
 * capture also brings motion blur, chromatic aberration, moiré against a
 * screen, and paper that is not flat. What is covered here is the part that is
 * reproducible — uneven light, defocus, sensor noise, and low contrast — which
 * is enough to prove the binariser does its job and to catch a regression that
 * would otherwise only show up on someone's desk.
 */

interface Image {
  data: Uint8Array;
  width: number;
  height: number;
}

const pixelsOf = (matrix: Parameters<typeof toPng>[0], scale = 8): Image => {
  const image = decodePng(toPng(matrix, {}, { scale, background: '#ffffff' }));
  return { data: image.pixels, width: image.width, height: image.height };
};

/**
 * Vary the light across the image: a multiplicative gain, plus additive
 * veiling light.
 *
 * Both halves are needed, and finding that out was the point. Gain alone —
 * "one side is darker" — does *not* defeat a global threshold, because ink at
 * zero stays at zero however much you scale it, so the two populations never
 * overlap and Otsu still separates them. What actually breaks a global
 * threshold is veiling light: glare off a laminate, a reflection, ambient
 * bounce. That *adds*, so ink on the bright side ends up lighter than paper on
 * the dark side, the histogram's two humps overlap, and no single cut exists.
 *
 * The first version of this file used gain alone and every case passed under a
 * global threshold, which would have made the whole suite decorative.
 */
const illuminate = (
  source: Image,
  options: {
    gainFrom?: number;
    gainTo?: number;
    veilFrom?: number;
    veilTo?: number;
    axis?: 'x' | 'y' | 'diagonal';
  },
): Image => {
  const { gainFrom = 1, gainTo = 1, veilFrom = 0, veilTo = 0, axis = 'x' } = options;
  const { width, height } = source;
  const data = Uint8Array.from(source.data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t =
        axis === 'x'
          ? x / (width - 1)
          : axis === 'y'
            ? y / (height - 1)
            : (x / (width - 1) + y / (height - 1)) / 2;
      const gain = gainFrom + (gainTo - gainFrom) * t;
      const veil = veilFrom + (veilTo - veilFrom) * t;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        data[i + c] = Math.max(0, Math.min(255, Math.round(data[i + c] * gain + veil)));
      }
    }
  }
  return { data, width, height };
};

/** A hard-edged shadow over one corner, which is the case a global threshold loses. */
const cornerShadow = (source: Image, fraction: number, darkness: number): Image => {
  const { width, height } = source;
  const data = Uint8Array.from(source.data);
  const cut = Math.round(width * fraction);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < cut; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * darkness);
    }
  }
  return { data, width, height };
};

/** A separable box blur, run twice, which approximates defocus well enough. */
const blur = (source: Image, radius: number): Image => {
  const { width, height } = source;
  let data = Uint8Array.from(source.data);

  for (let pass = 0; pass < 2; pass++) {
    const next = Uint8Array.from(data);
    // Horizontal.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let count = 0;
          for (let d = -radius; d <= radius; d++) {
            const sx = x + d;
            if (sx < 0 || sx >= width) continue;
            sum += data[(y * width + sx) * 4 + c];
            count++;
          }
          next[(y * width + x) * 4 + c] = Math.round(sum / count);
        }
      }
    }
    data = Uint8Array.from(next);
    // Vertical.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let count = 0;
          for (let d = -radius; d <= radius; d++) {
            const sy = y + d;
            if (sy < 0 || sy >= height) continue;
            sum += data[(sy * width + x) * 4 + c];
            count++;
          }
          next[(y * width + x) * 4 + c] = Math.round(sum / count);
        }
      }
    }
    data = next;
  }
  return { data, width, height };
};

/**
 * Additive noise from a fixed seed.
 *
 * Deterministic on purpose: a test that fails one run in twenty because it
 * rolled a bad seed teaches nobody anything, and gets deleted rather than
 * investigated.
 */
const noise = (source: Image, amplitude: number, seed = 12345): Image => {
  const { width, height } = source;
  const data = Uint8Array.from(source.data);
  let state = seed >>> 0;
  const next = () => {
    // xorshift32, so the sequence is the same on every platform.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 2001) / 1000 - 1;
  };
  for (let i = 0; i < width * height; i++) {
    const delta = Math.round(next() * amplitude);
    for (let c = 0; c < 3; c++) {
      const at = i * 4 + c;
      data[at] = Math.max(0, Math.min(255, data[at] + delta));
    }
  }
  return { data, width, height };
};

/** Squeeze the tonal range, the way a photo of grey-on-grey printing arrives. */
const lowContrast = (source: Image, floor: number, ceiling: number): Image => {
  const { width, height } = source;
  const data = Uint8Array.from(source.data);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) {
      const at = i * 4 + c;
      data[at] = Math.round(floor + (data[at] / 255) * (ceiling - floor));
    }
  }
  return { data, width, height };
};

const TEXT = 'https://example.com/degradation-suite';

/** Scan an image forced through a single global threshold, for comparison. */
const scanGlobally = (image: Image): string | null => {
  const dark = binarize(image.data, image.width, image.height, { global: true });
  for (const location of groupFinders(findFinders(dark, image.width, image.height))) {
    try {
      return decodeLocation(dark, image.width, image.height, location).text;
    } catch {
      // Try the next grouping.
    }
  }
  return null;
};

describe('uneven lighting', () => {
  // The case that motivated the local threshold, and the one a global
  // threshold cannot survive: with the histogram's two humps overlapping there
  // is no single cut that separates ink from paper anywhere in the image.
  const flat = pixelsOf(encode(TEXT));

  // Shade on one side and glare on the other, which is what puts the two
  // humps of the histogram on top of each other: the brightest ink (under the
  // glare) ends up lighter than the darkest paper (in the shade), so no single
  // cut separates them anywhere. Every direction is covered because the fill
  // pass used to be biased towards one, and only testing both sides found it.
  const cases: [string, Image][] = [
    ['shade left, glare right', illuminate(flat, { gainFrom: 0.3, veilTo: 90 })],
    ['glare left, shade right', illuminate(flat, { gainTo: 0.3, veilFrom: 90 })],
    ['the same on a diagonal', illuminate(flat, { gainFrom: 0.35, veilTo: 100, axis: 'diagonal' })],
    ['the same top to bottom', illuminate(flat, { gainFrom: 0.3, veilTo: 90, axis: 'y' })],
    ['a hard-edged shadow over a third of it', cornerShadow(flat, 0.35, 0.4)],
  ];

  for (const [label, image] of cases) {
    it(`reads through ${label}`, () => {
      expect(scan(image).text).toBe(TEXT);
    });
  }

  it('is the local threshold doing the work, not luck', () => {
    // The load-bearing assertion of this whole file. Every case above must be
    // one a global threshold genuinely fails, or the suite is decorative —
    // which is exactly what the first draft of it was: a purely multiplicative
    // gradient leaves ink at zero, so Otsu separates it perfectly and all five
    // "degraded" cases passed without a local threshold anywhere in sight.
    for (const [label, image] of cases) {
      expect(scanGlobally(image), `${label} should defeat a global threshold`).not.toBe(TEXT);
    }
  });
});

describe('defocus and noise', () => {
  const flat = pixelsOf(encode(TEXT), 10);

  it('reads a mildly out-of-focus capture', () => {
    expect(scan(blur(flat, 2)).text).toBe(TEXT);
  });

  it('reads through sensor noise', () => {
    expect(scan(noise(flat, 40)).text).toBe(TEXT);
  });

  it('reads through blur and noise together', () => {
    expect(scan(noise(blur(flat, 2), 25)).text).toBe(TEXT);
  });

  it('reads low-contrast printing', () => {
    // Mid-grey ink on light-grey card: the absolute values are nowhere near
    // black and white, so a fixed threshold would take everything.
    expect(scan(lowContrast(flat, 70, 200)).text).toBe(TEXT);
  });

  it('reads low contrast with a gradient over it', () => {
    expect(scan(illuminate(lowContrast(flat, 60, 190), { gainFrom: 0.55, veilTo: 40 })).text).toBe(
      TEXT,
    );
  });

  it('gives up rather than inventing an answer when blurred past legibility', () => {
    // Honest failure matters as much as success: a wrong payload returned
    // confidently is worse than none.
    const result = tryScan(blur(flat, 9));
    expect(result === null || result.text === TEXT).toBe(true);
  });
});

describe('degraded compact symbologies', () => {
  it('reads a Micro QR symbol under shade and glare', () => {
    const flat = pixelsOf(encodeMicro('12345'), 10);
    expect(tryScan(illuminate(flat, { gainFrom: 0.35, veilTo: 90 }))?.text).toBe('12345');
  });

  it('reads an rMQR symbol under shade and glare', () => {
    const flat = pixelsOf(encodeRmqr('SERIAL-4417'), 10);
    expect(tryScan(illuminate(flat, { gainTo: 0.35, veilFrom: 90 }))?.text).toBe('SERIAL-4417');
  });

  it('reads a Micro QR symbol through noise', () => {
    const flat = pixelsOf(encodeMicro('12345'), 10);
    expect(tryScan(noise(flat, 30))?.text).toBe('12345');
  });
});

describe('the binariser itself', () => {
  it('falls back to a global threshold on an image too small to block up', () => {
    // Under five blocks a side there is no neighbourhood to speak of, and a
    // 32-pixel image is a thumbnail rather than a photograph.
    const tiny = { data: new Uint8Array(32 * 32 * 4).fill(255), width: 32, height: 32 };
    expect(() => binarize(tiny.data, tiny.width, tiny.height)).not.toThrow();
  });

  it('agrees with the global threshold on clean rendered output', () => {
    // Local thresholding must not cost anything on the easy case, which is
    // most of what this library is asked to read.
    const flat = pixelsOf(encode(TEXT));
    const local = binarize(flat.data, flat.width, flat.height);
    const global = binarize(flat.data, flat.width, flat.height, { global: true });
    let differing = 0;
    for (let i = 0; i < local.length; i++) if (local[i] !== global[i]) differing++;
    expect(differing).toBe(0);
  });

  it('does not manufacture edges in a blank image', () => {
    // A flat block has no threshold of its own worth trusting. Reading noise
    // in the quiet zone as modules is how a scanner finds symbols that are
    // not there.
    const blank = { data: new Uint8Array(200 * 200 * 4).fill(255), width: 200, height: 200 };
    const dark = binarize(blank.data, blank.width, blank.height);
    expect(dark.every((v) => v === 0)).toBe(true);
  });

  it('treats a fully dark image as dark', () => {
    const black = new Uint8Array(200 * 200 * 4).fill(0);
    for (let i = 3; i < black.length; i += 4) black[i] = 255;
    const dark = binarize(black, 200, 200);
    expect(dark.every((v) => v === 1)).toBe(true);
  });

  it('composites transparency onto white before thresholding', () => {
    // A transparent PNG is what a browser canvas hands over, and treating
    // alpha as black would invert the whole symbol.
    const transparent = new Uint8Array(200 * 200 * 4);
    const dark = binarize(transparent, 200, 200);
    expect(dark.every((v) => v === 0)).toBe(true);
  });
});
