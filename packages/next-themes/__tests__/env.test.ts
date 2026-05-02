import { afterEach, describe, expect, it, vi } from 'vitest';
import { localAdapter } from '../src/adapters/local';
import {
  hasDocumentCookie,
  hasLocalStorage,
  hasMatchMedia,
  hasSessionStorage,
  hasWindowEvents,
  isDom,
} from '../src/core/env';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('env probes', () => {
  it('isDom is true in jsdom', () => {
    expect(isDom()).toBe(true);
  });

  it('hasMatchMedia is true in jsdom', () => {
    expect(hasMatchMedia()).toBe(true);
  });

  it('hasLocalStorage is true in jsdom', () => {
    expect(hasLocalStorage()).toBe(true);
  });

  it('hasSessionStorage is true in jsdom', () => {
    expect(hasSessionStorage()).toBe(true);
  });

  it('hasDocumentCookie is true in jsdom', () => {
    expect(hasDocumentCookie()).toBe(true);
  });

  it('hasWindowEvents is true in jsdom', () => {
    expect(hasWindowEvents()).toBe(true);
  });

  it('hasLocalStorage rejects a partial shim missing getItem (Node 25 case)', () => {
    // Simulate Node 25: localStorage exists but getItem is not a function.
    const partial = { setItem: () => {} } as unknown as Storage;
    vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue(partial);
    expect(hasLocalStorage()).toBe(false);
  });

  it('hasLocalStorage rejects a partial shim missing setItem', () => {
    const partial = { getItem: () => null } as unknown as Storage;
    vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue(partial);
    expect(hasLocalStorage()).toBe(false);
  });

  it('hasLocalStorage handles a throwing accessor gracefully', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(hasLocalStorage()).toBe(false);
  });
});

describe('localAdapter on a Node 25-like environment', () => {
  it('returns null instead of crashing when localStorage is a partial shim', () => {
    const partial = { setItem: () => {} } as unknown as Storage;
    vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue(partial);
    const a = localAdapter({ key: 'theme', cookie: { name: 'theme' } });
    expect(a.get()).toBeNull();
    expect(() => a.set('dark')).not.toThrow();
  });

  it('returns null when localStorage access throws (sandboxed iframe)', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    const a = localAdapter({ key: 'theme', cookie: { name: 'theme' } });
    expect(a.get()).toBeNull();
    expect(() => a.set('dark')).not.toThrow();
  });
});
