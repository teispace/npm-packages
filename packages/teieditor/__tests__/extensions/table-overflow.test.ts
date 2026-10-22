import { describe, expect, it } from 'vitest';
import { overflowEdges } from '../../src/extensions/table/overflow.js';

const box = (scrollLeft: number, scrollWidth = 600, clientWidth = 400) => ({
  scrollLeft,
  scrollWidth,
  clientWidth,
});

describe('table scroll edges', () => {
  it('a table that fits has none', () => {
    expect(overflowEdges(box(0, 400))).toBe('');
    expect(overflowEdges(box(0, 401))).toBe('');
  });

  it('left to right: more to the right, then both, then the left', () => {
    expect(overflowEdges(box(0))).toBe('right');
    expect(overflowEdges(box(100))).toBe('left right');
    expect(overflowEdges(box(200))).toBe('left');
    // Sub-pixel scroll positions count as the edge.
    expect(overflowEdges(box(0.5))).toBe('right');
    expect(overflowEdges(box(199.5))).toBe('left');
  });

  it('right to left scrolls negative: the start is on the right', () => {
    expect(overflowEdges(box(-0))).toBe('right');
    expect(overflowEdges(box(-100))).toBe('left right');
    expect(overflowEdges(box(-200))).toBe('right');
  });
});
