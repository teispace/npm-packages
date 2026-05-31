import { describe, expect, it } from 'vitest';
import { e } from '../src/coercers.js';
import { defineEnv as defineAstro } from '../src/presets/astro.js';
import { defineEnv as defineNext } from '../src/presets/next.js';
import { defineEnv as defineNode } from '../src/presets/node.js';
import { defineEnv as defineSvelte } from '../src/presets/sveltekit.js';
import { defineEnv as defineVite } from '../src/presets/vite.js';

/**
 * Presets are thin sugar over defineEnvSplit/defineEnv with the framework's
 * clientPrefix baked in. These tests assert (a) the prefix is enforced, (b) the
 * server→client leak guard works through the preset, and (c) coercion/typing
 * flows through.
 */

describe('next preset (NEXT_PUBLIC_)', () => {
  it('validates + coerces server and client groups (server context)', () => {
    const env = defineNext({
      server: { DATABASE_URL: e.url(), PORT: e.port().default(3000) },
      client: { NEXT_PUBLIC_API_URL: e.url() },
      isServer: true,
      runtimeEnv: {
        DATABASE_URL: 'https://db.example.com',
        NEXT_PUBLIC_API_URL: 'https://api.example.com',
      },
    });
    expect(env.DATABASE_URL).toBe('https://db.example.com');
    expect(env.PORT).toBe(3000); // coerced default
    expect(env.NEXT_PUBLIC_API_URL).toBe('https://api.example.com');
  });

  it('throws at define time if a client var lacks the NEXT_PUBLIC_ prefix', () => {
    expect(() =>
      defineNext({
        client: { API_URL: e.url() }, // missing prefix
        isServer: true,
        runtimeEnv: { API_URL: 'https://x.com' },
      }),
    ).toThrow();
  });

  it('guards server-only vars on the client', () => {
    const env = defineNext({
      server: { SECRET: e.string().default('s') },
      client: { NEXT_PUBLIC_OK: e.string().default('ok') },
      isServer: false,
      runtimeEnv: { NEXT_PUBLIC_OK: 'ok' },
    });
    expect(env.NEXT_PUBLIC_OK).toBe('ok');
    expect(() => env.SECRET).toThrow(/server-only/i);
  });
});

describe('vite preset (VITE_)', () => {
  it('enforces VITE_ prefix and coerces client values', () => {
    const env = defineVite({
      client: { VITE_PORT: e.port(), VITE_FLAG: e.boolean() },
      isServer: false,
      runtimeEnv: { VITE_PORT: '8080', VITE_FLAG: 'true' },
    });
    expect(env.VITE_PORT).toBe(8080);
    expect(env.VITE_FLAG).toBe(true);
  });

  it('rejects an unprefixed client var', () => {
    expect(() =>
      defineVite({ client: { PORT: e.port() }, runtimeEnv: { PORT: '1' }, isServer: false }),
    ).toThrow();
  });
});

describe('astro + sveltekit presets (PUBLIC_)', () => {
  it('astro enforces PUBLIC_ prefix', () => {
    const env = defineAstro({
      client: { PUBLIC_URL: e.url() },
      isServer: false,
      runtimeEnv: { PUBLIC_URL: 'https://a.com' },
    });
    expect(env.PUBLIC_URL).toBe('https://a.com');
    expect(() =>
      defineAstro({ client: { URL: e.url() }, runtimeEnv: { URL: 'https://a.com' } }),
    ).toThrow();
  });

  it('sveltekit enforces PUBLIC_ prefix', () => {
    const env = defineSvelte({
      server: { SECRET: e.string().default('x') },
      client: { PUBLIC_BASE: e.url() },
      isServer: true,
      runtimeEnv: { PUBLIC_BASE: 'https://s.com' },
    });
    expect(env.PUBLIC_BASE).toBe('https://s.com');
  });
});

describe('node preset (flat, no prefix)', () => {
  it('validates a flat schema from an explicit source', () => {
    const env = defineNode({
      schema: {
        NODE_ENV: e.enum(['development', 'production', 'test']).default('development'),
        PORT: e.port().default(3000),
        DATABASE_URL: e.url(),
      },
      runtimeEnv: { DATABASE_URL: 'https://db.example.com' },
    });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBe('https://db.example.com');
  });

  it('aggregates errors for missing required vars', () => {
    expect(() =>
      defineNode({ schema: { DATABASE_URL: e.url(), API_KEY: e.string() }, runtimeEnv: {} }),
    ).toThrow();
  });
});
