import { afterEach, describe, expect, it } from 'vitest';
import { detectCwd, detectRawEnv, detectRuntimeName, isServerRuntime } from '../src/runtime';

/**
 * Stash + restore globals we stub so branches can be exercised in isolation
 * without leaking into sibling tests. We assign via `globalThis` casts because
 * `Deno`/`Bun`/`WebSocketPair` are not declared in the Node lib.
 */
const g = globalThis as Record<string, unknown>;

afterEach(() => {
  delete g.Deno;
  delete g.Bun;
  delete g.WebSocketPair;
  delete g.caches;
  // `window`/`document`/`navigator` are managed per-test below.
});

describe('detectRawEnv', () => {
  it('returns process.env in Node', () => {
    process.env.__TEIS_ENV_PROBE__ = 'present';
    const raw = detectRawEnv();
    expect(raw.__TEIS_ENV_PROBE__).toBe('present');
    delete process.env.__TEIS_ENV_PROBE__;
  });

  it('reads Deno.env.toObject when process is shadowed away', () => {
    // Simulate Deno: no usable process.env, but Deno.env.toObject exists.
    const realProcess = g.process;
    g.process = undefined;
    g.Deno = { env: { toObject: () => ({ DENO_VAR: 'x' }) } };
    try {
      expect(detectRawEnv()).toEqual({ DENO_VAR: 'x' });
    } finally {
      g.process = realProcess;
    }
  });

  it('returns {} and never throws when a source getter throws', () => {
    const realProcess = g.process;
    // A process whose `env` access throws (sandboxed/exotic host).
    Object.defineProperty(g, 'process', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(() => detectRawEnv()).not.toThrow();
      expect(detectRawEnv()).toEqual({});
    } finally {
      Object.defineProperty(g, 'process', {
        configurable: true,
        writable: true,
        value: realProcess,
      });
    }
  });

  it('returns {} with no process and no Deno (browser/Workers/unknown)', () => {
    const realProcess = g.process;
    g.process = undefined;
    try {
      expect(detectRawEnv()).toEqual({});
    } finally {
      g.process = realProcess;
    }
  });
});

describe('isServerRuntime', () => {
  it('is true in Node', () => {
    expect(isServerRuntime()).toBe(true);
  });

  it('is false when window + document are present (browser)', () => {
    g.window = g;
    g.document = { querySelector: () => null };
    try {
      expect(isServerRuntime()).toBe(false);
    } finally {
      delete g.window;
      delete g.document;
    }
  });

  it('is true when only Bun is present (no process.env)', () => {
    const realProcess = g.process;
    g.process = undefined;
    g.Bun = {};
    try {
      expect(isServerRuntime()).toBe(true);
    } finally {
      g.process = realProcess;
    }
  });

  it('is true when only Deno.env is present', () => {
    const realProcess = g.process;
    g.process = undefined;
    g.Deno = { env: { toObject: () => ({}) } };
    try {
      expect(isServerRuntime()).toBe(true);
    } finally {
      g.process = realProcess;
    }
  });

  it('never throws', () => {
    expect(() => isServerRuntime()).not.toThrow();
  });
});

describe('detectRuntimeName', () => {
  it("returns 'node' under vitest node env", () => {
    expect(detectRuntimeName()).toBe('node');
  });

  it("returns 'bun' when Bun global is stubbed", () => {
    g.Bun = {};
    expect(detectRuntimeName()).toBe('bun');
  });

  it("returns 'deno' when Deno global is stubbed", () => {
    g.Deno = { env: { toObject: () => ({}) } };
    expect(detectRuntimeName()).toBe('deno');
  });

  it("returns 'workers' for a Cloudflare-like global (no process, WebSocketPair)", () => {
    const realProcess = g.process;
    g.process = undefined;
    g.WebSocketPair = function WebSocketPair() {};
    try {
      expect(detectRuntimeName()).toBe('workers');
    } finally {
      g.process = realProcess;
    }
  });

  it("returns 'browser' when window + document present and no server global", () => {
    const realProcess = g.process;
    g.process = undefined;
    g.window = g;
    g.document = { querySelector: () => null };
    try {
      expect(detectRuntimeName()).toBe('browser');
    } finally {
      g.process = realProcess;
      delete g.window;
      delete g.document;
    }
  });

  it("returns 'unknown' with no recognizable global", () => {
    const realProcess = g.process;
    g.process = undefined;
    try {
      expect(detectRuntimeName()).toBe('unknown');
    } finally {
      g.process = realProcess;
    }
  });

  it('never throws', () => {
    expect(() => detectRuntimeName()).not.toThrow();
  });
});

describe('detectCwd', () => {
  it('returns process.cwd() in Node', () => {
    expect(detectCwd()).toBe(process.cwd());
  });

  it("falls back to '.' when process.cwd is unavailable", () => {
    const realProcess = g.process;
    g.process = { env: {} }; // process exists but no cwd fn
    try {
      expect(detectCwd()).toBe('.');
    } finally {
      g.process = realProcess;
    }
  });
});
