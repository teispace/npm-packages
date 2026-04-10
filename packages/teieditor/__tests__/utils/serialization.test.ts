import { describe, expect, it } from 'vitest';
import type { SerializationFormat } from '../../src/utils/serialization.js';

describe('Serialization Types', () => {
  it('SerializationFormat accepts valid formats', () => {
    const formats: SerializationFormat[] = ['html', 'markdown', 'json', 'text'];
    expect(formats).toHaveLength(4);
  });
});

// Note: Full serialize/deserialize tests require a mounted Lexical editor
// which needs a DOM environment with LexicalComposer. These are integration
// tests that would be better suited for a browser/e2e test setup.
// The unit tests here validate the types and exports.

describe('Serialization exports', () => {
  it('exports serialize function', async () => {
    const mod = await import('../../src/utils/serialization.js');
    expect(typeof mod.serialize).toBe('function');
    expect(typeof mod.deserialize).toBe('function');
    expect(typeof mod.$serialize).toBe('function');
    expect(typeof mod.$deserialize).toBe('function');
  });
});

describe('Utils barrel exports', () => {
  it('exports all utilities', async () => {
    const mod = await import('../../src/utils/index.js');
    expect(typeof mod.toggleFormat).toBe('function');
    expect(typeof mod.serialize).toBe('function');
    expect(typeof mod.deserialize).toBe('function');
    expect(typeof mod.$serialize).toBe('function');
    expect(typeof mod.$deserialize).toBe('function');
  });
});
