import { describe, expect, it } from 'vitest';
import {
  fitToolbar,
  type ToolbarSlot,
  visibleSlots,
} from '../../src/react/components/toolbar-fit.js';

// a b | c | D(stays) e, More
const slots: ToolbarSlot[] = [
  { kind: 'entry', group: 0, order: 0 },
  { kind: 'entry', group: 0, order: 1 },
  { kind: 'separator', group: 1 },
  { kind: 'entry', group: 1, order: 2 },
  { kind: 'separator', group: 2 },
  { kind: 'entry', group: 2 },
  { kind: 'entry', group: 2, order: 3 },
  { kind: 'more', group: 3 },
];
const widths = [10, 10, 1, 10, 1, 10, 10, 10];

describe('visibleSlots', () => {
  it('shows everything but More when all movable entries stay', () => {
    expect(visibleSlots(slots, 4)).toEqual([true, true, true, true, true, true, true, false]);
  });

  it('drops the separator of a group left empty, keeps the one before what stays', () => {
    expect(visibleSlots(slots, 2)).toEqual([true, true, false, false, true, true, false, true]);
  });

  it('starts with no separator when the first groups are all moved', () => {
    expect(visibleSlots(slots, 0)).toEqual([false, false, false, false, false, true, false, true]);
  });
});

describe('fitToolbar', () => {
  it('keeps all when they fit, without room for More', () => {
    // 10+10+1+10+1+10+10 = 52, six gaps of 2.
    expect(fitToolbar(slots, widths, 64, 2)).toBe(4);
  });

  it('moves from the end, counting the More button and the gaps', () => {
    // Keeping c with More costs what showing everything does (64), so c goes too.
    expect(fitToolbar(slots, widths, 63, 2)).toBe(2);
    // a b | D More: 41 + 4 gaps.
    expect(fitToolbar(slots, widths, 49, 2)).toBe(2);
    // a | D More: 31 + 3 gaps.
    expect(fitToolbar(slots, widths, 48, 2)).toBe(1);
    expect(fitToolbar(slots, widths, 37, 2)).toBe(1);
    expect(fitToolbar(slots, widths, 36, 2)).toBe(0);
  });

  it('moves everything it can when nothing fits', () => {
    expect(fitToolbar(slots, widths, 0, 2)).toBe(0);
  });

  it('allows half a pixel of subpixel rounding', () => {
    expect(fitToolbar(slots, widths, 63.5, 2)).toBe(4);
  });
});
