import { afterEach, describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { toPng } from '../src/raster/scene-raster.js';
import { toPixels, toPixelsAsync } from '../src/verify/input.js';

/**
 * These cover the host-API branches — canvas, OffscreenCanvas,
 * createImageBitmap — that a Node test run never reaches on its own.
 *
 * Stubbing the globals is the point rather than a shortcut. What is under test
 * is this module's *dispatch*: which host feature it reaches for, in what
 * order, and what it does when one is missing. A real browser would exercise
 * exactly one of those paths per run and leave the rest unproven, and the
 * failure mode being guarded against is precisely the one that only shows up
 * in the environment nobody tested in.
 */

const g = globalThis as Record<string, unknown>;
const saved = new Map<string, unknown>();

/** Set a global for one test, remembering whether it existed at all. */
const stub = (name: string, value: unknown): void => {
  if (!saved.has(name)) saved.set(name, name in g ? g[name] : Symbol.for('absent'));
  g[name] = value;
};

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === Symbol.for('absent')) delete g[name];
    else g[name] = value;
  }
  saved.clear();
});

/** A 2d context that reports a known, checkable image. */
const fakeContext = (width: number, height: number, fill = 7) => {
  const calls: string[] = [];
  return {
    calls,
    context: {
      drawImage(_image: unknown, x: number, y: number) {
        calls.push(`drawImage(${x},${y})`);
      },
      getImageData(x: number, y: number, w: number, h: number) {
        calls.push(`getImageData(${x},${y},${w},${h})`);
        return { data: new Uint8ClampedArray(width * height * 4).fill(fill), width, height };
      },
    },
  };
};

describe('raw pixel input', () => {
  it('infers the channel count from the buffer length', () => {
    const rgba = toPixels({ data: new Uint8Array(4 * 4), width: 2, height: 2 });
    const rgb = toPixels({ data: new Uint8Array(3 * 4), width: 2, height: 2 });
    const gray = toPixels({ data: new Uint8Array(4), width: 2, height: 2 });
    for (const image of [rgba, rgb, gray]) {
      expect(image.pixels.length).toBe(2 * 2 * 4);
      expect(image.width).toBe(2);
    }
  });

  it('honours an explicit channel count over the inferred one', () => {
    // A 2x2 greyscale buffer is the same length as a 1x1 RGBA one, so an
    // explicit count has to win or the guess decides the geometry.
    const image = toPixels({
      data: new Uint8Array([10, 20, 30, 40]),
      width: 2,
      height: 2,
      channels: 1,
    });
    expect(image.pixels[0]).toBe(10);
    expect(image.pixels[3]).toBe(255);
  });
});

describe('drawable input', () => {
  it('draws through OffscreenCanvas when the host has one', () => {
    const { context, calls } = fakeContext(4, 3, 11);
    stub(
      'OffscreenCanvas',
      class {
        constructor(
          public w: number,
          public h: number,
        ) {}
        getContext() {
          return context;
        }
      },
    );

    const image = toPixels({ width: 4, height: 3 } as never);
    expect(image.width).toBe(4);
    expect(image.height).toBe(3);
    expect(image.pixels[0]).toBe(11);
    expect(calls).toEqual(['drawImage(0,0)', 'getImageData(0,0,4,3)']);
  });

  it('falls back to a document canvas when there is no OffscreenCanvas', () => {
    stub('OffscreenCanvas', undefined);
    const { context } = fakeContext(2, 2, 5);
    const canvas = { width: 0, height: 0, getContext: () => context };
    stub('document', { createElement: () => canvas });

    const image = toPixels({ width: 2, height: 2 } as never);
    expect(image.pixels[0]).toBe(5);
    // The canvas must be sized before drawing, or the draw is clipped away.
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(2);
  });

  it('prefers naturalWidth, then videoWidth, then width', () => {
    // An <img> reports naturalWidth, a <video> videoWidth, a canvas width.
    // Reading the wrong one gives a zero-sized draw and a blank scan.
    const { context } = fakeContext(9, 9);
    stub(
      'OffscreenCanvas',
      class {
        constructor(
          public w: number,
          public h: number,
        ) {}
        getContext() {
          return context;
        }
      },
    );
    const image = toPixels({
      naturalWidth: 9,
      naturalHeight: 9,
      videoWidth: 3,
      videoHeight: 3,
      width: 1,
      height: 1,
    } as never);
    expect(image.width).toBe(9);
  });

  it('rejects a drawable with no dimensions', () => {
    expect(() => toPixels({ width: 0, height: 0 } as never)).toThrow(TypeError);
  });

  it('rejects a drawable when the host offers no canvas at all', () => {
    stub('OffscreenCanvas', undefined);
    stub('document', undefined);
    expect(() => toPixels({ width: 4, height: 4 } as never)).toThrow(/Could not interpret/);
  });

  it('rejects a drawable when the canvas yields no 2d context', () => {
    stub('OffscreenCanvas', undefined);
    stub('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => null }),
    });
    expect(() => toPixels({ width: 4, height: 4 } as never)).toThrow(TypeError);
  });
});

describe('encoded bytes this package cannot decode natively', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);

  it('explains what to do instead, rather than failing opaquely', () => {
    expect(() => toPixels(jpeg)).toThrow(/scanAsync\(\)/);
  });

  it('stays synchronous even where a canvas exists, since decoding is not', () => {
    // createImageBitmap is async, so the synchronous path cannot use it even
    // when the host provides it. Reporting that honestly beats blocking.
    stub(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      },
    );
    stub('createImageBitmap', () => Promise.resolve({}));
    expect(() => toPixels(jpeg)).toThrow(/Unsupported image format/);
  });

  it('decodes through createImageBitmap asynchronously', async () => {
    const { context } = fakeContext(6, 6, 3);
    stub(
      'OffscreenCanvas',
      class {
        constructor(
          public w: number,
          public h: number,
        ) {}
        getContext() {
          return context;
        }
      },
    );
    stub('createImageBitmap', async () => ({ width: 6, height: 6 }));

    const image = await toPixelsAsync(jpeg);
    expect(image.width).toBe(6);
    expect(image.pixels[0]).toBe(3);
  });

  it('accepts a base64 data URL through the async path too', async () => {
    const { context } = fakeContext(2, 2, 4);
    stub(
      'OffscreenCanvas',
      class {
        constructor(
          public w: number,
          public h: number,
        ) {}
        getContext() {
          return context;
        }
      },
    );
    stub('createImageBitmap', async () => ({ width: 2, height: 2 }));

    const url = `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`;
    expect((await toPixelsAsync(url)).width).toBe(2);
  });

  it('rethrows the original error when the host cannot help', async () => {
    stub('createImageBitmap', undefined);
    await expect(toPixelsAsync(jpeg)).rejects.toThrow(/Unsupported image format/);
  });

  it('rethrows when the bitmap cannot be drawn', async () => {
    stub('OffscreenCanvas', undefined);
    stub('document', undefined);
    stub('createImageBitmap', async () => ({ width: 4, height: 4 }));
    await expect(toPixelsAsync(jpeg)).rejects.toThrow(TypeError);
  });

  it('passes PNG straight through, without touching the host at all', async () => {
    stub('createImageBitmap', () => {
      throw new Error('should not be called for PNG');
    });
    const png = toPng(encode('native png path'), {}, { scale: 4, background: '#ffffff' });
    expect((await toPixelsAsync(png)).width).toBeGreaterThan(0);
  });
});
