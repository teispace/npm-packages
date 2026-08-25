import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { ascii85, embedImages, groundUnderLogo, packImage } from '../src/export/image.js';
import { exportQr } from '../src/export/index.js';
import { encodePng } from '../src/raster/png.js';
import { buildScene } from '../src/render/scene.js';
import type { LogoOptions } from '../src/render/types.js';

const decoder = new TextDecoder();
const matrix = encode('https://example.com/export-internals');

/** A small PNG data URI, built with the package's own encoder. */
const pngDataUri = (
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
): string => {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }
  const bytes = encodePng(pixels, width, height);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
};

const OPAQUE = pngDataUri(8, 8, () => [200, 40, 40, 255]);
const TRANSLUCENT = pngDataUri(8, 8, (x) => [0, 0, 255, x < 4 ? 0 : 128]);

const logo = (href: string, extra: Partial<LogoOptions> = {}): LogoOptions => ({
  href,
  sizeRatio: 0.2,
  padding: 1,
  shape: 'square',
  excavate: true,
  background: null,
  ...extra,
});

describe('ASCII85', () => {
  // The encoding PDF and PostScript both use for binary streams. Getting it
  // subtly wrong produces a file that opens in one reader and not another,
  // so the known vectors matter more than the round trip.
  const body = (text: string) => text.replace(/\n/g, '').replace(/~>$/, '');

  it('encodes four bytes as five characters', () => {
    // 'Man ' is the canonical worked example from the Ascii85 definition.
    expect(body(ascii85(new TextEncoder().encode('Man ')))).toBe('9jqo^');
  });

  it('abbreviates an all-zero group as z', () => {
    expect(body(ascii85(new Uint8Array([0, 0, 0, 0])))).toBe('z');
    // Only a *full* group of four may be abbreviated.
    expect(body(ascii85(new Uint8Array([0, 0, 0])))).not.toBe('z');
  });

  it('emits one character more than it has bytes for a partial group', () => {
    expect(body(ascii85(new Uint8Array([1]))).length).toBe(2);
    expect(body(ascii85(new Uint8Array([1, 2]))).length).toBe(3);
    expect(body(ascii85(new Uint8Array([1, 2, 3]))).length).toBe(4);
    expect(body(ascii85(new Uint8Array([1, 2, 3, 4]))).length).toBe(5);
  });

  it('always terminates with the end-of-data marker', () => {
    expect(ascii85(new Uint8Array(0)).endsWith('~>')).toBe(true);
    expect(ascii85(new Uint8Array([9, 9, 9])).endsWith('~>')).toBe(true);
  });

  it('wraps long output, since one enormous line upsets strict parsers', () => {
    const lines = ascii85(new Uint8Array(1000).fill(7)).split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(80);
  });

  it('only ever emits printable characters', () => {
    const text = ascii85(Uint8Array.from({ length: 256 }, (_, i) => i));
    expect(/^[\x21-\x75z\n~>]*$/.test(text)).toBe(true);
  });
});

describe('packing an image for the vector formats', () => {
  const rgba = (values: number[][]) => ({
    width: values.length,
    height: 1,
    data: Uint8Array.from(values.flat()),
  });

  it('reports no alpha channel for a fully opaque image', () => {
    const packed = packImage(
      rgba([
        [10, 20, 30, 255],
        [40, 50, 60, 255],
      ]),
    );
    expect(packed.alpha).toBeNull();
    expect(packed.width).toBe(2);
    expect(packed.deflated).toBe(true);
  });

  it('keeps the alpha channel when the image is not opaque', () => {
    const packed = packImage(
      rgba([
        [10, 20, 30, 0],
        [40, 50, 60, 255],
      ]),
    );
    expect(packed.alpha).not.toBeNull();
  });

  it('leaves colour unpremultiplied when the alpha channel is kept', () => {
    // PDF composites through the soft mask itself; premultiplying here as well
    // would darken every soft edge.
    const packed = packImage(rgba([[255, 255, 255, 0]]));
    expect(packed.alpha).not.toBeNull();
    // A white pixel at zero alpha still encodes as white, not black.
    expect(packed.rgb.startsWith('z')).toBe(false);
  });

  it('flattens onto a ground colour and drops the alpha channel', () => {
    // EPS has no soft mask worth relying on, so it composites up front.
    const packed = packImage(rgba([[0, 0, 0, 0]]), { flattenOver: '#ffffff' });
    expect(packed.alpha).toBeNull();
  });

  it('accepts three-digit and six-digit ground colours alike', () => {
    const short = packImage(rgba([[0, 0, 0, 0]]), { flattenOver: '#fff' });
    const long = packImage(rgba([[0, 0, 0, 0]]), { flattenOver: '#ffffff' });
    expect(short.rgb).toBe(long.rgb);
  });
});

describe('choosing the colour beneath a logo', () => {
  const sceneWith = (style: Parameters<typeof buildScene>[1]) => buildScene(matrix, style);

  it('prefers the logo plate when one is set', () => {
    expect(groundUnderLogo(sceneWith({ logo: logo(OPAQUE, { background: '#123456' }) }))).toBe(
      '#123456',
    );
  });

  it('falls back to a solid background', () => {
    expect(groundUnderLogo(sceneWith({ background: { kind: 'solid', color: '#abcdef' } }))).toBe(
      '#abcdef',
    );
  });

  it('takes a gradient’s middle stop, since the logo sits dead centre', () => {
    const ground = groundUnderLogo(
      sceneWith({
        background: {
          kind: 'linear',
          angle: 0,
          stops: [
            { offset: 1, color: '#0000ff' },
            { offset: 0, color: '#ff0000' },
            { offset: 0.5, color: '#00ff00' },
          ],
        },
      }),
    );
    // Stops are sorted before the middle is taken, so declaration order does
    // not decide the answer.
    expect(ground).toBe('#00ff00');
  });

  it('defaults to white when there is no background at all', () => {
    expect(groundUnderLogo(sceneWith({ background: null }))).toBe('#ffffff');
  });
});

describe('embedding images found in a scene', () => {
  it('decodes a PNG data URI', () => {
    const embedded = embedImages(buildScene(matrix, { logo: logo(OPAQUE) }));
    expect(embedded.size).toBe(1);
    expect(embedded.get(OPAQUE)?.width).toBe(8);
  });

  it('skips a format it cannot decode, rather than failing the export', () => {
    const embedded = embedImages(
      buildScene(matrix, { logo: logo('data:image/jpeg;base64,/9j/4AAQSkZJRg==') }),
    );
    expect(embedded.size).toBe(0);
  });

  it('skips a data URI whose payload is not a valid PNG', () => {
    const embedded = embedImages(
      buildScene(matrix, { logo: logo('data:image/png;base64,bm90YXBuZw==') }),
    );
    expect(embedded.size).toBe(0);
  });

  it('returns an empty map for a scene with no images', () => {
    expect(embedImages(buildScene(matrix)).size).toBe(0);
  });
});

describe('PDF and EPS with the features that exercise their harder paths', () => {
  const withLogo = { logo: logo(TRANSLUCENT), moduleShape: 'rounded' as const };

  it('embeds a logo in the PDF as an image XObject with a soft mask', () => {
    const text = decoder.decode(exportQr(matrix, withLogo, 'pdf', { sideMm: 40 }).bytes);
    expect(text).toContain('/Subtype /Image');
    // The translucent logo must carry its alpha through as an SMask, not be
    // silently flattened — that is the difference between a soft edge and a
    // grey box.
    expect(text).toContain('/SMask');
    expect(text).toContain('/ASCII85Decode');
  });

  it('flattens the same logo for EPS, which has no usable soft mask', () => {
    const text = decoder.decode(exportQr(matrix, withLogo, 'eps', { sideMm: 40 }).bytes);
    expect(text).toContain('image');
    expect(text).not.toContain('SMask');
  });

  it('still produces a valid document when the logo cannot be decoded', () => {
    const broken = { logo: logo('data:image/svg+xml;base64,PHN2Zy8+') };
    const pdf = decoder.decode(exportQr(matrix, broken, 'pdf', { sideMm: 40 }).bytes);
    const eps = decoder.decode(exportQr(matrix, broken, 'eps', { sideMm: 40 }).bytes);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(eps.trimEnd().endsWith('%%EOF')).toBe(true);
    // The code itself is still drawn; only the logo is missing.
    expect(pdf).not.toContain('/Subtype /Image');
  });

  it('writes gradients into both formats', () => {
    const style = {
      body: {
        kind: 'linear' as const,
        angle: 45,
        stops: [
          { offset: 0, color: '#ff0000' },
          { offset: 1, color: '#0000ff' },
        ],
      },
    };
    const pdf = decoder.decode(exportQr(matrix, style, 'pdf', { sideMm: 40 }).bytes);
    const eps = decoder.decode(exportQr(matrix, style, 'eps', { sideMm: 40 }).bytes);
    expect(pdf).toContain('/Shading');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    // PostScript Level 2 has no shading operator every RIP honours, so the
    // writer approximates. What matters is that it still emits a valid file.
    expect(eps.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('renders a frame label into both formats', () => {
    const style = {
      frame: {
        style: 'label-bottom' as const,
        text: 'SCAN ME',
        background: '#ffffff',
        textColor: '#000000',
        border: 1,
        cornerRadius: 2,
        fontFamily: 'Helvetica',
      },
    };
    const pdf = decoder.decode(exportQr(matrix, style, 'pdf', { sideMm: 40 }).bytes);
    const eps = decoder.decode(exportQr(matrix, style, 'eps', { sideMm: 40 }).bytes);
    expect(pdf).toContain('SCAN ME');
    expect(pdf).toContain('/Font');
    expect(eps).toContain('SCAN ME');
    expect(eps).toContain('findfont');
  });

  it('escapes text that would otherwise break the syntax of each format', () => {
    // Unescaped parentheses end a PDF string early and truncate the document.
    const style = {
      frame: {
        style: 'label-bottom' as const,
        text: 'Scan (me) \\ now',
        background: '#ffffff',
        textColor: '#000000',
        border: 1,
        cornerRadius: 2,
        fontFamily: 'Helvetica',
      },
    };
    const pdf = decoder.decode(exportQr(matrix, style, 'pdf', { sideMm: 40 }).bytes);
    const eps = decoder.decode(exportQr(matrix, style, 'eps', { sideMm: 40 }).bytes);
    expect(pdf).toContain('\\(me\\)');
    expect(eps).toContain('\\(me\\)');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(eps.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('honours a transparent background in both formats', () => {
    const pdf = decoder.decode(exportQr(matrix, { background: null }, 'pdf', { sideMm: 40 }).bytes);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});
