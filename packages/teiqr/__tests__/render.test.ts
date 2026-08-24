import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { PAYLOAD_TYPES, serializePayload } from '../src/payload/index.js';
import { renderSvg } from '../src/render/svg.js';
import type { ModuleShape } from '../src/render/types.js';
import { DEFAULT_STYLE } from '../src/render/types.js';
import { validate } from '../src/validate/index.js';

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
