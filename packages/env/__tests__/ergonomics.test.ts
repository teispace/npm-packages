import { afterEach, describe, expect, it } from 'vitest';
import { e } from '../src/coercers.js';
import { defineEnv } from '../src/define-env.js';
import { resolveCascade } from '../src/load.js';
import { detectRuntimeName } from '../src/runtime.js';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('runtimeEnvStrict', () => {
  it('names every client key missing from runtimeEnv', () => {
    expect(() =>
      defineEnv({
        client: { NEXT_PUBLIC_A: e.string(), NEXT_PUBLIC_B: e.string() },
        clientPrefix: 'NEXT_PUBLIC_',
        runtimeEnvStrict: true,
        isServer: true,
        runtimeEnv: { NEXT_PUBLIC_A: 'a' },
      }),
    ).toThrow(/NEXT_PUBLIC_B/);
  });

  it('accepts a key explicitly mapped to undefined (a correct mapping)', () => {
    // The mistake we catch is the key being ABSENT from the literal, not the
    // value being unset — an unset var is legitimately `undefined`.
    expect(() =>
      defineEnv({
        client: { NEXT_PUBLIC_A: e.string().optional() },
        clientPrefix: 'NEXT_PUBLIC_',
        runtimeEnvStrict: true,
        isServer: true,
        runtimeEnv: { NEXT_PUBLIC_A: undefined },
      }),
    ).not.toThrow();
  });

  it('never demands a mapping for server vars', () => {
    // Server vars are read from a live process.env and never enter the client
    // bundle, so requiring a literal mapping would be friction with no benefit.
    expect(() =>
      defineEnv({
        server: { DATABASE_URL: e.string() },
        client: { NEXT_PUBLIC_A: e.string() },
        clientPrefix: 'NEXT_PUBLIC_',
        runtimeEnvStrict: true,
        isServer: true,
        runtimeEnv: { NEXT_PUBLIC_A: 'a', DATABASE_URL: 'postgres://x' },
      }),
    ).not.toThrow();
  });
});

describe('object-level refine', () => {
  it('reports a cross-field failure in the aggregated report', () => {
    expect(() =>
      defineEnv({
        schema: { SMTP_HOST: e.string().optional(), SMTP_PASS: e.string().optional() },
        runtimeEnv: { SMTP_HOST: 'smtp.example.com' },
        refine: (env) =>
          env.SMTP_HOST && !env.SMTP_PASS ? 'SMTP_PASS is required when SMTP_HOST is set' : true,
      }),
    ).toThrow(/SMTP_PASS is required when SMTP_HOST is set/);
  });

  it('passes when the rule is satisfied', () => {
    const env = defineEnv({
      schema: { SMTP_HOST: e.string().optional(), SMTP_PASS: e.string().optional() },
      runtimeEnv: { SMTP_HOST: 'smtp.example.com', SMTP_PASS: 'hunter2' },
      refine: (env) => (env.SMTP_HOST && !env.SMTP_PASS ? 'missing pass' : true),
    });
    expect(env.SMTP_HOST).toBe('smtp.example.com');
  });

  it('is skipped when per-variable validation already failed', () => {
    // Otherwise the cross-field rule fires on a half-built object and buries
    // the real root cause under a confusing cascade.
    let called = false;
    expect(() =>
      defineEnv({
        schema: { PORT: e.port() },
        runtimeEnv: { PORT: 'not-a-port' },
        refine: () => {
          called = true;
          return 'should not run';
        },
      }),
    ).toThrow(/valid port/);
    expect(called).toBe(false);
  });
});

describe('devDefault / testDefault', () => {
  it('devDefault applies outside production', () => {
    process.env.NODE_ENV = 'development';
    const env = defineEnv({
      schema: { API_URL: e.url().devDefault('http://localhost:3000') },
      runtimeEnv: {},
    });
    expect(env.API_URL).toBe('http://localhost:3000');
  });

  it('devDefault does NOT apply in production — the var stays required', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      defineEnv({
        schema: { API_URL: e.url().devDefault('http://localhost:3000') },
        runtimeEnv: {},
      }),
    ).toThrow(/Missing required/);
  });

  it('testDefault beats devDefault under NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    const env = defineEnv({
      schema: {
        API_KEY: e.string().devDefault('dev-key').testDefault('test-key'),
      },
      runtimeEnv: {},
    });
    expect(env.API_KEY).toBe('test-key');
  });

  it('an explicit value always wins over any default', () => {
    process.env.NODE_ENV = 'development';
    const env = defineEnv({
      schema: { API_KEY: e.string().devDefault('dev-key').default('plain') },
      runtimeEnv: { API_KEY: 'real' },
    });
    expect(env.API_KEY).toBe('real');
  });
});

describe('cascade order', () => {
  it('vite: mode file beats .env.local', () => {
    expect(resolveCascade('production', 'vite')).toEqual([
      '.env',
      '.env.local',
      '.env.production',
      '.env.production.local',
    ]);
  });

  it('next: .env.local beats the mode file (the opposite of vite)', () => {
    expect(resolveCascade('production', 'next')).toEqual([
      '.env',
      '.env.production',
      '.env.local',
      '.env.production.local',
    ]);
  });

  it('skips .env.local under test mode in every order', () => {
    for (const order of ['vite', 'next', 'bun'] as const) {
      expect(resolveCascade('test', order)).not.toContain('.env.local');
    }
  });

  it('defaults to vite for backwards compatibility', () => {
    expect(resolveCascade('production')).toEqual(resolveCascade('production', 'vite'));
  });
});

describe('runtime detection', () => {
  it('reports node in this test process', () => {
    expect(detectRuntimeName()).toBe('node');
  });

  it('identifies a Worker even when process.env exists (nodejs_compat default)', () => {
    const g = globalThis as { WebSocketPair?: unknown };
    g.WebSocketPair = class {};
    try {
      expect(detectRuntimeName()).toBe('workers');
    } finally {
      g.WebSocketPair = undefined;
    }
  });
});

describe('server vars resolve from process.env when runtimeEnv is partial', () => {
  it('lets you enumerate only the client keys (the t3 experimental__runtimeEnv ergonomic)', () => {
    process.env.TEST_DATABASE_URL = 'postgres://from-process-env';
    try {
      const env = defineEnv({
        server: { TEST_DATABASE_URL: e.url() },
        client: { NEXT_PUBLIC_API_URL: e.url() },
        clientPrefix: 'NEXT_PUBLIC_',
        isServer: true,
        runtimeEnvStrict: true,
        // Only the client key is listed — the bundler needs that one inlined.
        runtimeEnv: { NEXT_PUBLIC_API_URL: 'https://api.example.com' },
      });
      expect(env.TEST_DATABASE_URL).toBe('postgres://from-process-env');
      expect(env.NEXT_PUBLIC_API_URL).toBe('https://api.example.com');
    } finally {
      delete process.env.TEST_DATABASE_URL;
    }
  });

  it('an explicit runtimeEnv entry still wins over process.env', () => {
    process.env.TEST_DATABASE_URL = 'postgres://from-process-env';
    try {
      const env = defineEnv({
        server: { TEST_DATABASE_URL: e.url() },
        isServer: true,
        runtimeEnv: { TEST_DATABASE_URL: 'postgres://explicit' },
      });
      expect(env.TEST_DATABASE_URL).toBe('postgres://explicit');
    } finally {
      delete process.env.TEST_DATABASE_URL;
    }
  });

  it('does NOT fall back for client vars — bundler semantics must hold', () => {
    // A dynamic fallback here would give values in dev that vanish in a
    // production build, which is worse than failing loudly.
    process.env.NEXT_PUBLIC_LEAK = 'https://should-not-be-read.example.com';
    try {
      expect(() =>
        defineEnv({
          client: { NEXT_PUBLIC_LEAK: e.url() },
          clientPrefix: 'NEXT_PUBLIC_',
          isServer: true,
          runtimeEnv: {},
        }),
      ).toThrow();
    } finally {
      delete process.env.NEXT_PUBLIC_LEAK;
    }
  });

  it('no fallback on the client', () => {
    process.env.TEST_SERVER_ONLY = 'postgres://secret';
    try {
      const env = defineEnv({
        server: { TEST_SERVER_ONLY: e.url() },
        shared: { NODE_ENV: e.string() },
        clientPrefix: 'NEXT_PUBLIC_',
        isServer: false,
        runtimeEnv: { NODE_ENV: 'production' },
      });
      // Server group is not even validated on the client, and the guard hides it.
      expect(Object.keys(env)).toEqual(['NODE_ENV']);
    } finally {
      delete process.env.TEST_SERVER_ONLY;
    }
  });
});
