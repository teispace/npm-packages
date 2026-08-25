import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { encodeMicro } from '../src/core/micro.js';
import { encodeRmqr } from '../src/core/rmqr.js';
import type { QrMatrix } from '../src/core/types.js';
import { PAYLOAD_TYPES, serializePayload } from '../src/payload/index.js';
import { decodePng } from '../src/raster/png.js';
import { toPng } from '../src/raster/scene-raster.js';
import { renderSvg } from '../src/render/svg.js';
import type { ModuleShape } from '../src/render/types.js';
import { DEFAULT_STYLE } from '../src/render/types.js';
import { validate } from '../src/validate/index.js';
import { tryScan } from '../src/verify/api.js';
import { decodeMatrix } from '../src/verify/decode-matrix.js';
import { binarize } from '../src/verify/scan.js';

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

describe('SVG rendering', () => {
  it('produces well-formed SVG for every module shape', () => {
    const matrix = encode('https://example.com');
    for (const moduleShape of SHAPES) {
      const { svg, widthPx, heightPx } = renderSvg(matrix, { moduleShape });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).toContain('viewBox="0 0');
      expect(widthPx).toBeGreaterThan(0);
      expect(heightPx).toBe(widthPx);
      // No unbalanced tags: every opened element closes.
      const opens = (svg.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
      const closes = (svg.match(/<\/[a-zA-Z]|\/>/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it('sizes the viewBox to the module count plus both quiet zones', () => {
    const matrix = encode('A');
    const { svg } = renderSvg(matrix, { quietZone: 4 });
    expect(svg).toContain(`viewBox="0 0 ${matrix.size + 8} ${matrix.size + 8}"`);
  });

  it('emits stable gradient ids across identical renders', () => {
    const matrix = encode('gradient stability');
    const style = {
      body: {
        kind: 'linear' as const,
        angle: 45,
        stops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#333333' },
        ],
      },
    };
    const a = renderSvg(matrix, style).svg;
    const b = renderSvg(matrix, style).svg;
    expect(a).toBe(b);
    expect(a).toContain('<linearGradient');
  });

  it('escapes user-supplied text in frame labels', () => {
    const matrix = encode('escaping');
    const { svg } = renderSvg(matrix, {
      frame: {
        style: 'label-bottom',
        text: '<script>&"',
        textColor: '#fff',
        background: '#000',
        border: 1,
        cornerRadius: 2,
        fontFamily: 'sans-serif',
      },
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;&amp;&quot;');
  });
});

describe('validation', () => {
  it('gives a clean default style a perfect score', () => {
    const result = validate(encode('https://example.com'), DEFAULT_STYLE);
    expect(result.score).toBe(100);
    expect(result.issues.filter((i) => i.level !== 'info')).toHaveLength(0);
  });

  it('errors on unreadable contrast', () => {
    const result = validate(encode('x'), {
      ...DEFAULT_STYLE,
      body: { kind: 'solid', color: '#888888' },
      background: { kind: 'solid', color: '#8a8a8a' },
    });
    expect(result.issues.some((i) => i.code === 'contrast-low' && i.level === 'error')).toBe(true);
  });

  it('errors when a logo destroys more than error correction can recover', () => {
    const result = validate(encode('https://example.com', { ecc: 'L', boostEcc: false }), {
      ...DEFAULT_STYLE,
      logo: {
        href: 'data:image/png;base64,',
        sizeRatio: 0.5,
        padding: 2,
        shape: 'square',
        excavate: true,
        background: null,
      },
    });
    expect(result.issues.some((i) => i.level === 'error')).toBe(true);
    expect(result.coverage?.recoverable).toBe(false);
  });
});

describe('payloads', () => {
  it('serialises every built-in type from its own sample', () => {
    expect(PAYLOAD_TYPES.length).toBeGreaterThanOrEqual(26);
    for (const type of PAYLOAD_TYPES) {
      const text = serializePayload(type.id, type.sample);
      expect(text.length, `${type.id} produced an empty payload`).toBeGreaterThan(0);
      // Every sample must actually encode.
      expect(() => encode(text)).not.toThrow();
    }
  });

  it('has unique type ids', () => {
    const ids = PAYLOAD_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the rendered image is the matrix, module for module', () => {
  // The check that matters most and is easiest to skip. Asserting that a PNG
  // has valid magic bytes, or that an SVG has the right viewBox, says nothing
  // about whether the modules inside are the ones the encoder produced — and
  // for a long time they were not: every symbol was drawn with three
  // QR-style eyes at the QR corner positions, which on an 11-module Micro QR
  // painted three overlapping finders across the data, and on rMQR drew no
  // finder at all because its 5x5 sub-finder has no eye shape. Both rendered
  // cleanly. Neither could be scanned.

  /** Sample the rendered PNG back at each module centre. */
  const rendered = (matrix: QrMatrix, scale = 8): Uint8Array => {
    const image = decodePng(toPng(matrix, {}, { scale, background: '#ffffff' }));
    const cols = matrix.width ?? matrix.size;
    const rows = matrix.height ?? matrix.size;
    const quiet = (image.width - cols * scale) / 2;
    const dark = binarize(image.pixels, image.width, image.height);
    const out = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = Math.floor(quiet + (x + 0.5) * scale);
        const py = Math.floor(quiet + (y + 0.5) * scale);
        out[y * cols + x] = dark[py * image.width + px];
      }
    }
    return out;
  };

  const cases: [string, QrMatrix][] = [
    ['QR', encode('https://example.com')],
    ['Micro QR M1', encodeMicro('12345')],
    ['Micro QR M4', encodeMicro('hello world', { version: 'M4' })],
    ['rMQR R7x43', encodeRmqr('12345', { version: 'R7x43' })],
    ['rMQR R13x99', encodeRmqr('HELLO WORLD 123', { version: 'R13x99' })],
  ];

  for (const [label, matrix] of cases) {
    it(`reproduces every module of a ${label} symbol`, () => {
      const pixels = rendered(matrix);
      let wrong = 0;
      for (let i = 0; i < matrix.modules.length; i++) {
        if (pixels[i] !== matrix.modules[i]) wrong++;
      }
      expect(wrong, `${label}: ${wrong} of ${matrix.modules.length} modules differ`).toBe(0);
    });
  }

  it('scans back what it rendered, for all three symbologies', () => {
    for (const [label, matrix] of cases) {
      const image = decodePng(toPng(matrix, {}, { scale: 8, background: '#ffffff' }));
      const result = tryScan({ data: image.pixels, width: image.width, height: image.height });
      expect(result?.text, label).toBe(decodeMatrix(matrix).text);
    }
  });
});
