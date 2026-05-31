import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  array,
  boolean,
  Coercer,
  e,
  email,
  enumOf,
  host,
  hostname,
  int,
  json,
  number,
  port,
  string,
  url,
  urlObject,
} from '../src/coercers.js';
import type { OutputOf, Validator } from '../src/types.js';

/**
 * Helper: assert a successful coercion and return the value (typed). Keeps the
 * many happy-path assertions terse while still surfacing issues on failure.
 */
function value<T>(v: Validator<T>, raw: string | undefined, key = 'KEY'): T {
  const result = v.validate(raw, key);
  if (!result.ok) {
    throw new Error(`expected ok, got issues: ${result.issues.join('; ')}`);
  }
  return result.value;
}

/** Helper: assert a failed coercion and return the issues. */
function issues<T>(v: Validator<T>, raw: string | undefined, key = 'KEY'): readonly string[] {
  const result = v.validate(raw, key);
  if (result.ok) {
    throw new Error(`expected issues, got ok value: ${String(result.value)}`);
  }
  return result.issues;
}

describe('e.string', () => {
  it('accepts any non-empty string', () => {
    expect(value(string(), 'hello')).toBe('hello');
  });

  it('enforces min/max length', () => {
    expect(issues(string({ min: 3 }), 'ab')[0]).toMatch(/length >= 3/);
    expect(issues(string({ max: 2 }), 'abc')[0]).toMatch(/length <= 2/);
    expect(value(string({ min: 1, max: 5 }), 'ok')).toBe('ok');
  });

  it('enforces startsWith/endsWith/regex', () => {
    expect(value(string({ startsWith: 'sk_' }), 'sk_live')).toBe('sk_live');
    expect(issues(string({ startsWith: 'sk_' }), 'pk_live')[0]).toMatch(/starting with/);
    expect(value(string({ endsWith: '.com' }), 'a.com')).toBe('a.com');
    expect(issues(string({ endsWith: '.com' }), 'a.org')[0]).toMatch(/ending with/);
    expect(value(string({ regex: /^[a-z]+$/ }), 'abc')).toBe('abc');
    expect(issues(string({ regex: /^[a-z]+$/ }), 'ABC')[0]).toMatch(/matching/);
  });
});

describe('e.number', () => {
  it('coerces a numeric string to a real number', () => {
    expect(value(number(), '3.14')).toBe(3.14);
    expect(value(number(), '42')).toBe(42);
    expect(value(number(), '-7')).toBe(-7);
  });

  it('rejects NaN, blank, and Infinity', () => {
    expect(issues(number(), 'abc')[0]).toMatch(/Expected a finite number/);
    expect(issues(number(), '   ')[0]).toMatch(/Expected a number/);
    expect(issues(number(), 'Infinity')[0]).toMatch(/finite/);
  });

  it('enforces min/max/int', () => {
    expect(issues(number({ min: 10 }), '5')[0]).toMatch(/>= 10/);
    expect(issues(number({ max: 10 }), '11')[0]).toMatch(/<= 10/);
    expect(issues(number({ int: true }), '3.5')[0]).toMatch(/integer/);
    expect(value(number({ int: true }), '3')).toBe(3);
  });
});

describe('e.int', () => {
  it('accepts integers, rejects fractions', () => {
    expect(value(int(), '10')).toBe(10);
    expect(issues(int(), '10.5')[0]).toMatch(/integer/);
  });
});

describe('e.port', () => {
  it('accepts 1..65535', () => {
    expect(value(port(), '3000')).toBe(3000);
    expect(value(port(), '1')).toBe(1);
    expect(value(port(), '65535')).toBe(65535);
  });

  it('rejects out-of-range, fractional, and non-numeric', () => {
    expect(issues(port(), '0')[0]).toMatch(/valid port \(1-65535\)/);
    expect(issues(port(), '70000')[0]).toMatch(/valid port/);
    expect(issues(port(), '80.5')[0]).toMatch(/valid port/);
    expect(issues(port(), 'abc')[0]).toMatch(/valid port/);
  });
});

describe('e.boolean', () => {
  it('coerces truthy spellings (case-insensitive)', () => {
    for (const t of ['true', 'TRUE', '1', 'yes', 'YES', 'on', 'On']) {
      expect(value(boolean(), t)).toBe(true);
    }
  });

  it('coerces falsy spellings', () => {
    for (const f of ['false', 'FALSE', '0', 'no', 'NO', 'off', 'OFF']) {
      expect(value(boolean(), f)).toBe(false);
    }
  });

  it('rejects unknown spellings', () => {
    expect(issues(boolean(), 'maybe')[0]).toMatch(/Expected a boolean/);
  });
});

describe('e.url', () => {
  it('accepts a valid URL and returns the string', () => {
    expect(value(url(), 'https://example.com')).toBe('https://example.com');
  });

  it('rejects invalid URLs', () => {
    expect(issues(url(), 'not a url')[0]).toMatch(/valid URL/);
  });

  it('enforces protocol (string or list, with/without colon)', () => {
    expect(value(url({ protocol: 'https' }), 'https://x.com')).toBe('https://x.com');
    expect(value(url({ protocol: 'https:' }), 'https://x.com')).toBe('https://x.com');
    expect(issues(url({ protocol: 'https' }), 'http://x.com')[0]).toMatch(/protocol https:/);
    expect(value(url({ protocol: ['http', 'https'] }), 'http://x.com')).toBe('http://x.com');
  });

  it('urlObject returns a URL instance', () => {
    const u = value(urlObject(), 'https://example.com/path');
    expect(u).toBeInstanceOf(URL);
    expect(u.pathname).toBe('/path');
  });

  it('rejects dangerous script schemes by default', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(issues(url(), bad)[0]).toMatch(/unsafe protocol/);
    }
  });

  it('still accepts normal network schemes (backend connection strings)', () => {
    // Secure-by-default must NOT break postgres/redis/amqp/etc.
    for (const okUrl of [
      'http://x.com',
      'https://x.com',
      'postgres://user:pass@host:5432/db',
      'redis://localhost:6379',
      'amqp://guest@host',
      'mongodb://host/db',
    ]) {
      expect(value(url(), okUrl)).toBe(okUrl);
    }
  });

  it('allows a dangerous scheme when explicitly opted in', () => {
    expect(value(url({ allowDangerousSchemes: true }), 'file:///tmp/x')).toBe('file:///tmp/x');
    expect(value(url({ protocol: 'data' }), 'data:text/plain,hi')).toBe('data:text/plain,hi');
  });
});

describe('e.email', () => {
  it('accepts a sane email', () => {
    expect(value(email(), 'a@b.com')).toBe('a@b.com');
    expect(value(email(), 'first.last@sub.example.co')).toBe('first.last@sub.example.co');
  });

  it('rejects malformed emails', () => {
    for (const bad of ['a@b', 'no-at.com', 'a@@b.com', 'a b@c.com', '@b.com']) {
      expect(issues(email(), bad)[0]).toMatch(/valid email/);
    }
  });
});

describe('e.enum / e.oneOf', () => {
  it('accepts members and narrows the type', () => {
    const node = enumOf(['development', 'production', 'test'] as const);
    expect(value(node, 'production')).toBe('production');
    expectTypeOf(value(node, 'production')).toEqualTypeOf<'development' | 'production' | 'test'>();
  });

  it('rejects non-members and lists the allowed set', () => {
    const node = enumOf(['a', 'b'] as const);
    expect(issues(node, 'c')[0]).toMatch(/Expected one of \["a", "b"\]/);
  });

  it('e.oneOf is the same factory', () => {
    expect(e.oneOf).toBe(e.enum);
  });
});

describe('e.json', () => {
  it('parses valid JSON', () => {
    expect(value(json(), '{"a":1}')).toEqual({ a: 1 });
    expect(value(json(), '[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('rejects invalid JSON', () => {
    expect(issues(json(), '{bad}')[0]).toMatch(/valid JSON/);
  });

  it('validates the parsed shape with an inner Standard Schema', () => {
    // Hand-rolled std-schema: requires an object with a numeric `port`.
    const shape: import('../src/types.js').StandardSchemaV1<unknown, { port: number }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate(v) {
          if (
            typeof v === 'object' &&
            v !== null &&
            typeof (v as { port?: unknown }).port === 'number'
          ) {
            return { value: v as { port: number } };
          }
          return { issues: [{ message: 'expected { port: number }' }] };
        },
      },
    };
    const j = json(shape);
    expect(value(j, '{"port":8080}')).toEqual({ port: 8080 });
    expect(issues(j, '{"port":"x"}')[0]).toMatch(/expected \{ port: number \}/);
  });

  it('carries an explicit generic output type', () => {
    const j = json<{ a: number }>();
    expectTypeOf<OutputOf<typeof j>>().toEqualTypeOf<{ a: number }>();
  });
});

describe('e.array', () => {
  it('splits on comma and trims by default', () => {
    expect(value(array(), 'a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('respects a custom separator and trim=false', () => {
    expect(value(array({ separator: ';' }), 'a;b;c')).toEqual(['a', 'b', 'c']);
    expect(value(array({ trim: false }), 'a, b')).toEqual(['a', ' b']);
  });

  it('coerces each element with `of` and yields the element type', () => {
    const nums = array({ of: number() });
    expect(value(nums, '1,2,3')).toEqual([1, 2, 3]);
    expectTypeOf(value(nums, '1,2,3')).toEqualTypeOf<number[]>();
  });

  it('aggregates element errors with their index', () => {
    const ports = array({ of: port() });
    const errs = issues(ports, '80,abc,70000');
    expect(errs).toHaveLength(2);
    expect(errs[0]).toMatch(/^\[1\] /);
    expect(errs[1]).toMatch(/^\[2\] /);
  });
});

describe('e.host / e.hostname', () => {
  it('accepts valid hostnames', () => {
    expect(value(hostname(), 'example.com')).toBe('example.com');
    expect(value(hostname(), 'localhost')).toBe('localhost');
    expect(value(host(), 'sub.example.co.uk')).toBe('sub.example.co.uk');
    expect(value(host(), '127.0.0.1')).toBe('127.0.0.1');
  });

  it('rejects schemes, ports, paths, and bad labels', () => {
    expect(issues(hostname(), 'http://example.com')[0]).toMatch(/valid hostname/);
    expect(issues(hostname(), 'example.com:8080')[0]).toMatch(/valid hostname/);
    expect(issues(hostname(), 'example.com/path')[0]).toMatch(/valid hostname/);
    expect(issues(hostname(), '-bad.com')[0]).toMatch(/valid hostname/);
  });
});

describe('chainable: .optional()', () => {
  it('absent / empty → undefined, no error', () => {
    expect(value(number().optional(), undefined)).toBeUndefined();
    expect(value(number().optional(), '')).toBeUndefined();
  });

  it('present value still coerces', () => {
    expect(value(number().optional(), '5')).toBe(5);
  });

  it('narrows the output type to T | undefined', () => {
    expectTypeOf(number().optional()).toMatchTypeOf<Validator<number | undefined>>();
  });
});

describe('chainable: .default()', () => {
  it('absent / empty → default, present → coerced', () => {
    expect(value(number().default(3000), undefined)).toBe(3000);
    expect(value(number().default(3000), '')).toBe(3000);
    expect(value(number().default(3000), '8080')).toBe(8080);
  });

  it('default is returned verbatim without re-parsing (applies under skipValidation)', () => {
    // The default is a real `number`, never re-coerced from a string, so the
    // core can hand it back even when validation is skipped (t3-env #266 fix).
    const portWithDefault = port().default(3000);
    expect(value(portWithDefault, undefined)).toBe(3000);
  });

  it('makes the field non-optional in the type', () => {
    expectTypeOf(string().default('x')).toMatchTypeOf<Validator<string>>();
    const d = number().default(1);
    expectTypeOf<OutputOf<typeof d>>().toEqualTypeOf<number>();
  });
});

describe('chainable: .refine()', () => {
  it('passes when fn returns true', () => {
    expect(
      value(
        number().refine((n) => n % 2 === 0),
        '4',
      ),
    ).toBe(4);
  });

  it('fails with a string message returned by the fn', () => {
    expect(
      issues(
        number().refine((n) => (n > 0 ? true : 'must be positive')),
        '-1',
      )[0],
    ).toBe('must be positive');
  });

  it('fails with the provided message when fn returns false', () => {
    expect(
      issues(
        number().refine((n) => n > 0, 'too small'),
        '-1',
      )[0],
    ).toBe('too small');
  });

  it('runs on the coerced value before transform', () => {
    expect(
      value(
        string().refine((s) => s.length > 1),
        'ok',
      ),
    ).toBe('ok');
  });
});

describe('chainable: .transform()', () => {
  it('maps the output value and type', () => {
    const upper = string().transform((s) => s.toUpperCase());
    expect(value(upper, 'abc')).toBe('ABC');
    const len = string().transform((s) => s.length);
    expect(value(len, 'abcd')).toBe(4);
    expectTypeOf<OutputOf<typeof len>>().toEqualTypeOf<number>();
  });

  it('transform runs after refine (refine sees the base value)', () => {
    const v = number()
      .refine((n) => n >= 0, 'must be >= 0')
      .transform((n) => `n=${n}`);
    expect(value(v, '7')).toBe('n=7');
    expect(issues(v, '-1')[0]).toBe('must be >= 0');
  });
});

describe('chainable: .describe()/.secret()/.public() meta', () => {
  it('attaches description', () => {
    expect(string().describe('the db url').meta?.description).toBe('the db url');
  });

  it('sets secret / public', () => {
    expect(string().secret().meta?.secret).toBe(true);
    expect(string().public().meta?.secret).toBe(false);
  });

  it('composes meta across chained calls', () => {
    const v = string().describe('token').secret();
    expect(v.meta).toEqual({ description: 'token', secret: true });
  });
});

describe('required (no default/optional)', () => {
  it('absent → required error naming the key', () => {
    expect(issues(string(), undefined)[0]).toBe('Missing required environment variable "KEY"');
    expect(issues(string(), '', 'DATABASE_URL')[0]).toMatch(/"DATABASE_URL"/);
  });
});

describe('immutability of the builder', () => {
  it('each modifier returns a new instance, leaving the base unchanged', () => {
    const base = number();
    const withDefault = base.default(5);
    expect(base).not.toBe(withDefault);
    // base is still required: absent → error
    expect(base.validate(undefined, 'K').ok).toBe(false);
    // derived has the default
    expect(value(withDefault, undefined)).toBe(5);
  });

  it('factories return Coercer instances (for the toValidator fast-path)', () => {
    expect(string()).toBeInstanceOf(Coercer);
    expect(e.port()).toBeInstanceOf(Coercer);
  });
});
