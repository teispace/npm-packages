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
function runSchema(schema: EnvSchema, raw: RawEnv, emptyStringAsUndefined = true): ValidationRun {
  const output: Record<string, unknown> = {};
  const issues: EnvIssue[] = [];
  const secretFlags: Record<string, boolean | undefined> = {};

  for (const key in schema) {
    const entry = schema[key] as SchemaEntry;
    const validator = toValidator(entry);
    secretFlags[key] = validator.meta?.secret;

    const result = validator.validate(raw[key], key, emptyStringAsUndefined);
    if (result.ok) {
      // Only attach defined values. A coercer for an optional var returns
      // `{ ok: true, value: undefined }`; keeping the key absent (vs. set to
      // `undefined`) makes `'X' in env` and spreads behave intuitively while
      // the type still permits `undefined`.
      if (result.value !== undefined) output[key] = result.value;
    } else {
      issues.push({
        key,
        received: raw[key],
        messages: result.issues,
        description: validator.meta?.description,
      });
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

/**
 * Assert every declared key has an OWN entry in the caller-supplied
 * `runtimeEnv`. See `DefineEnvOptions.runtimeEnvStrict` for why this matters in
 * bundler-inlined environments.
 *
 * Uses `Object.hasOwn` rather than a truthiness check: mapping a key to
 * `undefined` (because the var genuinely isn't set) is a *correct* mapping and
 * must pass. What we are catching is the key being absent from the object
 * literal entirely, which is the forgotten-line mistake.
 */
function assertRuntimeEnvComplete(
  schemas: ReadonlyArray<EnvSchema>,
  runtimeEnv: RawEnv | undefined,
): void {
  if (!runtimeEnv) {
    throw new Error(
      '❌ Invalid env configuration: `runtimeEnvStrict` is enabled but no `runtimeEnv` was provided.\n' +
        'Pass an explicit object mapping every declared variable to its literal ' +
        '`process.env.X` / `import.meta.env.X` access so the bundler can inline it.',
    );
  }
  const missing: string[] = [];
  for (const schema of schemas) {
    for (const key of Object.keys(schema)) {
      if (!Object.hasOwn(runtimeEnv, key)) missing.push(key);
    }
  }
  if (missing.length === 0) return;

  throw new Error(
    '❌ Invalid env configuration: `runtimeEnv` is missing entries for declared variables.\n' +
      missing.map((key) => `  • ${key}`).join('\n') +
      '\n\nBundlers inline env access statically, so a variable with no literal ' +
      'mapping is simply absent at runtime — usually only discovered in production. ' +
      'Add each one explicitly:\n' +
      missing.map((key) => `  ${key}: process.env.${key},`).join('\n'),
  );
}

/**
 * Run the caller's whole-object `refine` and fold any failures into the same
 * aggregated issue list the per-variable validators use, so one report shows
 * everything.
 *
 * Skipped when there are already per-variable failures: the object handed to
 * `refine` would be missing those keys, so a cross-field rule would report a
 * confusing cascade ("SMTP_PASS required when SMTP_HOST is set") on top of the
 * real root cause ("SMTP_HOST is not a valid hostname").
 */
function applyRefine(
  refine: ((env: Record<string, unknown>) => true | string | string[]) | undefined,
  output: Record<string, unknown>,
  issues: EnvIssue[],
): void {
  if (!refine || issues.length > 0) return;
  const result = refine(output);
  if (result === true) return;
  const messages = Array.isArray(result) ? result : [result];
  if (messages.length === 0) return;
  issues.push({ key: '(env)', received: undefined, messages });
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
  if (opts.runtimeEnvStrict) assertRuntimeEnvComplete([opts.schema], opts.runtimeEnv);

  const rawSource = opts.runtimeEnv ?? detectRawEnv();
  const emptyAsUndefined = opts.emptyStringAsUndefined !== false;
  const raw = normalizeRaw(rawSource, emptyAsUndefined);

  const run = runSchema(opts.schema, raw, emptyAsUndefined);
  applyRefine(opts.refine, run.output, run.issues);
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
 * Refuse a **server** var whose name carries the client prefix.
 *
 * This is the mirror image of {@link assertClientPrefix} and it closes a real
 * leak. Bundlers inline by NAME, not by which group we filed the var under:
 * Next.js replaces every literal `process.env.NEXT_PUBLIC_*` and Vite every
 * `import.meta.env.VITE_*` at build time. So a var called
 * `NEXT_PUBLIC_STRIPE_SECRET` is emitted into the browser bundle even though we
 * classified it as server-only — and our runtime leak guard reports nothing,
 * because from the bundler's point of view it was never a server var at all.
 *
 * Declaring it under `server` therefore buys a false sense of safety. The only
 * correct answer is to reject the configuration and make the author rename it.
 *
 * `shared` is deliberately NOT checked: a prefixed shared var (e.g.
 * `NEXT_PUBLIC_APP_URL`) is public by design and available in both contexts,
 * which is exactly what the prefix advertises.
 */
function assertNoPrefixedServerVars(server: EnvSchema, clientPrefix: string): void {
  if (!clientPrefix) return;
  const offenders = Object.keys(server).filter((key) => key.startsWith(clientPrefix));
  if (offenders.length === 0) return;

  throw new Error(
    `❌ Invalid env configuration: server variables must NOT start with "${clientPrefix}".\n` +
      offenders
        .map((key) => `  • ${key} is in \`server\` but carries the public prefix`)
        .join('\n') +
      `\n\nBundlers inline every "${clientPrefix}" variable into the client bundle by name, ` +
      `so this value ships to the browser regardless of the group it is declared in — ` +
      `the server/client guard cannot protect it.\n` +
      `Rename it without the prefix to keep it server-only, or move it to \`client\`/\`shared\` ` +
      `if it is genuinely safe to expose.`,
  );
}

/**
 * Refuse the same key in more than one group.
 *
 * Beyond being ambiguous (which group's validator wins?), a key present in both
 * `server` and `client`/`shared` used to crash the leak guard on the client: the
 * value IS written onto the frozen target (the client/shared group is validated
 * in every context) while the key is ALSO in `serverKeys`, so the `ownKeys` trap
 * hid an own property of a non-extensible target. That violates a Proxy
 * invariant, and the engine threw
 * `TypeError: 'ownKeys' on proxy: trap result did not include 'X'` from
 * `Object.keys(env)`, `{...env}`, and `JSON.stringify(env)`.
 *
 * `NODE_ENV` declared in both `server` and `shared` is the obvious way to hit
 * this by accident, so we fail loudly at define time with a message that names
 * the key and the groups.
 */
function assertNoDuplicateGroups(server: EnvSchema, client: EnvSchema, shared: EnvSchema): void {
  const groups: ReadonlyArray<readonly [string, EnvSchema]> = [
    ['server', server],
    ['client', client],
    ['shared', shared],
  ];
  const seen = new Map<string, string[]>();
  for (const [groupName, schema] of groups) {
    for (const key of Object.keys(schema)) {
      const found = seen.get(key);
      if (found) found.push(groupName);
      else seen.set(key, [groupName]);
    }
  }
  const offenders = [...seen.entries()].filter(([, names]) => names.length > 1);
  if (offenders.length === 0) return;

  throw new Error(
    `❌ Invalid env configuration: a variable may only be declared in one group.\n` +
      offenders
        .map(([key, names]) => `  • ${key} appears in \`${names.join('` and `')}\``)
        .join('\n') +
      `\n\nPick the group with the widest correct visibility and delete the others ` +
      `(\`shared\` if both server and client need it, \`server\` if only the server does).`,
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

  // Defense in depth for the Proxy invariants. `target` is frozen, so it is
  // non-extensible, and the spec requires `ownKeys`/`getOwnPropertyDescriptor`
  // to report every own key of a non-extensible target. Hiding a key that is
  // actually present therefore throws a TypeError rather than concealing
  // anything. `assertNoDuplicateGroups` already rejects the only way to reach
  // that state, but we narrow to keys genuinely absent from the target so the
  // guard is structurally incapable of throwing even if a future refactor
  // reintroduces the overlap.
  const hidden = new Set([...serverKeys].filter((key) => !Object.hasOwn(target, key)));
  if (hidden.size === 0) return target;

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
      if (typeof prop === 'string' && hidden.has(prop)) {
        return handleInvalid(prop);
      }
      return Reflect.get(obj, prop, receiver);
    },
    has(obj, prop) {
      // Server keys are invisible to `in` on the client so feature-detection
      // (`'DATABASE_URL' in env`) reports the honest client-side answer: no.
      if (typeof prop === 'string' && hidden.has(prop)) return false;
      return Reflect.has(obj, prop);
    },
    ownKeys(obj) {
      // Hide server keys from enumeration/spread on the client.
      return Reflect.ownKeys(obj).filter((k) => !(typeof k === 'string' && hidden.has(k)));
    },
    getOwnPropertyDescriptor(obj, prop) {
      if (typeof prop === 'string' && hidden.has(prop)) return undefined;
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

  // Footgun guards, all at define time so a misconfiguration is a loud startup
  // error rather than a silent leak or a Proxy TypeError at first read.
  assertClientPrefix(client, clientPrefix);
  assertNoPrefixedServerVars(server, clientPrefix);
  assertNoDuplicateGroups(server, client, shared);

  if (opts.runtimeEnvStrict) {
    // Only `client` and `shared` — never `server`.
    //
    // The whole point of the check is bundler static inlining, and a bundler
    // only ever inlines the prefixed vars destined for the browser. Server vars
    // are read from a live `process.env` on the server and are deliberately
    // absent from the client bundle, so demanding a literal mapping for them
    // would be pure friction: it makes authors type out the very names we work
    // to keep off the client, and protects nothing. `shared` IS included
    // because it is read in both contexts, so it does get inlined.
    assertRuntimeEnvComplete([client, shared], opts.runtimeEnv);
  }

  const emptyAsUndefined = opts.emptyStringAsUndefined !== false;

  // Client and shared vars read STRICTLY from `runtimeEnv` when it is supplied.
  // That is the bundler contract: only literal, statically-analysable access
  // survives inlining, so a dynamic fallback would produce values in dev that
  // silently vanish in a production build.
  const raw = normalizeRaw(opts.runtimeEnv ?? detectRawEnv(), emptyAsUndefined);

  // Server vars, on the server, fall back to the live runtime env for any key
  // the caller did not map.
  //
  // Supplying `runtimeEnv` used to replace `process.env` wholesale, so declaring
  // a `server` group and a `runtimeEnv` containing only the client keys made
  // every server var undefined — the exact shape the Next.js docs steer you
  // toward. Server vars need no inlining (they never enter the client bundle)
  // and `process.env` is fully readable on the server, so listing them bought
  // nothing but boilerplate. This mirrors what t3-env settled on with
  // `experimental__runtimeEnv`: enumerate the client, let the server resolve
  // itself. On the client this fallback is skipped entirely and `detectRawEnv()`
  // is empty there anyway, so no server value can leak in through it.
  const serverRaw =
    isServer && opts.runtimeEnv
      ? normalizeRaw({ ...detectRawEnv(), ...opts.runtimeEnv }, emptyAsUndefined)
      : raw;

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
  if (isServer) merge(runSchema(server, serverRaw, emptyAsUndefined));
  // Client and shared vars are validated in every context.
  merge(runSchema(client, raw, emptyAsUndefined));
  merge(runSchema(shared, raw, emptyAsUndefined));

  applyRefine(opts.refine, output, issues);

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

    const emptyAsUndefined = opts.emptyStringAsUndefined !== false;
    const raw = normalizeRaw(source ?? {}, emptyAsUndefined);
    const run = runSchema(opts.schema, raw, emptyAsUndefined);
    applyRefine(opts.refine, run.output, run.issues);
    reportIssues(run, opts);

    const frozen = Object.freeze(run.output) as Readonly<InferEnv<TSchema>>;
    if (cacheable) cache.set(source, frozen);
    return frozen;
  };
}
