import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { qr } from '../src/index.js';
import { kanjiTableSize } from '../src/kanji.js';
import { toPng } from '../src/raster/scene-raster.js';
import { scan } from '../src/verify/api.js';

/**
 * These tests are the evidence behind the "runs anywhere" claim.
 *
 * The package must work in Cloudflare Workers, Deno, Bun and browsers, none of
 * which provide `Buffer`, and none of which provide a DOM in the Worker case.
 * Rather than asserting that from reading the source, the globals those
 * runtimes lack are made to throw, and the whole pipeline is exercised against
 * that. Anything that reaches for a Node-only or DOM-only global fails loudly.
 */
const withoutGlobals = <T>(names: string[], fn: () => T): T => {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const name of names) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        throw new ReferenceError(`${name} is not available in this runtime`);
      },
    });
  }
  try {
    return fn();
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  }
};

const NODE_ONLY = ['Buffer'];
const DOM_ONLY = ['document', 'window', 'HTMLCanvasElement', 'Image'];

describe('runs without Node-only globals', () => {
  it('encodes', () => {
    withoutGlobals(NODE_ONLY, () => {
      expect(encode('https://example.com').version).toBeGreaterThan(0);
    });
  });

  it('renders SVG', () => {
    withoutGlobals([...NODE_ONLY, ...DOM_ONLY], () => {
      expect(qr('https://example.com').svg()).toContain('<svg');
    });
  });

  it('produces PNG bytes', () => {
    withoutGlobals([...NODE_ONLY, ...DOM_ONLY], () => {
      const png = toPng(encode('no Buffer here'), {}, { scale: 6, background: '#ffffff' });
      expect(Array.from(png.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });
  });

  it('produces a base64 data URL', () => {
    withoutGlobals([...NODE_ONLY, ...DOM_ONLY], () => {
      // btoa, not Buffer.toString('base64').
      expect(qr('data url').dataUrl({ scale: 4 })).toMatch(/^data:image\/png;base64,/);
    });
  });

  it('scans a PNG back', () => {
    const png = toPng(encode('round trip without Buffer'), {}, { scale: 8, background: '#ffffff' });
    withoutGlobals([...NODE_ONLY, ...DOM_ONLY], () => {
      expect(scan(png).text).toBe('round trip without Buffer');
    });
  });

  it('decodes a base64 data URL without Buffer', () => {
    const url = qr('from a data url').dataUrl({ scale: 8, background: '#ffffff' });
    withoutGlobals([...NODE_ONLY, ...DOM_ONLY], () => {
      expect(scan(url).text).toBe('from a data url');
    });
  });

  it('unpacks the Kanji table with atob rather than Buffer', () => {
    withoutGlobals([...NODE_ONLY, ...DOM_ONLY], () => {
      expect(kanjiTableSize()).toBe(6953);
    });
  });

  it('validates and renders to a terminal', () => {
    withoutGlobals([...NODE_ONLY, ...DOM_ONLY], () => {
      const code = qr('https://example.com');
      expect(code.validate().score).toBe(100);
      expect(code.terminal()).toContain('█');
    });
  });

  it('verifies end to end with no Node or DOM globals at all', () => {
    withoutGlobals([...NODE_ONLY, ...DOM_ONLY], () => {
      expect(qr('provably scannable').verify().text).toBe('provably scannable');
    });
  });
});
