import { describe, expect, expectTypeOf, it } from 'vitest';
import { number, port, string } from '../src/coercers.js';
import {
  fromStandardSchema,
  isStandardSchema,
  isValidator,
  toValidator,
} from '../src/standard-schema.js';
import type { OutputOf, StandardSchemaV1, Validator } from '../src/types.js';

/**
 * Hand-rolled Standard Schema stubs — we deliberately avoid adding `zod` as a
 * dependency. These exercise exactly the spec surface the adapter touches:
 * `~standard.version`, `~standard.validate`, and the success/failure result
 * shapes (plus a Promise-returning one to prove async is rejected).
 */

/** A synchronous schema: trims input and requires a non-empty string. */
function nonEmptyStringSchema(): StandardSchemaV1<unknown, string> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      types: undefined,
      validate(value) {
        if (typeof value === 'string' && value.trim().length > 0) {
          return { value };
        }
        return { issues: [{ message: 'expected a non-empty string' }] };
      },
    },
  };
}

/** A synchronous coercing schema: string → number, like `z.coerce.number()`. */
function coerceNumberSchema(): StandardSchemaV1<unknown, number> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate(value) {
        const n = Number(value);
        if (Number.isFinite(n)) return { value: n };
        return { issues: [{ message: 'expected a number' }] };
      },
    },
  };
}

/** An async schema — unsupported for env; the adapter must throw on use. */
function asyncSchema(): StandardSchemaV1<unknown, string> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate(value) {
        return Promise.resolve({ value: String(value) });
      },
    },
  };
}

describe('isStandardSchema', () => {
  it('detects a valid v1 schema', () => {
    expect(isStandardSchema(nonEmptyStringSchema())).toBe(true);
  });

  it('rejects non-schemas and wrong versions', () => {
    expect(isStandardSchema(null)).toBe(false);
    expect(isStandardSchema({})).toBe(false);
    expect(isStandardSchema({ '~standard': { version: 2 } })).toBe(false);
    expect(isStandardSchema(string())).toBe(false);
  });
});

describe('isValidator', () => {
  it('detects our coercers and plain validators', () => {
    expect(isValidator(string())).toBe(true);
    expect(isValidator({ validate: () => ({ ok: true, value: 1 }) })).toBe(true);
  });

  it('returns false for Standard Schemas and non-objects', () => {
    expect(isValidator(nonEmptyStringSchema())).toBe(false);
    expect(isValidator(null)).toBe(false);
    expect(isValidator(42)).toBe(false);
  });
});

describe('fromStandardSchema', () => {
  it('maps a success result to { ok: true, value }', () => {
    const v = fromStandardSchema(nonEmptyStringSchema());
    const r = v.validate('hello', 'KEY');
    expect(r).toEqual({ ok: true, value: 'hello' });
  });

  it('maps a failure result to { ok: false, issues }', () => {
    const v = fromStandardSchema(nonEmptyStringSchema());
    const r = v.validate('   ', 'KEY');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues).toEqual(['expected a non-empty string']);
  });

  it('forwards the raw value so the schema owns coercion', () => {
    const v = fromStandardSchema(coerceNumberSchema());
    expect(v.validate('3.14', 'KEY')).toEqual({ ok: true, value: 3.14 });
  });

  it('throws a clear error for async schemas', () => {
    const v = fromStandardSchema(asyncSchema());
    expect(() => v.validate('x', 'KEY')).toThrow(
      /Async Standard Schema validation is not supported/,
    );
  });

  it('infers the schema output type', () => {
    const v = fromStandardSchema(coerceNumberSchema());
    expectTypeOf<OutputOf<typeof v>>().toEqualTypeOf<number>();
  });
});

describe('toValidator', () => {
  it('returns our Coercer instances unchanged (fast path)', () => {
    const c = port();
    expect(toValidator(c)).toBe(c);
  });

  it('returns a plain Validator unchanged', () => {
    const plain: Validator<number> = {
      validate: () => ({ ok: true, value: 1 }),
    };
    expect(toValidator(plain)).toBe(plain);
  });

  it('wraps a Standard Schema into a Validator', () => {
    const schema = nonEmptyStringSchema();
    const v = toValidator(schema);
    expect(v).not.toBe(schema);
    expect(v.validate('ok', 'KEY')).toEqual({ ok: true, value: 'ok' });
    expect(v.validate('', 'KEY').ok).toBe(false);
  });

  it('throws on a malformed entry that is neither', () => {
    expect(() => toValidator({} as never)).toThrow(/Invalid schema entry/);
  });
});

describe('interop: mixing coercers and std-schema in one map', () => {
  it('both normalize to the same Validator shape', () => {
    const entries = {
      PORT: toValidator(port()),
      NAME: toValidator(nonEmptyStringSchema()),
      COUNT: toValidator(number()),
    };
    expect(entries.PORT.validate('8080', 'PORT')).toEqual({ ok: true, value: 8080 });
    expect(entries.NAME.validate('teispace', 'NAME')).toEqual({ ok: true, value: 'teispace' });
    expect(entries.COUNT.validate('3', 'COUNT')).toEqual({ ok: true, value: 3 });
  });
});
