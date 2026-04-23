import { beforeEach, describe, expect, it } from 'vitest';
import {
  ensureCursorTracker,
  getLastPointerPosition,
  resetCursorTracker,
} from '../src/core/cursor-tracker';

beforeEach(() => {
  resetCursorTracker();
});

describe('cursor tracker', () => {
  it('starts with no position', () => {
    expect(getLastPointerPosition()).toBeNull();
  });

  it('captures the pointerdown position', () => {
    ensureCursorTracker();
    const event = new window.PointerEvent('pointerdown', {
      clientX: 42,
      clientY: 84,
    });
    document.dispatchEvent(event);
    expect(getLastPointerPosition()).toEqual({ x: 42, y: 84 });
  });

  it('updates on subsequent pointerdowns', () => {
    ensureCursorTracker();
    document.dispatchEvent(new window.PointerEvent('pointerdown', { clientX: 1, clientY: 1 }));
    document.dispatchEvent(new window.PointerEvent('pointerdown', { clientX: 100, clientY: 200 }));
    expect(getLastPointerPosition()).toEqual({ x: 100, y: 200 });
  });

  it('ensureCursorTracker is idempotent (does not add duplicate listeners)', () => {
    ensureCursorTracker();
    ensureCursorTracker();
    ensureCursorTracker();
    document.dispatchEvent(new window.PointerEvent('pointerdown', { clientX: 5, clientY: 6 }));
    expect(getLastPointerPosition()).toEqual({ x: 5, y: 6 });
  });
});
