import { describe, expect, it, vi } from 'vitest';
import { resolveTarget } from '../src/core/dom';

describe('resolveTarget', () => {
  it('returns the matched element for a valid selector', () => {
    expect(resolveTarget('html')).toBe(document.documentElement);
  });

  it('returns documentElement when the selector does not match', () => {
    expect(resolveTarget('#does-not-exist')).toBe(document.documentElement);
  });

  it('returns documentElement when the selector is invalid (DOMException)', () => {
    // Force querySelector to throw, simulating a malformed user-provided selector.
    const orig = document.querySelector.bind(document);
    const spy = vi.spyOn(document, 'querySelector').mockImplementation(() => {
      throw new DOMException("'>>>' is not a valid selector", 'SyntaxError');
    });
    try {
      expect(resolveTarget('>>>')).toBe(document.documentElement);
    } finally {
      spy.mockRestore();
      void orig; // keep reference to avoid optimization
    }
  });
});
