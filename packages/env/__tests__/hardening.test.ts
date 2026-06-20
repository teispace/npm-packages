import { describe, expect, expectTypeOf, it } from 'vitest';
import { e, json, number, port, string } from '../src/coercers.js';
import { defineEnv } from '../src/define-env.js';
import { formatEnvErrors } from '../src/errors.js';
import { withMeta } from '../src/standard-schema.js';
import type { OutputOf, StandardSchemaV1, Validator } from '../src/types.js';

function value<T>(v: Validator<T>, raw: string | undefined, key = 'KEY'): T {
  const result = v.validate(raw, key);
  if (!result.ok) throw new Error(`expected ok, got: ${result.issues.join('; ')}`);
  return result.value;
}
function issues<T>(v: Validator<T>, raw: string | undefined, key = 'KEY'): readonly string[] {
  const result = v.validate(raw, key);
  if (result.ok) throw new Error(`expected issues, got ok: ${String(result.value)}`);
  return result.issues;
}

describe('number/port reject non-decimal radices (Number() footgun)', () => {
  it('number() rejects hex/binary/octal/Infinity/NaN', () => {
    for (const bad of ['0x10', '0b101', '0o17', 'Infinity', '-Infinity', 'NaN', '1n']) {
      expect(() => value(number(), bad)).toThrow();
    }
  });

  it('number() still accepts plain decimals and scientific notation', () => {
    expect(value(number(), '42')).toBe(42);
    expect(value(number(), '3.14')).toBe(3.14);
    expect(value(number(), '-7')).toBe(-7);
    expect(value(number(), '1e3')).toBe(1000);
    expect(value(number(), '.5')).toBe(0.5);
  });

  it('port() rejects 0x50 (which Number() reads as 80)', () => {
    expect(() => value(port(), '0x50')).toThrow();
    expect(() => value(port(), '0b1010')).toThrow();
    expect(() => value(port(), '8.0')).toThrow();
  });

  it('port() accepts plain decimal ports', () => {
    expect(value(port(), '3000')).toBe(3000);
    expect(value(port(), '1')).toBe(1);
    expect(value(port(), '65535')).toBe(65535);
  });
});

describe('e.json() with a structured value + string coercer errors loudly', () => {
  it('rejects an object/array when the inner is a string-based coercer', () => {
    const schema = json(e.array());
    expect(issues(schema, '[1,2,3]')[0]).toMatch(/Standard Schema/);
    expect(issues(schema, '{"a":1}')[0]).toMatch(/Standard Schema/);
  });

  it('still validates string JSON through a string coercer', () => {
    const schema = json(string({ min: 2 }));
    expect(value(schema, '"hello"')).toBe('hello');
    expect(issues(schema, '"x"')[0]).toMatch(/length/);
  });

  it('validates structured JSON via a Standard Schema', () => {
    // Minimal hand-rolled Standard Schema (no zod dependency in this package).
    const arrayOfNumbers: StandardSchemaV1<unknown, number[]> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (input) => {
          if (Array.isArray(input) && input.every((n) => typeof n === 'number')) {
            return { value: input as number[] };
          }
          return { issues: [{ message: 'expected number[]' }] };
        },
      },
    };
    const schema = json(arrayOfNumbers);
    expect(value(schema, '[1,2,3]')).toEqual([1, 2, 3]);
    expect(issues(schema, '["a"]')[0]).toBe('expected number[]');
  });
});

describe('.default(x).transform(fn) returns the transformed default (no type lie)', () => {
  it('absent path applies the transform to the default', () => {
    const v = number()
      .default(3000)
      .transform((n) => `n=${n}`);
    expect(value(v, undefined)).toBe('n=3000'); // absent → transformed default
    expect(value(v, '5')).toBe('n=5'); // present → transformed parsed
    expectTypeOf<OutputOf<typeof v>>().toEqualTypeOf<string>();
  });

  it('default set AFTER transform is used verbatim (already TOut)', () => {
    const v = number()
      .transform((n) => `n=${n}`)
      .default('n=fallback');
    expect(value(v, undefined)).toBe('n=fallback');
    expect(value(v, '5')).toBe('n=5');
  });

  it('composed transforms all apply, in order', () => {
    const v = number()
      .transform((n) => n + 1)
      .transform((n) => n * 2);
    expect(value(v, '3')).toBe(8); // (3+1)*2
  });
});

describe('describe() surfaces in the error report', () => {
  it('shows the description as a hint under the failing var', () => {
    expect(() =>
      defineEnv({
        schema: { PORT: e.port().describe('HTTP listen port (1-65535)') },
        runtimeEnv: { PORT: 'not-a-port' },
      }),
    ).toThrow(/HTTP listen port/);
  });

  it('formatEnvErrors renders the description line', () => {
    const out = formatEnvErrors(
      [{ key: 'PORT', received: 'x', messages: ['bad'], description: 'the port' }],
      { color: false },
    );
    expect(out).toContain('↳ the port');
  });
});

describe('withMeta attaches secret/description to any entry', () => {
  it('redacts a Standard-Schema secret in error output', () => {
    const alwaysFails: StandardSchemaV1<unknown, string> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'nope' }] }),
      },
    };
    expect(() =>
      defineEnv({
        // Name does NOT match the secret heuristic, so only withMeta protects it.
        schema: { CONNSTRING: withMeta(alwaysFails, { secret: true }) },
        runtimeEnv: { CONNSTRING: 's3cr3t-value' },
      }),
    ).toThrow();

    let captured = '';
    defineEnv({
      schema: { CONNSTRING: withMeta(alwaysFails, { secret: true }) },
      runtimeEnv: { CONNSTRING: 's3cr3t-value' },
      onValidationError: (err) => {
        captured = err.message;
      },
    });
    expect(captured).not.toContain('s3cr3t-value');
    expect(captured).toContain('***');
  });

  it('merges meta over a coercer’s existing meta', () => {
    const v = withMeta(e.string().describe('orig'), { secret: true });
    expect(v.meta?.secret).toBe(true);
    expect(v.meta?.description).toBe('orig');
  });
});
