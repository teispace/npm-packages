import { describe, expect, it } from 'vitest';
import { buildShapeMask } from '../../../src/services/favicon/shapes';

describe('buildShapeMask', () => {
  it('emits a square SVG with the given size', () => {
    const svg = buildShapeMask('square', 64, 0);
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="64"');
    expect(svg).toContain('height="64"');
    expect(svg).toContain('fill="white"');
  });

  it('emits a circle SVG centered at half-size', () => {
    const svg = buildShapeMask('circle', 100, 0);
    expect(svg).toContain('<circle');
    expect(svg).toContain('cx="50"');
    expect(svg).toContain('cy="50"');
    expect(svg).toContain('r="50"');
  });

  it('emits a rounded rect with radius derived from percent', () => {
    const svg = buildShapeMask('rounded', 100, 25);
    expect(svg).toContain('rx="25"');
    expect(svg).toContain('ry="25"');
  });

  it('emits a path for squircle', () => {
    const svg = buildShapeMask('squircle', 100, 0);
    expect(svg).toContain('<path');
    expect(svg).toContain('d="');
  });

  it('always emits a self-contained SVG document', () => {
    for (const shape of ['square', 'rounded', 'circle', 'squircle'] as const) {
      const svg = buildShapeMask(shape, 32, 20);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
    }
  });
});
