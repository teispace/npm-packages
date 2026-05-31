/**
 * The core of `@teispace/env`: turn a schema of coercers / Standard Schema
 * validators into a **validated, coerced, frozen** configuration object that is
 * the single source of truth for an app's environment.
 *
 * Three entry points, one validation engine:
 *
 * - {@link defineEnv} — eager. Two shapes via overloads:
 *     • flat/server `{ schema }` (auto-reads `process.env`/`Deno.env`/`Bun.env`)
 *     • split `{ server?, client?, shared?, clientPrefix }` with a client leak
 *       guard. `defineEnv` dispatches on the presence of split keys; a typed
 *       {@link defineEnvSplit} alias exists for callers who prefer to be explicit.
 * - {@link createEnv} — lazy. Returns a parser `(source) => env` for runtimes
 *   with **no module-level env** (Cloudflare Workers pass the binding into the
 *   request handler). Same validation, memoized per source object.
 *
 * Why a returned object instead of augmenting `process.env`: a coercer turns
 * `"3000"` into the number `3000`. If we only augmented the *type* of
 * `process.env.PORT`, reading the raw global would still hand back the string
 * `"3000"` — the type would lie. By returning the coerced value we guarantee
 * `env.PORT` is `number` at both the type and the value level (see RESEARCH §5b).
 *
 * Robustness guarantees (RESEARCH §7):
 * - Validation runs **once**, at module evaluation (or once per Worker binding).
 *   The result is frozen; reads are plain property access with no re-validation.
 * - **All** failures are aggregated into one {@link EnvValidationError}, never
 *   first-error-only.
 * - `skipValidation` still applies defaults and coercion — it only suppresses
 *   the *throw*. This fixes the t3-env footgun (issue #266) where skipping
 *   validation also silently dropped your `.default()` values.
 * - Secrets are never logged; the error report redacts them (see `./errors`).
 */

import { formatEnvErrors } from './errors.js';
import { detectRawEnv, isServerRuntime } from './runtime.js';
import { toValidator } from './standard-schema.js';
import {
  type DefineEnvOptions,
  type DefineSplitOptions,
  type EnvIssue,
  type EnvSchema,
  EnvValidationError,
  type InferEnv,
  type InferSplit,
  type RawEnv,
  type SchemaEntry,
} from './types.js';

// ---------------------------------------------------------------------------
// Shared validation engine
// ---------------------------------------------------------------------------

/** Outcome of validating one schema group against one raw source. */
interface ValidationRun {
  /** Successfully coerced values, keyed by var name. Mutable until frozen by callers. */
  readonly output: Record<string, unknown>;
  /** Every failure encountered, in schema order. */
  readonly issues: EnvIssue[];
  /** Per-key explicit `meta.secret` flag, forwarded to the error formatter. */
  readonly secretFlags: Record<string, boolean | undefined>;
}

/**
 * Normalize a raw env source: when `emptyStringAsUndefined` is on (the
 * default), an empty string is treated as *absent* so a validator's
 * `.default()` / `.optional()` kicks in. Many platforms (shells, CI, Docker)
 * surface an unset var as `''` rather than truly missing it, and "set to
 * empty" almost never means "the operator chose the empty string".
 *
 * Returns a shallow copy; the caller's source object is never mutated.
 */
function normalizeRaw(raw: RawEnv, emptyStringAsUndefined: boolean): RawEnv {
  if (!emptyStringAsUndefined) return raw;
  const out: RawEnv = {};
  for (const key in raw) {
    const value = raw[key];
    out[key] = value === '' ? undefined : value;
  }
  return out;
}

/**
 * Run a single schema group over a normalized source, collecting successes and
 * failures. Pure and side-effect free: it does not throw, freeze, or read any
 * global — callers decide what to do with the aggregated result. This is the
 * one place where coercion actually happens, so the flat, split, and Workers
 * paths all share identical semantics.
 */
function runSchema(schema: EnvSchema, raw: RawEnv): ValidationRun {
  const output: Record<string, unknown> = {};
  const issues: EnvIssue[] = [];
  const secretFlags: Record<string, boolean | undefined> = {};

  for (const key in schema) {
    const entry = schema[key] as SchemaEntry;
    const validator = toValidator(entry);
    secretFlags[key] = validator.meta?.secret;

    const result = validator.validate(raw[key], key);
    if (result.ok) {
      // Only attach defined values. A coercer for an optional var returns
      // `{ ok: true, value: undefined }`; keeping the key absent (vs. set to
      // `undefined`) makes `'X' in env` and spreads behave intuitively while
      // the type still permits `undefined`.
      if (result.value !== undefined) output[key] = result.value;
    } else {
      issues.push({ key, received: raw[key], messages: result.issues });
    }
  }

  return { output, issues, secretFlags };
}

/**
 * Apply the shared "what to do with issues" policy. When there are failures and
 * validation isn't skipped, build the rich aggregated error (redacting secrets)
 * and either hand it to `onValidationError` or throw it. Returns normally when
 * there's nothing to report or validation was skipped — in which case the
 * already-collected defaults/coercions stand (the #266 fix).
 */
function reportIssues(
  run: ValidationRun,
  opts: {
    skipValidation?: boolean;
    onValidationError?: (error: EnvValidationError) => never | void;
  },
): void {
  if (run.issues.length === 0 || opts.skipValidation) return;

  const message = formatEnvErrors(run.issues, { secretFlags: run.secretFlags });
  const error = new EnvValidationError(run.issues, message);

  if (opts.onValidationError) {
    opts.onValidationError(error);
    return;
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Flat / server model
// ---------------------------------------------------------------------------

function defineFlat<TSchema extends EnvSchema>(
  opts: DefineEnvOptions<TSchema>,
): Readonly<InferEnv<TSchema>> {
  // Server can auto-source from the runtime; an explicit `runtimeEnv` always
  // wins (required on the client, where bundlers statically replace literal
  // `process.env.X` access and dynamic reads return `undefined` — RESEARCH §2).
  const rawSource = opts.runtimeEnv ?? detectRawEnv();
  const raw = normalizeRaw(rawSource, opts.emptyStringAsUndefined !== false);

  const run = runSchema(opts.schema, raw);
  reportIssues(run, opts);

  return Object.freeze(run.output) as Readonly<InferEnv<TSchema>>;
}

// ---------------------------------------------------------------------------
// Split / client-server model
// ---------------------------------------------------------------------------

/** The prefix to use when none is supplied; effectively "no client/server divide". */
const NO_PREFIX = '';

/**
 * Validate that every declared client var carries the configured
 * `clientPrefix`. This is a **config-time** assertion, not a runtime data
 * check: a secret living under the `client` group without the public prefix
 * (e.g. `STRIPE_SECRET` instead of `NEXT_PUBLIC_STRIPE_KEY`) would be shipped
 * to the browser, so we refuse to construct the env at all and point the author
 * at the offending key. Catching this at define time turns a silent security
 * leak into a loud, immediate error.
 */
function assertClientPrefix(client: EnvSchema, clientPrefix: string): void {
  if (!clientPrefix) return; // No prefix configured -> no rule to enforce.
  const offenders = Object.keys(client).filter((key) => !key.startsWith(clientPrefix));
  if (offenders.length === 0) return;

  throw new Error(
    `❌ Invalid env configuration: client variables must start with "${clientPrefix}".\n` +
      offenders.map((key) => `  • ${key} is in \`client\` but lacks the prefix`).join('\n') +
      `\n\nMove these to \`server\` (kept off the client) or rename them with the ` +
      `"${clientPrefix}" prefix so the bundler can safely expose them.`,
  );
}

/**
 * Wrap the merged env object in a Proxy that throws when a **server** var is
 * read in a **client** context. The underlying object actually holds every
 * value (so server code reads everything freely); the guard only fires on the
 * client. This is the headline safety feature: a refactor that accidentally
 * imports `env.DATABASE_URL` into a client component fails loudly at the read
 * instead of silently bundling a secret (or silently yielding `undefined`).
 *
 * The proxy keeps ordinary object behavior intact for allowed keys:
 * `Object.keys`, spreads, `in`, and `JSON.stringify` only ever see the
 * client/shared surface on the client because we trap `ownKeys`/`getOwner`
 * to hide server keys there.
 */
function createLeakGuard<T extends object>(
  target: T,
  serverKeys: ReadonlySet<string>,
  isServer: boolean,
  onInvalidAccess?: (key: string) => never | void,
): T {
  // On the server there is nothing to guard; return the frozen object directly
  // so we don't pay proxy overhead on every property read in backend code.
  if (isServer || serverKeys.size === 0) return target;

  const handleInvalid = (key: string): undefined => {
    if (onInvalidAccess) {
      onInvalidAccess(key);
      return undefined;
    }
    throw new Error(
      `❌ Attempted to access server-only env var "${key}" on the client.\n` +
        `This variable is declared under \`server\` and is intentionally not ` +
        `bundled into client code. Read it from server code, or move it to ` +
        `\`client\`/\`shared\` (with the client prefix) if it is safe to expose.`,
    );
  };

  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === 'string' && serverKeys.has(prop)) {
        return handleInvalid(prop);
      }
      return Reflect.get(obj, prop, receiver);
    },
    has(obj, prop) {
      // Server keys are invisible to `in` on the client so feature-detection
      // (`'DATABASE_URL' in env`) reports the honest client-side answer: no.
      if (typeof prop === 'string' && serverKeys.has(prop)) return false;
      return Reflect.has(obj, prop);
    },
    ownKeys(obj) {
      // Hide server keys from enumeration/spread on the client.
      return Reflect.ownKeys(obj).filter((k) => !(typeof k === 'string' && serverKeys.has(k)));
    },
    getOwnPropertyDescriptor(obj, prop) {
      if (typeof prop === 'string' && serverKeys.has(prop)) return undefined;
      return Reflect.getOwnPropertyDescriptor(obj, prop);
    },
  });
}

function defineSplit<
  TServer extends EnvSchema,
  TClient extends EnvSchema,
  TShared extends EnvSchema,
>(
  opts: DefineSplitOptions<TServer, TClient, TShared>,
): Readonly<InferSplit<TServer, TClient, TShared>> {
  const server = (opts.server ?? {}) as EnvSchema;
  const client = (opts.client ?? {}) as EnvSchema;
  const shared = (opts.shared ?? {}) as EnvSchema;
  const clientPrefix = opts.clientPrefix ?? NO_PREFIX;
  const isServer = opts.isServer ?? isServerRuntime();

  // Footgun guard: refuse to build if a client var is missing the prefix.
  assertClientPrefix(client, clientPrefix);

  const rawSource = opts.runtimeEnv ?? detectRawEnv();
  const raw = normalizeRaw(rawSource, opts.emptyStringAsUndefined !== false);

  const output: Record<string, unknown> = {};
  const issues: EnvIssue[] = [];
  const secretFlags: Record<string, boolean | undefined> = {};

  const merge = (run: ValidationRun): void => {
    Object.assign(output, run.output);
    issues.push(...run.issues);
    Object.assign(secretFlags, run.secretFlags);
  };

  // Server vars are validated/exposed only on the server. On the client they
  // are neither read nor reported — they simply do not exist there, and the
  // leak guard makes any attempt to read one throw.
  if (isServer) merge(runSchema(server, raw));
  // Client and shared vars are validated in every context.
  merge(runSchema(client, raw));
  merge(runSchema(shared, raw));

  if (issues.length > 0 && !opts.skipValidation) {
    const message = formatEnvErrors(issues, { secretFlags });
    const error = new EnvValidationError(issues, message);
    if (opts.onValidationError) opts.onValidationError(error);
    else throw error;
  }

  const frozen = Object.freeze(output);
  const serverKeys = new Set(Object.keys(server));
  return createLeakGuard(frozen, serverKeys, isServer, opts.onInvalidAccess) as Readonly<
    InferSplit<TServer, TClient, TShared>
  >;
}

// ---------------------------------------------------------------------------
// Public `defineEnv` — overloaded dispatcher
// ---------------------------------------------------------------------------

/** True when the options object describes a split (client/server) env. */
function isSplitOptions(opts: object): boolean {
  return 'server' in opts || 'client' in opts || 'shared' in opts || 'clientPrefix' in opts;
}

/**
 * Define a flat, server-side env from a single `schema`. Auto-reads
 * `process.env`/`Deno.env`/`Bun.env`; pass `runtimeEnv` to override.
 */
export function defineEnv<TSchema extends EnvSchema>(
  opts: DefineEnvOptions<TSchema>,
): Readonly<InferEnv<TSchema>>;
/**
 * Define a split client/server env with a leak guard. Server vars are validated
 * only on the server and throw if read on the client; client vars must carry
 * `clientPrefix`; shared vars are available everywhere.
 */
export function defineEnv<
  TServer extends EnvSchema,
  TClient extends EnvSchema,
  TShared extends EnvSchema,
>(
  opts: DefineSplitOptions<TServer, TClient, TShared>,
): Readonly<InferSplit<TServer, TClient, TShared>>;
export function defineEnv(opts: object): object {
  if (isSplitOptions(opts)) {
    return defineSplit(opts as DefineSplitOptions<EnvSchema, EnvSchema, EnvSchema>);
  }
  return defineFlat(opts as DefineEnvOptions<EnvSchema>);
}

/**
 * Explicit alias for the split model — identical to calling {@link defineEnv}
 * with `server`/`client`/`shared`, for callers who prefer the intent to be
 * obvious at the call site.
 */
export function defineEnvSplit<
  TServer extends EnvSchema,
  TClient extends EnvSchema,
  TShared extends EnvSchema,
>(
  opts: DefineSplitOptions<TServer, TClient, TShared>,
): Readonly<InferSplit<TServer, TClient, TShared>> {
  return defineSplit(opts);
}

// ---------------------------------------------------------------------------
// createEnv — lazy parser for context-passing runtimes (Cloudflare Workers)
// ---------------------------------------------------------------------------

/**
 * Build a **parser** for runtimes that have no module-level env object. On
 * Cloudflare Workers the bindings arrive as an argument to `fetch(req, env)`,
 * so there is nothing to auto-source at import time; instead you call the
 * returned function per request with the binding object.
 *
 * The parser is memoized by source **identity** (a `WeakMap`): Workers reuse
 * the same `env` binding object across requests in a live isolate, so we
 * validate it once and hand back the cached frozen result on subsequent calls —
 * preserving the "parse once" guarantee even on the per-request path. A
 * different binding object (e.g. in tests, or a new isolate) re-validates.
 *
 * @example
 * const parseEnv = createEnv({ schema: { API_KEY: e.string() } });
 * export default {
 *   fetch(req: Request, env: unknown) {
 *     const cfg = parseEnv(env); // cfg.API_KEY is typed
 *   },
 * };
 */
export function createEnv<TSchema extends EnvSchema>(
  opts: DefineEnvOptions<TSchema>,
): (source: RawEnv) => Readonly<InferEnv<TSchema>> {
  // Keyed by the binding object so each distinct env is validated at most once.
  // WeakMap lets the cache entry be GC'd with the binding it describes.
  const cache = new WeakMap<object, Readonly<InferEnv<TSchema>>>();

  return (source: RawEnv): Readonly<InferEnv<TSchema>> => {
    // Primitive/nullish sources can't key a WeakMap; validate them directly.
    // (Shouldn't happen with a real binding, but we never want the parser to
    // throw a TypeError from caching rather than a clear validation error.)
    const cacheable = typeof source === 'object' && source !== null;
    if (cacheable) {
      const hit = cache.get(source);
      if (hit) return hit;
    }

    const raw = normalizeRaw(source ?? {}, opts.emptyStringAsUndefined !== false);
    const run = runSchema(opts.schema, raw);
    reportIssues(run, opts);

    const frozen = Object.freeze(run.output) as Readonly<InferEnv<TSchema>>;
    if (cacheable) cache.set(source, frozen);
    return frozen;
  };
}
