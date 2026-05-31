import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { e } from '../src/coercers.js';
import { createEnv, defineEnv, defineEnvSplit } from '../src/define-env.js';
import { EnvValidationError } from '../src/types.js';

// ===========================================================================
// Flat / server model
// ===========================================================================

describe('defineEnv (flat)', () => {
  it('returns a coerced object: PORT string -> number, enum -> union', () => {
    const env = defineEnv({
      schema: {
        NODE_ENV: e.enum(['development', 'production', 'test']),
        PORT: e.port(),
        DATABASE_URL: e.url(),
      },
      runtimeEnv: {
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'https://db.example.com',
      },
    });

    expect(env.PORT).toBe(3000);
    expect(typeof env.PORT).toBe('number'); // genuinely coerced, not just typed
    expect(env.NODE_ENV).toBe('production');
    expect(env.DATABASE_URL).toBe('https://db.example.com');
  });

  it('freezes the returned object (single source of truth, immutable)', () => {
    const env = defineEnv({
      schema: { PORT: e.port() },
      runtimeEnv: { PORT: '8080' },
    });
    expect(Object.isFrozen(env)).toBe(true);
    expect(() => {
      // @ts-expect-error -- readonly at the type level; frozen at runtime.
      env.PORT = 1;
    }).toThrow();
    expect(env.PORT).toBe(8080);
  });

  it('aggregates ALL missing/invalid vars into one error (never first-only)', () => {
    let caught: EnvValidationError | undefined;
    try {
      defineEnv({
        schema: {
          DATABASE_URL: e.url(),
          PORT: e.port(),
          API_KEY: e.string(),
        },
        runtimeEnv: { PORT: '99999' }, // DATABASE_URL + API_KEY missing, PORT out of range
      });
    } catch (err) {
      caught = err as EnvValidationError;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    expect(caught?.issues).toHaveLength(3);
    const keys = caught?.issues.map((i) => i.key).sort();
    expect(keys).toEqual(['API_KEY', 'DATABASE_URL', 'PORT']);
    // The message lists every offender.
    expect(caught?.message).toContain('DATABASE_URL');
    expect(caught?.message).toContain('PORT');
    expect(caught?.message).toContain('API_KEY');
  });

  it('coerces booleans and numbers from their string spellings', () => {
    const env = defineEnv({
      schema: { ENABLE_CACHE: e.boolean(), RETRIES: e.number() },
      runtimeEnv: { ENABLE_CACHE: 'true', RETRIES: '5' },
    });
    expect(env.ENABLE_CACHE).toBe(true);
    expect(env.RETRIES).toBe(5);
  });

  // --- skipValidation (the t3-env #266 fix) --------------------------------

  it('skipValidation keeps defaults and coercion AND does not throw', () => {
    const env = defineEnv({
      schema: {
        NODE_ENV: e.enum(['development', 'production']).default('development'),
        PORT: e.port().default(3000),
        DATABASE_URL: e.url(), // intentionally missing & invalid-by-absence
      },
      runtimeEnv: {}, // nothing set
      skipValidation: true,
    });

    // Did NOT throw, and defaults survived (this is the #266 regression guard).
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    // The unmet required var is simply absent rather than crashing the boot.
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('skipValidation still coerces values that ARE present', () => {
    const env = defineEnv({
      schema: { PORT: e.port().default(3000) },
      runtimeEnv: { PORT: '8080' },
      skipValidation: true,
    });
    expect(env.PORT).toBe(8080);
  });

  // --- onValidationError ----------------------------------------------------

  it('calls onValidationError instead of throwing', () => {
    const onValidationError = vi.fn();
    const env = defineEnv({
      schema: { DATABASE_URL: e.url() },
      runtimeEnv: {},
      onValidationError,
    });

    expect(onValidationError).toHaveBeenCalledTimes(1);
    const err = onValidationError.mock.calls[0][0] as EnvValidationError;
    expect(err).toBeInstanceOf(EnvValidationError);
    expect(err.issues[0].key).toBe('DATABASE_URL');
    // No throw -> we still get a (partial, frozen) object back.
    expect(Object.isFrozen(env)).toBe(true);
  });

  // --- emptyStringAsUndefined ----------------------------------------------

  it('treats empty strings as absent so defaults apply (default behavior)', () => {
    const env = defineEnv({
      schema: { REGION: e.string().default('us-east-1') },
      runtimeEnv: { REGION: '' },
    });
    expect(env.REGION).toBe('us-east-1');
  });

  it('respects emptyStringAsUndefined: false (empty string is a real value)', () => {
    // With the flag off, '' reaches the coercer. e.string() rejects empty, so
    // this surfaces as a validation error rather than silently defaulting.
    expect(() =>
      defineEnv({
        schema: { NAME: e.string() },
        runtimeEnv: { NAME: '' },
        emptyStringAsUndefined: false,
      }),
    ).toThrow(EnvValidationError);
  });

  it('does not mutate the caller-provided runtimeEnv source', () => {
    const source = { PORT: '', NAME: 'ok' };
    defineEnv({ schema: { NAME: e.string() }, runtimeEnv: source });
    expect(source.PORT).toBe(''); // normalization worked on a copy
  });
});

// ===========================================================================
// Split / client-server model + leak guard
// ===========================================================================

describe('defineEnv (split) + leak guard', () => {
  it('exposes server + client + shared on the server', () => {
    const env = defineEnv({
      clientPrefix: 'NEXT_PUBLIC_',
      server: { DATABASE_URL: e.url() },
      client: { NEXT_PUBLIC_API_URL: e.url() },
      shared: { NODE_ENV: e.enum(['development', 'production']) },
      isServer: true,
      runtimeEnv: {
        DATABASE_URL: 'https://db.example.com',
        NEXT_PUBLIC_API_URL: 'https://api.example.com',
        NODE_ENV: 'production',
      },
    });

    expect(env.DATABASE_URL).toBe('https://db.example.com');
    expect(env.NEXT_PUBLIC_API_URL).toBe('https://api.example.com');
    expect(env.NODE_ENV).toBe('production');
  });

  it('throws when a SERVER var is read on the client (leak guard)', () => {
    const env = defineEnv({
      clientPrefix: 'NEXT_PUBLIC_',
      server: { DATABASE_URL: e.url() },
      client: { NEXT_PUBLIC_API_URL: e.url() },
      isServer: false,
      runtimeEnv: {
        // Client only supplies what the bundler can statically inline.
        NEXT_PUBLIC_API_URL: 'https://api.example.com',
      },
    });

    // Client var is readable.
    expect(env.NEXT_PUBLIC_API_URL).toBe('https://api.example.com');
    // Server var read throws with the documented message.
    expect(() => (env as Record<string, unknown>).DATABASE_URL).toThrow(
      /server-only env var "DATABASE_URL" on the client/,
    );
  });

  it('hides server keys from enumeration/spread/`in` on the client', () => {
    const env = defineEnv({
      clientPrefix: 'NEXT_PUBLIC_',
      server: { SECRET_TOKEN: e.string().default('x') },
      client: { NEXT_PUBLIC_OK: e.string().default('ok') },
      isServer: false,
      runtimeEnv: {},
    });

    expect(Object.keys(env)).toEqual(['NEXT_PUBLIC_OK']);
    expect('SECRET_TOKEN' in env).toBe(false);
    expect({ ...env }).toEqual({ NEXT_PUBLIC_OK: 'ok' });
  });

  it('routes a client-side server access to onInvalidAccess when provided', () => {
    const onInvalidAccess = vi.fn();
    const env = defineEnv({
      clientPrefix: 'NEXT_PUBLIC_',
      server: { DATABASE_URL: e.url().default('https://x.example') },
      isServer: false,
      runtimeEnv: {},
      onInvalidAccess,
    });

    void (env as Record<string, unknown>).DATABASE_URL;
    expect(onInvalidAccess).toHaveBeenCalledWith('DATABASE_URL');
  });

  it('throws at DEFINE time if a client var lacks the clientPrefix (footgun guard)', () => {
    expect(() =>
      defineEnv({
        clientPrefix: 'NEXT_PUBLIC_',
        // STRIPE_SECRET would be shipped to the browser without the prefix rule.
        client: { STRIPE_SECRET: e.string() },
        runtimeEnv: { STRIPE_SECRET: 'sk_live_x' },
      }),
    ).toThrow(/must start with "NEXT_PUBLIC_"/);
  });

  it('does NOT validate or require server vars on the client', () => {
    // DATABASE_URL is required on the server but not supplied; on the client it
    // must neither be validated nor cause an error.
    expect(() =>
      defineEnv({
        clientPrefix: 'NEXT_PUBLIC_',
        server: { DATABASE_URL: e.url() },
        client: { NEXT_PUBLIC_OK: e.string() },
        isServer: false,
        runtimeEnv: { NEXT_PUBLIC_OK: 'ok' },
      }),
    ).not.toThrow();
  });

  it('defineEnvSplit is an explicit alias for the split model', () => {
    const env = defineEnvSplit({
      clientPrefix: 'VITE_',
      client: { VITE_URL: e.url() },
      isServer: true,
      runtimeEnv: { VITE_URL: 'https://x.example' },
    });
    expect(env.VITE_URL).toBe('https://x.example');
  });
});

// ===========================================================================
// createEnv — context-passing parser (Cloudflare Workers)
// ===========================================================================

describe('createEnv (lazy parser)', () => {
  it('returns a parser that validates a passed binding', () => {
    const parseEnv = createEnv({ schema: { API_KEY: e.string(), PORT: e.port() } });
    const cfg = parseEnv({ API_KEY: 'abc', PORT: '8787' });
    expect(cfg.API_KEY).toBe('abc');
    expect(cfg.PORT).toBe(8787);
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('throws an aggregated error for a bad binding', () => {
    const parseEnv = createEnv({ schema: { API_KEY: e.string(), URL: e.url() } });
    expect(() => parseEnv({ URL: 'nope' })).toThrow(EnvValidationError);
  });

  it('memoizes by binding identity (parse once per object)', () => {
    const parseEnv = createEnv({ schema: { N: e.number() } });
    const binding = { N: '1' };
    const a = parseEnv(binding);
    const b = parseEnv(binding);
    expect(a).toBe(b); // same frozen object returned, no re-validation

    // A different binding object validates independently.
    const c = parseEnv({ N: '2' });
    expect(c).not.toBe(a);
    expect(c.N).toBe(2);
  });

  it('applies defaults under skipValidation in the parser path too', () => {
    const parseEnv = createEnv({
      schema: { PORT: e.port().default(3000), URL: e.url() },
      skipValidation: true,
    });
    const cfg = parseEnv({});
    expect(cfg.PORT).toBe(3000);
    expect(cfg.URL).toBeUndefined();
  });
});

// ===========================================================================
// Secret redaction surfaced through the thrown error
// ===========================================================================

describe('secret redaction in thrown errors', () => {
  it('redacts a secret-named var value in the aggregated message', () => {
    let caught: EnvValidationError | undefined;
    try {
      defineEnv({
        schema: { API_KEY: e.string({ min: 20 }) },
        runtimeEnv: { API_KEY: 'too-short-secret' },
      });
    } catch (err) {
      caught = err as EnvValidationError;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    expect(caught?.message).not.toContain('too-short-secret');
    expect(caught?.message).toContain('***');
  });

  it('redacts a var explicitly marked secret() even with an innocent name', () => {
    let caught: EnvValidationError | undefined;
    try {
      defineEnv({
        schema: { SEED: e.string({ min: 99 }).secret() },
        runtimeEnv: { SEED: 'visible-but-marked-secret' },
      });
    } catch (err) {
      caught = err as EnvValidationError;
    }
    expect(caught?.message).not.toContain('visible-but-marked-secret');
    expect(caught?.message).toContain('***');
  });
});

// ===========================================================================
// Type-level guarantees (expectTypeOf)
// ===========================================================================

describe('type inference', () => {
  it('infers coerced types and readonly-ness', () => {
    const env = defineEnv({
      schema: {
        PORT: e.port(),
        MODE: e.enum(['a', 'b', 'c']),
        FLAG: e.boolean(),
        MAYBE: e.string().optional(),
      },
      runtimeEnv: { PORT: '1', MODE: 'a', FLAG: 'true' },
    });

    expectTypeOf(env.PORT).toEqualTypeOf<number>();
    expectTypeOf(env.MODE).toEqualTypeOf<'a' | 'b' | 'c'>();
    expectTypeOf(env.FLAG).toEqualTypeOf<boolean>();
    expectTypeOf(env.MAYBE).toEqualTypeOf<string | undefined>();

    // The returned object is readonly: assignment is a type error.
    expectTypeOf<typeof env>().toMatchTypeOf<{ readonly PORT: number }>();
  });

  it('infers the merged shape for the split model', () => {
    const env = defineEnv({
      clientPrefix: 'VITE_',
      server: { SECRET: e.string() },
      client: { VITE_URL: e.url() },
      shared: { TIER: e.enum(['free', 'pro']) },
      isServer: true,
      runtimeEnv: { SECRET: 's', VITE_URL: 'https://x.example', TIER: 'pro' },
    });

    expectTypeOf(env.SECRET).toEqualTypeOf<string>();
    expectTypeOf(env.VITE_URL).toEqualTypeOf<string>();
    expectTypeOf(env.TIER).toEqualTypeOf<'free' | 'pro'>();
  });

  it('infers the parser return type from createEnv', () => {
    const parseEnv = createEnv({ schema: { API_KEY: e.string(), PORT: e.port() } });
    const cfg = parseEnv({ API_KEY: 'x', PORT: '1' });
    expectTypeOf(cfg.API_KEY).toEqualTypeOf<string>();
    expectTypeOf(cfg.PORT).toEqualTypeOf<number>();
  });
});
