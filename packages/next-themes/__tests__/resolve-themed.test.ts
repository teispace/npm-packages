import { describe, expect, it } from 'vitest';
import { resolveThemedValue } from '../src/components/resolve-themed';

describe('resolveThemedValue', () => {
  it('prefers the resolved theme key', () => {
    expect(resolveThemedValue({ light: 'L', dark: 'D' }, 'dark', 'system')).toBe('D');
  });

  it('falls back to the raw selection (e.g. "system")', () => {
    expect(resolveThemedValue({ system: 'S', light: 'L' }, 'missing', 'system')).toBe('S');
  });

  it('uses the explicit fallback when no theme key matches', () => {
    expect(resolveThemedValue({ light: 'L' }, 'dark', 'dark', 'FB')).toBe('FB');
  });

  it('uses the first declared entry as the last resort', () => {
    expect(resolveThemedValue({ light: 'L', dark: 'D' }, 'x', 'x')).toBe('L');
  });

  it('returns undefined for an empty map with no fallback', () => {
    expect(resolveThemedValue({}, 'light', 'light')).toBeUndefined();
  });

  it('tolerates undefined resolvedTheme/theme', () => {
    expect(resolveThemedValue({ light: 'L' }, undefined, undefined)).toBe('L');
  });
});
