import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { clone, qr } from '../src/index.js';
import { serializePayload } from '../src/payload/index.js';
import { parsePayload } from '../src/payload/parse.js';
import { decodePng } from '../src/raster/png.js';
import { rasterize, toPng } from '../src/raster/scene-raster.js';
import type { EyeBallShape, EyeFrameShape, ModuleShape } from '../src/render/types.js';
import { scan } from '../src/verify/api.js';
import { NotFoundError, scanPixels } from '../src/verify/scan.js';

/** Render to PNG, decode the PNG, then scan it as a reader would. */
const roundTripThroughPng = (text: string, style = {}, scale = 10) => {
  const png = toPng(encode(text), style, { scale, background: '#ffffff' });
  const image = decodePng(png);
  return scanPixels(image.pixels, image.width, image.height);
};

const SHAPES: ModuleShape[] = [
  'square',
  'dot',
  'rounded',
  'extra-rounded',
  'classy',
  'diamond',
  'star',
  'vertical',
  'horizontal',
  'fluid',
];
const EYE_FRAMES: EyeFrameShape[] = ['square', 'rounded', 'circle', 'leaf', 'cut', 'dotted'];
const EYE_BALLS: EyeBallShape[] = ['square', 'dot', 'rounded', 'leaf', 'diamond'];

describe('end-to-end: encode → render → PNG → scan', () => {
  it('recovers the payload from a plain rendered PNG', () => {
    const text = 'https://example.com/end-to-end';
    const result = roundTripThroughPng(text);
    expect(result.text).toBe(text);
    expect(result.corrected).toBe(0);
  });

  it('recovers the payload for every module shape', () => {
    const text = 'https://example.com/shapes';
    for (const moduleShape of SHAPES) {
      const result = roundTripThroughPng(text, { moduleShape });
      expect(result.text, `moduleShape=${moduleShape}`).toBe(text);
    }
  });

  it('recovers the payload for every eye treatment', () => {
    const text = 'EYE SHAPE TEST 123';
    for (const eyeFrame of EYE_FRAMES) {
      for (const eyeBall of EYE_BALLS) {
        const result = roundTripThroughPng(text, { eyeFrame, eyeBall });
        expect(result.text, `${eyeFrame}/${eyeBall}`).toBe(text);
      }
    }
  });

  it('recovers the payload through gradients', () => {
    const text = 'gradient body';
    const result = roundTripThroughPng(text, {
      body: {
        kind: 'linear' as const,
        angle: 45,
        stops: [
          { offset: 0, color: '#001133' },
          { offset: 1, color: '#003366' },
        ],
      },
    });
    expect(result.text).toBe(text);
  });

  it('recovers the payload at small scales', () => {
    const text = 'small scale';
    for (const scale of [3, 4, 6, 8, 20]) {
      expect(roundTripThroughPng(text, {}, scale).text, `scale=${scale}`).toBe(text);
    }
  });

  it('measures the module pitch it actually rendered at', () => {
    const result = roundTripThroughPng('module pitch', {}, 12);
    expect(result.moduleSize).toBeGreaterThan(11.5);
    expect(result.moduleSize).toBeLessThan(12.5);
  });

  it('recovers a symbol rendered with a gap between modules', () => {
    const text = 'gapped modules';
    expect(roundTripThroughPng(text, { gap: 0.15 }).text).toBe(text);
  });

  it('reports when there is no symbol to find', () => {
    const blank = new Uint8Array(100 * 100 * 4).fill(255);
    expect(() => scanPixels(blank, 100, 100)).toThrow(NotFoundError);
  });

  it('produces pixels and PNG of consistent dimensions', () => {
    const matrix = encode('dimensions');
    const raster = rasterize(matrix, {}, { scale: 7 });
    const png = decodePng(toPng(matrix, {}, { scale: 7 }));
    expect(png.width).toBe(raster.width);
    expect(png.height).toBe(raster.height);
    expect(raster.width).toBe((matrix.size + 8) * 7);
  });

  it('honours an exact output width', () => {
    const matrix = encode('exact width');
    const { width, height } = rasterize(matrix, {}, { width: 512 });
    expect(width).toBe(512);
    expect(height).toBe(512);
  });

  it('reports omitted features rather than silently dropping them', () => {
    const matrix = encode('labelled');
    const { omitted } = rasterize(
      matrix,
      {
        frame: {
          style: 'label-bottom',
          text: 'SCAN ME',
          textColor: '#fff',
          background: '#000',
          border: 1,
          cornerRadius: 2,
          fontFamily: 'sans-serif',
        },
      },
      { scale: 8 },
    );
    expect(omitted.some((o) => o.includes('label'))).toBe(true);
  });
});

describe('rasteriser fidelity', () => {
  it('renders square modules pixel-exactly, with no bleed at boundaries', () => {
    const matrix = encode('https://example.com/pixel-exact');
    const scale = 10;
    const quiet = 4;
    const { pixels, width } = rasterize(
      matrix,
      { moduleShape: 'square', quietZone: quiet, gap: 0 },
      { scale, background: '#ffffff' },
    );

    let checked = 0;
    for (let my = 0; my < matrix.size; my++) {
      for (let mx = 0; mx < matrix.size; mx++) {
        const expected = matrix.modules[my * matrix.size + mx] === 1;
        // Sample all four corners plus the centre of the module's pixel block.
        // A rasteriser that bled across module edges would fail at the corners.
        const px0 = (quiet + mx) * scale;
        const py0 = (quiet + my) * scale;
        for (const [dx, dy] of [
          [1, 1],
          [scale - 2, 1],
          [1, scale - 2],
          [scale - 2, scale - 2],
          [scale >> 1, scale >> 1],
        ]) {
          const i = ((py0 + dy) * width + (px0 + dx)) * 4;
          const isDark = pixels[i] < 128;
          expect(isDark, `module (${mx},${my}) at offset (${dx},${dy})`).toBe(expected);
          checked++;
        }
      }
    }
    expect(checked).toBe(matrix.size * matrix.size * 5);
  });

  it('leaves the quiet zone completely clear', () => {
    const matrix = encode('quiet zone');
    const scale = 8;
    const quiet = 4;
    const { pixels, width, height } = rasterize(
      matrix,
      { quietZone: quiet },
      { scale, background: '#ffffff' },
    );
    const band = quiet * scale;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inQuiet = x < band || y < band || x >= width - band || y >= height - band;
        if (!inQuiet) continue;
        const i = (y * width + x) * 4;
        expect(pixels[i], `quiet zone pixel (${x},${y})`).toBe(255);
      }
    }
  });

  it('produces a fully opaque image when a background is given', () => {
    const { pixels } = rasterize(encode('opaque'), {}, { scale: 6, background: '#ffffff' });
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
  });

  it('keeps the background transparent when none is given', () => {
    const { pixels } = rasterize(encode('transparent'), { background: null }, { scale: 6 });
    // The very first pixel is quiet zone, so it must be fully transparent.
    expect(pixels[3]).toBe(0);
  });
});

describe('clone() edits fields without discarding the rest', () => {
  // The API is "scan this and change one thing". Serialising only the fields
  // the caller passed silently emptied every other field, so cloning a WiFi
  // code to change its password produced a code with no SSID — which then no
  // longer even parsed as WiFi, because the parser requires one.
  const wifi = () =>
    qr(
      serializePayload('wifi', {
        ssid: 'Pokhara Cafe',
        password: 'himalaya2026',
        encryption: 'WPA',
      }),
    ).png({ scale: 6 });

  it('keeps the fields it was not asked to change', () => {
    const updated = clone(wifi(), {}, { password: 'new-password' });
    const parsed = parsePayload(updated.verify().text);

    expect(parsed.type).toBe('wifi');
    expect(parsed.values.ssid).toBe('Pokhara Cafe');
    expect(parsed.values.encryption).toBe('WPA');
    expect(parsed.values.password).toBe('new-password');
  });

  it('clears a field when one is explicitly set to undefined', () => {
    // Distinguishing "leave this alone" from "remove this" is the reason the
    // overlay is spread rather than filtered.
    const updated = clone(wifi(), {}, { password: undefined });
    const parsed = parsePayload(updated.verify().text);
    expect(parsed.values.ssid).toBe('Pokhara Cafe');
    expect(parsed.values.password).toBeUndefined();
  });

  it('leaves the payload byte-identical when no fields are given', () => {
    const source = wifi();
    const original = scan(source).text;
    expect(clone(source, { moduleShape: 'dot' }).verify().text).toBe(original);
  });

  it('preserves every field of a larger payload through an edit', () => {
    const card = qr(
      serializePayload('vcard', {
        firstName: 'Ada',
        lastName: 'Lovelace',
        org: 'Analytical Engines',
        title: 'Mathematician',
        email: 'ada@example.com',
        phone: '+441234567890',
      }),
    ).png({ scale: 6 });

    const parsed = parsePayload(clone(card, {}, { title: 'Programmer' }).verify().text);
    expect(parsed.values.firstName).toBe('Ada');
    expect(parsed.values.lastName).toBe('Lovelace');
    expect(parsed.values.org).toBe('Analytical Engines');
    expect(parsed.values.email).toBe('ada@example.com');
    expect(parsed.values.phone).toBe('+441234567890');
    expect(parsed.values.title).toBe('Programmer');
  });
});
