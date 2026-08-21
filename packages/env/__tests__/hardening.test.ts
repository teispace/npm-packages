import { describe, expect, expectTypeOf, it } from 'vitest';
import { e, json, number, port, string } from '../src/coercers.js';
import { defineEnv } from '../src/define-env.js';
import { formatEnvErrors } from '../src/errors.js';
import { withMeta } from '../src/standard-schema.js';
import type { OutputOf, StandardSchemaV1, Validator } from '../src/types.js';
import { EnvValidationError } from '../src/types.js';

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

// ===========================================================================
// Regression tests for the Aug-2026 hardening pass. Each `it` below maps to a
// bug that was reproducible against the shipped 0.2.4 build.
// ===========================================================================

describe('regression: split-group configuration guards', () => {
  it('rejects a key declared in more than one group', () => {
    // Previously accepted, then crashed the leak guard on the client: the key
    // was written onto the frozen target by the shared group AND listed in
    // serverKeys, so the `ownKeys` trap hid an own property of a
    // non-extensible target -> TypeError from Object.keys/spread/JSON.stringify.
    expect(() =>
      defineEnv({
        server: { NODE_ENV: e.string() },
        shared: { NODE_ENV: e.string() },
        clientPrefix: 'NEXT_PUBLIC_',
        isServer: false,
        runtimeEnv: { NODE_ENV: 'production' },
      }),
    ).toThrow(/only be declared in one group/);
  });

  it('rejects a server var carrying the client prefix', () => {
    // Bundlers inline by NAME, so a `NEXT_PUBLIC_`-prefixed var reaches the
    // browser no matter which group it is filed under. Declaring it `server`
    // bought a false sense of safety, so the config is now refused outright.
    expect(() =>
      defineEnv({
        server: { NEXT_PUBLIC_SECRET: e.string() },
        client: { NEXT_PUBLIC_OK: e.string() },
        clientPrefix: 'NEXT_PUBLIC_',
        isServer: true,
        runtimeEnv: { NEXT_PUBLIC_SECRET: 'sk_live', NEXT_PUBLIC_OK: 'fine' },
      }),
    ).toThrow(/must NOT start with "NEXT_PUBLIC_"/);
  });

  it('still allows a prefixed shared var (public by design)', () => {
    const env = defineEnv({
      shared: { NEXT_PUBLIC_APP_URL: e.url() },
      clientPrefix: 'NEXT_PUBLIC_',
      isServer: false,
      runtimeEnv: { NEXT_PUBLIC_APP_URL: 'https://example.com' },
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://example.com');
  });

  it('keeps ordinary object operations working on the client guard', () => {
    const env = defineEnv({
      server: { DB_URL: e.string() },
      shared: { NODE_ENV: e.string() },
      clientPrefix: 'NEXT_PUBLIC_',
      isServer: false,
      runtimeEnv: { DB_URL: 'postgres://x', NODE_ENV: 'production' },
    });
    expect(Object.keys(env)).toEqual(['NODE_ENV']);
    expect({ ...env }).toEqual({ NODE_ENV: 'production' });
    expect(() => JSON.stringify(env)).not.toThrow();
    expect(() => (env as { DB_URL: string }).DB_URL).toThrow(/server-only/);
  });
});

describe('regression: emptyStringAsUndefined is honoured by coercers', () => {
  it('treats "" as a present value when the flag is false', () => {
    // The flag used to be a no-op: Coercer.validate unconditionally treated
    // '' as absent, so the default applied even though the caller opted out.
    expect(() =>
      defineEnv({
        schema: { PORT: e.port().default(3000) },
        runtimeEnv: { PORT: '' },
        emptyStringAsUndefined: false,
      }),
    ).toThrow(EnvValidationError);
  });

  it('still applies the default under the (on) default behaviour', () => {
    const env = defineEnv({
      schema: { PORT: e.port().default(3000) },
      runtimeEnv: { PORT: '' },
    });
    expect(env.PORT).toBe(3000);
  });

  it('e.string() enforces its documented non-empty contract', () => {
    expect(() =>
      defineEnv({
        schema: { NAME: e.string() },
        runtimeEnv: { NAME: '' },
        emptyStringAsUndefined: false,
      }),
    ).toThrow(/non-empty string/);
  });

  it('an explicit min is the opt-out for allowing ""', () => {
    const env = defineEnv({
      schema: { NAME: e.string({ min: 0 }) },
      runtimeEnv: { NAME: '' },
      emptyStringAsUndefined: false,
    });
    expect(env.NAME).toBe('');
  });
});

describe('regression: secret redaction does not corrupt the expectation', () => {
  it('keeps a numeric bound intact while redacting the value', () => {
    // `replaceAll('1', '***')` used to rewrite the bound `10` into `***0`,
    // telling the reader the minimum was `***0`.
    try {
      defineEnv({ schema: { API_KEY: e.int({ min: 10 }) }, runtimeEnv: { API_KEY: '1' } });
      throw new Error('expected a validation error');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('>= 10');
      expect(message).not.toContain('***0');
    }
  });

  it('still redacts a real secret value', () => {
    try {
      defineEnv({
        schema: { API_SECRET: e.url() },
        runtimeEnv: { API_SECRET: 'sk_live_9c8b7a6d' },
      });
      throw new Error('expected a validation error');
    } catch (err) {
      expect((err as Error).message).not.toContain('sk_live_9c8b7a6d');
      expect((err as Error).message).toContain('***');
    }
  });
});

describe('regression: thenable detection', () => {
  it('rejects a non-Promise thenable instead of silently dropping the var', () => {
    // `instanceof Promise` missed cross-realm/polyfilled thenables. The value
    // then had no `.issues`, read as a success with `value: undefined`, and the
    // key vanished from the env object with no error at all.
    const thenableSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        // A non-Promise thenable is exactly what this test exercises: it is the
        // shape `instanceof Promise` missed, which used to vanish the variable.
        // biome-ignore lint/suspicious/noThenProperty: deliberate test fixture
        validate: () => ({ then: (r: unknown) => r }) as never,
      },
    };
    expect(() =>
      defineEnv({ schema: { X: thenableSchema as never }, runtimeEnv: { X: 'v' } }),
    ).toThrow(/Async Standard Schema validation is not supported/);
  });
});
