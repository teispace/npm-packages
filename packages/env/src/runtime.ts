/**
 * Universal runtime detection + raw-env sourcing for `@teispace/env`.
 *
 * Per RESEARCH §2, there is NO universal env global: Node/Bun expose
 * `process.env`, Deno exposes `Deno.env`, and Cloudflare Workers expose NO
 * module-level global at all (the binding is passed per-request into the
 * handler). Browsers and bundled client code have no real runtime env either —
 * bundlers static-replace literal `process.env.X` access at build time, so a
 * dynamic read returns nothing useful.
 *
 * This module is the one piece that the core may pull into a CLIENT bundle, so
 * EVERY export here must be importable and callable in ANY environment without
 * throwing — mirroring the defensive try/guard philosophy of
 * `next-themes/src/core/env.ts`. We probe for the *capability* behind
 * try/catch and degrade to a safe `{}` / `false` rather than crash module load
 * or a consumer's first render.
 */

import type { RawEnv } from './types.js';

/**
 * Minimal structural shapes for the server runtimes we probe. We intentionally
 * do NOT depend on `@types/node` / `@types/deno` ambient globals here, because
 * this file compiles into client bundles too; declaring the globals locally as
 * optional keeps detection self-contained and type-safe everywhere.
 */
interface ProcessLike {
  env?: Record<string, string | undefined>;
  cwd?: () => string;
}
interface DenoLike {
  env?: { toObject?: () => Record<string, string> };
}

/** Read `globalThis.process` defensively; never throws. */
function getProcess(): ProcessLike | undefined {
  try {
    const p = (globalThis as { process?: ProcessLike }).process;
    return p && typeof p === 'object' ? p : undefined;
  } catch (_e) {
    return undefined;
  }
}

/** Read `globalThis.Deno` defensively; never throws. */
function getDeno(): DenoLike | undefined {
  try {
    const d = (globalThis as { Deno?: DenoLike }).Deno;
    return d && typeof d === 'object' ? d : undefined;
  } catch (_e) {
    return undefined;
  }
}

/** True iff `Bun` is present as a global (Bun also fills `process.env`). */
function hasBun(): boolean {
  try {
    return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
  } catch (_e) {
    return false;
  }
}

/**
 * True iff we are in a real DOM context (browser / jsdom). On Node 25
 * `window === globalThis`, so we additionally require `document` with a real
 * `querySelector`, matching the next-themes `isDom` probe — presence of the
 * window binding alone is NOT sufficient to conclude "client".
 */
function isBrowserLike(): boolean {
  try {
    // Access via `globalThis` rather than the bare `window`/`document` globals
    // so this compiles without the DOM lib (this package is intentionally
    // DOM-free for universal use) while staying robust at runtime.
    const win = (globalThis as { window?: unknown }).window;
    const doc = (globalThis as { document?: { querySelector?: unknown } }).document;
    return (
      typeof win !== 'undefined' &&
      typeof doc !== 'undefined' &&
      doc !== null &&
      typeof doc.querySelector === 'function'
    );
  } catch (_e) {
    return false;
  }
}

/**
 * Heuristic for the Cloudflare Workers / edge runtime: it has no `process`
 * global, is not a DOM, yet exposes Worker-only globals like `WebSocketPair`
 * or a CacheStorage `caches`, and its `navigator.userAgent` is "Cloudflare-
 * Workers". We keep this purely best-effort (diagnostics only) and safe.
 */
function isWorkersLike(): boolean {
  try {
    const ua = (globalThis as { navigator?: { userAgent?: unknown } }).navigator?.userAgent;
    if (typeof ua === 'string' && ua.includes('Cloudflare')) return true;
    const hasWebSocketPair =
      typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';
    const hasCaches = typeof (globalThis as { caches?: unknown }).caches !== 'undefined';
    return !getProcess() && !isBrowserLike() && (hasWebSocketPair || hasCaches);
  } catch (_e) {
    return false;
  }
}

/**
 * Return the runtime's raw env bag, defensively. Node/Bun → `process.env`;
 * Deno → `Deno.env.toObject()`. Browsers, Workers, and unknown hosts have no
 * readable global env source, so we return an empty bag. NEVER throws — any
 * failure degrades to `{}`.
 *
 * Note: the returned object is the live `process.env` reference on Node/Bun
 * (so callers writing into it mutate the process), but a fresh snapshot on
 * Deno (`toObject` copies). Callers that need to write env (e.g. the loader)
 * pass an explicit `processEnv` target rather than relying on this shape.
 */
export function detectRawEnv(): RawEnv {
  try {
    const proc = getProcess();
    if (proc && proc.env && typeof proc.env === 'object') {
      return proc.env as RawEnv;
    }

    const deno = getDeno();
    if (deno && deno.env && typeof deno.env.toObject === 'function') {
      return deno.env.toObject() as RawEnv;
    }

    // Browser / Workers / unknown: no global env source.
    return {};
  } catch (_e) {
    return {};
  }
}

/**
 * True when a server-like env global exists (process / Deno / Bun) AND we are
 * not obviously in a browser. Used by the core to decide whether to auto-source
 * env. Defensive — never throws.
 *
 * The browser check uses BOTH `window` and `document` (next-themes pattern) so
 * that Node 25's `window === globalThis` shim is not misread as a client.
 */
export function isServerRuntime(): boolean {
  try {
    if (isBrowserLike()) return false;
    const proc = getProcess();
    if (proc && proc.env && typeof proc.env === 'object') return true;
    const deno = getDeno();
    if (deno && deno.env) return true;
    if (hasBun()) return true;
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Best-effort runtime name for diagnostics / error reports. Ordering matters:
 * Bun and Deno both expose a `process` shim, so we check their distinctive
 * globals first; Workers is inferred from Worker-only globals; a real DOM is
 * `browser`; anything else with a `process` is `node`.
 */
export function detectRuntimeName(): 'node' | 'bun' | 'deno' | 'workers' | 'browser' | 'unknown' {
  try {
    if (hasBun()) return 'bun';
    if (getDeno()) return 'deno';
    if (isWorkersLike()) return 'workers';
    if (isBrowserLike()) return 'browser';
    if (getProcess()) return 'node';
    return 'unknown';
  } catch (_e) {
    return 'unknown';
  }
}

/**
 * Best-effort current working directory, used as the default base for the
 * `.env` cascade. Returns `'.'` when `process.cwd` is unavailable (Deno without
 * the shim, browsers, Workers). Never throws.
 */
export function detectCwd(): string {
  try {
    const proc = getProcess();
    if (proc && typeof proc.cwd === 'function') {
      const dir = proc.cwd();
      if (typeof dir === 'string' && dir.length > 0) return dir;
    }
  } catch (_e) {
    // fall through
  }
  return '.';
}
