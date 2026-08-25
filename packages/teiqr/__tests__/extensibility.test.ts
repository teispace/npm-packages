import { afterEach, describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import {
  getPayloadType,
  isPayloadComplete,
  PAYLOAD_GROUPS,
  PAYLOAD_TYPES,
  registerPayloadType,
  serializePayload,
  unregisterPayloadType,
} from '../src/payload/index.js';
import { parsePayload, registerPayloadParser } from '../src/payload/parse.js';
import { val } from '../src/payload/types.js';
import { DEFAULT_STYLE } from '../src/render/types.js';
import {
  BUILTIN_RULES,
  registerValidationRule,
  unregisterValidationRule,
  validate,
} from '../src/validate/index.js';

describe('validation rules are extensible', () => {
  afterEach(() => {
    unregisterValidationRule('house-min-ecc');
  });

  it('runs a registered rule alongside the built-ins', () => {
    registerValidationRule({
      id: 'house-min-ecc',
      description: 'Printed codes must be level Q or better.',
      check: ({ matrix }) =>
        matrix.ecc === 'L' || matrix.ecc === 'M'
          ? {
              level: 'error',
              code: 'ecc-too-low',
              title: 'Raise error correction',
              detail: 'Company policy requires level Q or H.',
            }
          : null,
    });

    const weak = validate(encode('x', { ecc: 'L', boostEcc: false }), DEFAULT_STYLE);
    expect(weak.issues.some((i) => i.code === 'ecc-too-low')).toBe(true);
    expect(weak.score).toBeLessThan(100);

    const strong = validate(encode('x', { ecc: 'H', boostEcc: false }), DEFAULT_STYLE);
    expect(strong.issues.some((i) => i.code === 'ecc-too-low')).toBe(false);
  });

  it('can disable a built-in rule by id', () => {
    const style = { ...DEFAULT_STYLE, quietZone: 0 };
    const withRule = validate(encode('x'), style);
    expect(withRule.issues.some((i) => i.code === 'quiet-zone')).toBe(true);

    const without = validate(encode('x'), style, { disableRules: ['quiet-zone'] });
    expect(without.issues.some((i) => i.code === 'quiet-zone')).toBe(false);
    expect(without.score).toBe(100);
  });

  it('can replace the rule set entirely', () => {
    const only = validate(
      encode('x'),
      { ...DEFAULT_STYLE, quietZone: 0 },
      {
        rules: BUILTIN_RULES.filter((r) => r.id === 'contrast'),
      },
    );
    expect(only.issues).toHaveLength(0);
  });

  it('accepts custom score weightings', () => {
    const style = { ...DEFAULT_STYLE, quietZone: 2 }; // one warning
    expect(validate(encode('x'), style).score).toBe(85);
    expect(validate(encode('x'), style, { penalties: { warning: 50 } }).score).toBe(50);
    expect(validate(encode('x'), style, { penalties: { warning: 0 } }).score).toBe(100);
  });

  it('still exposes the derived measurements custom rules need', () => {
    const seen: string[] = [];
    validate(encode('x'), DEFAULT_STYLE, {
      rules: [
        {
          id: 'probe',
          description: 'records what the context carries',
          check(context) {
            seen.push(
              typeof context.contrast,
              typeof context.inverted,
              typeof context.print.recommendedSideMm,
              typeof context.matrix.version,
              typeof context.scanDistanceMm,
            );
            return null;
          },
        },
      ],
    });
    expect(seen).toEqual(['number', 'boolean', 'number', 'number', 'number']);
  });
});

describe('payload types are extensible', () => {
  afterEach(() => {
    unregisterPayloadType('asset');
  });

  it('registers a custom type that behaves like a built-in', () => {
    const before = PAYLOAD_TYPES.length;
    registerPayloadType({
      id: 'asset',
      label: 'Asset tag',
      group: 'plain',
      blurb: 'Opens the internal asset register.',
      fields: [{ name: 'id', label: 'Asset ID', type: 'text', required: true }],
      serialize: (v) => `ASSET:${val(v, 'id')}`,
      sample: { id: 'A-1024' },
    });

    expect(PAYLOAD_TYPES.length).toBe(before + 1);
    expect(getPayloadType('asset')?.label).toBe('Asset tag');
    expect(serializePayload('asset', { id: 'A-7' })).toBe('ASSET:A-7');
    expect(isPayloadComplete('asset', { id: 'A-7' })).toBe(true);
    expect(isPayloadComplete('asset', {})).toBe(false);
    // It shows up in the grouped view a UI would render from.
    expect(
      PAYLOAD_GROUPS.find((g) => g.group === 'plain')?.types.some((t) => t.id === 'asset'),
    ).toBe(true);
    // And it encodes.
    expect(() => encode(serializePayload('asset', { id: 'A-7' }))).not.toThrow();
  });

  it('removes a custom type cleanly', () => {
    registerPayloadType({
      id: 'asset',
      label: 'Asset tag',
      group: 'plain',
      blurb: '',
      fields: [{ name: 'id', label: 'ID', type: 'text' }],
      serialize: (v) => `ASSET:${val(v, 'id')}`,
      sample: { id: 'x' },
    });
    expect(unregisterPayloadType('asset')).toBe(true);
    expect(getPayloadType('asset')).toBeUndefined();
    expect(
      PAYLOAD_GROUPS.find((g) => g.group === 'plain')?.types.some((t) => t.id === 'asset'),
    ).toBe(false);
    expect(unregisterPayloadType('asset')).toBe(false);
  });
});

describe('a custom type and parser complete the clone loop', () => {
  afterEach(() => unregisterPayloadType('asset'));

  it('serialises, encodes, parses back, and re-serialises identically', () => {
    registerPayloadType({
      id: 'asset',
      label: 'Asset tag',
      group: 'plain',
      blurb: 'Opens the internal asset register.',
      fields: [{ name: 'id', label: 'Asset ID', type: 'text', required: true }],
      serialize: (v) => `ASSET:${val(v, 'id')}`,
      sample: { id: 'A-1024' },
    });
    registerPayloadParser({
      type: 'asset',
      parse: (text) => (text.startsWith('ASSET:') ? { id: text.slice(6) } : null),
    });

    const original = serializePayload('asset', { id: 'A-1024' });
    const parsed = parsePayload(original);
    expect(parsed.type).toBe('asset');
    expect(parsed.label).toBe('Asset tag');
    expect(parsed.values.id).toBe('A-1024');
    expect(serializePayload(parsed.type, parsed.values)).toBe(original);
  });
});
