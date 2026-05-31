/**
 * Built-in, zero-dependency coercers — the `e.*` namespace.
 *
 * Each coercer is a {@link Validator} from the frozen contract: it implements
 * `validate(raw, key)` and carries its output type via the `_output` phantom
 * brand plus precise TS return types, so `InferEnv` infers the *coerced* shape
 * (e.g. `e.port()` → `number`, not `string`). This is the heart of the
 * "types never lie" guarantee in RESEARCH §5b: we coerce the real value, we do
 * not merely assert a type over the raw string.
 *
 * ### Why a fluent builder class (not plain objects)
 * Chainable modifiers (`.optional()`, `.default()`, `.refine()`, …) must
 * *narrow the output type* — `Coercer<number>` → `Coercer<number | undefined>`
 * → `Coercer<number>` — while reusing one runtime. A generic class whose
 * methods return a freshly-typed clone gives us exact inference with a single
 * implementation. Each method returns a NEW instance (immutable builder) so a
 * base coercer can be safely shared and re-decorated.
 *
 * ### The absent / empty path
 * `validate(undefined, key)` is the "absent" branch: it applies `.default()`,
 * `.optional()`, or the required-error. The core normalizes empty strings to
 * `undefined` when `emptyStringAsUndefined` is on, but we are defensive and
 * treat `''` as absent here too, so a coercer is correct in isolation.
 */

import type { StandardSchemaV1, Validator, ValidatorMeta, ValidatorResult } from './types.js';

// ---------------------------------------------------------------------------
// Internal result helpers (kept value-light so secrets never leak by accident)
// ---------------------------------------------------------------------------

/** A success carrying the coerced value. */
function ok<T>(value: T): ValidatorResult<T> {
  return { ok: true, value };
}

/** A failure carrying one or more human-readable issues. */
function err(...issues: string[]): ValidatorResult<never> {
  return { ok: false, issues };
}

/**
 * Quote a received raw value for an error message. Centralised so a future
 * change (e.g. truncation of huge values) lands everywhere. We never call this
 * for secret fields — the core redacts `received`, and our messages stay
 * value-light by naming the *expected* shape, not the bad input.
 */
function quote(raw: string): string {
  return JSON.stringify(raw);
}

/**
 * The function that coerces a *present, non-empty* raw string into `TOut`.
 * The absent/empty/default/optional logic lives in {@link Coercer.validate};
 * a `ParseFn` only ever sees a real string.
 */
type ParseFn<TOut> = (raw: string, key: string) => ValidatorResult<TOut>;

/**
 * A user refinement. Returning `true` passes; `false` fails with a generic
 * message; a `string` fails with that string as the message.
 */
type RefineFn<TOut> = (value: TOut) => boolean | string;

/** Internal, frozen-ish config shared/cloned between builder steps. */
interface CoercerConfig<TBase> {
  /** Coerces a present raw string into the *base* (pre-transform) type. */
  readonly parse: ParseFn<TBase>;
  /** Absent/empty → `undefined` with no error. */
  readonly optional: boolean;
  /** Absent/empty → `defaultValue` (mutually meaningful with `hasDefault`). */
  readonly hasDefault: boolean;
  readonly defaultValue?: unknown;
  /** Refinements run, in order, on the coerced base value. */
  readonly refinements: ReadonlyArray<{ fn: RefineFn<unknown>; message?: string }>;
  /** Optional output map applied last; changes the public `TOut`. */
  readonly transform?: (value: unknown) => unknown;
  readonly meta?: ValidatorMeta;
}

// ---------------------------------------------------------------------------
// The fluent coercer
// ---------------------------------------------------------------------------

/**
 * A chainable, type-narrowing coercer. `TBase` is the type produced by the raw
 * `parse` step; `TOut` is the public output after `.optional()`/`.default()`/
 * `.transform()`. They differ only once `.transform()` is used, which is why
 * the two are tracked separately — refinements always run on `TBase`.
 */
export class Coercer<TOut, TBase = TOut> implements Validator<TOut> {
  /** Phantom only; never read at runtime. Carries `TOut` for inference. */
  declare readonly _output?: TOut;

  /** @internal */ private readonly config: CoercerConfig<TBase>;

  /** @internal — construct via the `e.*` factories, not directly. */
  constructor(config: CoercerConfig<TBase>) {
    this.config = config;
  }

  /** Surfaces `meta` on the `Validator` interface for the error reporter. */
  get meta(): ValidatorMeta | undefined {
    return this.config.meta;
  }

  /** Clone with a patched config, re-typed to the caller's `TOut`/`TBase`. */
  private with<NOut, NBase = TBase>(patch: Partial<CoercerConfig<NBase>>): Coercer<NOut, NBase> {
    return new Coercer<NOut, NBase>({
      ...(this.config as unknown as CoercerConfig<NBase>),
      ...patch,
    });
  }

  // --- the contract entry point ---------------------------------------------

  /**
   * Parse a raw env value. `undefined` (or `''`, treated as absent) takes the
   * default/optional/required branch; otherwise we coerce, refine, then
   * transform. Errors aggregate within a single coercer (e.g. min+regex) so the
   * report shows every problem at once, per RESEARCH §7.
   */
  validate(raw: string | undefined, key: string): ValidatorResult<TOut> {
    const absent = raw === undefined || raw === '';

    if (absent) {
      if (this.config.hasDefault) {
        // Default bypasses parse/refine entirely: it is already a TOut value,
        // and it must apply even under skipValidation (the core calls us).
        return ok(this.config.defaultValue as TOut);
      }
      if (this.config.optional) {
        return ok(undefined as TOut);
      }
      return err(`Missing required environment variable "${key}"`);
    }

    // raw is a present, non-empty string here.
    const parsed = this.config.parse(raw, key);
    if (!parsed.ok) return parsed as ValidatorResult<never>;

    const refined = this.runRefinements(parsed.value, key);
    if (!refined.ok) return refined as ValidatorResult<never>;

    if (this.config.transform) {
      return ok(this.config.transform(refined.value) as TOut);
    }
    return ok(refined.value as unknown as TOut);
  }

  /** Run every refinement against the coerced base value, in order. */
  private runRefinements(value: TBase, key: string): ValidatorResult<TBase> {
    for (const { fn, message } of this.config.refinements) {
      const result = fn(value as unknown);
      if (result === true) continue;
      if (typeof result === 'string') return err(result);
      return err(message ?? `Environment variable "${key}" failed a custom check`);
    }
    return ok(value);
  }

  // --- chainable modifiers ----------------------------------------------------

  /**
   * Absent/empty → `undefined` with no error. Narrows the output to
   * `TOut | undefined`. Mutually exclusive in *effect* with `.default()`:
   * if both are set, the default wins on the absent path.
   */
  optional(): Coercer<TOut | undefined, TBase> {
    return this.with<TOut | undefined>({ optional: true });
  }

  /**
   * Absent/empty → `value`, and the field becomes non-optional in the type.
   * Crucially the default is returned *verbatim* without re-parsing, so it
   * applies even under `skipValidation` (fixing the t3-env #266 footgun where
   * skipping validation also dropped defaults).
   */
  default(value: TOut): Coercer<TOut, TBase> {
    return this.with<TOut>({ hasDefault: true, defaultValue: value });
  }

  /** Attach a human description, surfaced in error reports and future docs. */
  describe(description: string): Coercer<TOut, TBase> {
    return this.with<TOut>({ meta: { ...this.config.meta, description } });
  }

  /** Mark as a secret so the error reporter redacts its received value. */
  secret(): Coercer<TOut, TBase> {
    return this.with<TOut>({ meta: { ...this.config.meta, secret: true } });
  }

  /** Mark as client-safe (non-secret); received values may be shown in errors. */
  public(): Coercer<TOut, TBase> {
    return this.with<TOut>({ meta: { ...this.config.meta, secret: false } });
  }

  /**
   * Add a custom check on the coerced value. Return `true` to pass, `false` to
   * fail with `message` (or a generic message), or a `string` to fail with that
   * string as the message. Runs on the base value before any `.transform()`.
   */
  refine(fn: RefineFn<TOut>, message?: string): Coercer<TOut, TBase> {
    return this.with<TOut>({
      refinements: [...this.config.refinements, { fn: fn as RefineFn<unknown>, message }],
    });
  }

  /**
   * Map the coerced value to a new output type `U`. Applied last, after parse
   * and refinements. Changing `TOut` here does not change `TBase`, so chained
   * refinements still see the pre-transform value (matching Zod/Valibot order).
   */
  transform<U>(fn: (value: TOut) => U): Coercer<U, TBase> {
    return this.with<U, TBase>({
      transform: fn as (value: unknown) => unknown,
    });
  }
}

/** Build a base coercer from a `parse` function with empty modifier state. */
function make<T>(parse: ParseFn<T>): Coercer<T> {
  return new Coercer<T>({
    parse,
    optional: false,
    hasDefault: false,
    refinements: [],
  });
}

// ---------------------------------------------------------------------------
// Primitive coercers
// ---------------------------------------------------------------------------

export interface StringOptions {
  /** Minimum length (inclusive). */
  readonly min?: number;
  /** Maximum length (inclusive). */
  readonly max?: number;
  /** Must match this anchored-or-not pattern. */
  readonly regex?: RegExp;
  /** Must start with this literal prefix. */
  readonly startsWith?: string;
  /** Must end with this literal suffix. */
  readonly endsWith?: string;
}

/** A non-empty string, with optional length / pattern / affix constraints. */
export function string(opts: StringOptions = {}): Coercer<string> {
  return make<string>((raw) => {
    if (opts.min !== undefined && raw.length < opts.min) {
      return err(`Expected a string of length >= ${opts.min}, received length ${raw.length}`);
    }
    if (opts.max !== undefined && raw.length > opts.max) {
      return err(`Expected a string of length <= ${opts.max}, received length ${raw.length}`);
    }
    if (opts.startsWith !== undefined && !raw.startsWith(opts.startsWith)) {
      return err(`Expected a string starting with ${quote(opts.startsWith)}`);
    }
    if (opts.endsWith !== undefined && !raw.endsWith(opts.endsWith)) {
      return err(`Expected a string ending with ${quote(opts.endsWith)}`);
    }
    if (opts.regex !== undefined && !opts.regex.test(raw)) {
      return err(`Expected a string matching ${String(opts.regex)}`);
    }
    return ok(raw);
  });
}

export interface NumberOptions {
  /** Minimum value (inclusive). */
  readonly min?: number;
  /** Maximum value (inclusive). */
  readonly max?: number;
  /** Require an integer (no fractional part). */
  readonly int?: boolean;
}

/**
 * Coerce a numeric string to a `number` (`"3.14"` → `3.14`). Rejects `NaN`,
 * blank/whitespace, and `Infinity`, none of which are meaningful config.
 */
export function number(opts: NumberOptions = {}): Coercer<number> {
  return make<number>((raw) => {
    // `Number('')` is 0 and `Number('  ')` is 0 — guard explicitly so blank
    // input is a clear error rather than a silent zero.
    if (raw.trim() === '') {
      return err(`Expected a number, received ${quote(raw)}`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return err(`Expected a finite number, received ${quote(raw)}`);
    }
    if (opts.int && !Number.isInteger(value)) {
      return err(`Expected an integer, received ${quote(raw)}`);
    }
    if (opts.min !== undefined && value < opts.min) {
      return err(`Expected a number >= ${opts.min}, received ${value}`);
    }
    if (opts.max !== undefined && value > opts.max) {
      return err(`Expected a number <= ${opts.max}, received ${value}`);
    }
    return ok(value);
  });
}

/** An integer (rejects fractional values like `"3.14"`). */
export function int(opts: Omit<NumberOptions, 'int'> = {}): Coercer<number> {
  return number({ ...opts, int: true });
}

/** A TCP port: an integer in `1..65535`. */
export function port(): Coercer<number> {
  return make<number>((raw) => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      return err(`Expected a valid port (1-65535), received ${quote(raw)}`);
    }
    return ok(value);
  });
}

/**
 * The accepted truthy/falsy spellings for {@link boolean}. Case-insensitive.
 * Empty string is handled upstream (absent path), but `'false'`/`'0'`/`'no'`/
 * `'off'` are explicit falses so a present "off" flag is honoured.
 */
const BOOL_TRUE = new Set(['true', '1', 'yes', 'on']);
const BOOL_FALSE = new Set(['false', '0', 'no', 'off', '']);

/**
 * Coerce common boolean spellings (case-insensitive): `true/1/yes/on` → `true`,
 * `false/0/no/off/''` → `false`. Anything else is an error — we never guess.
 */
export function boolean(): Coercer<boolean> {
  return make<boolean>((raw) => {
    const normalized = raw.trim().toLowerCase();
    if (BOOL_TRUE.has(normalized)) return ok(true);
    if (BOOL_FALSE.has(normalized)) return ok(false);
    return err(`Expected a boolean (true/false/1/0/yes/no/on/off), received ${quote(raw)}`);
  });
}

// ---------------------------------------------------------------------------
// String-shaped coercers (url / email / host)
// ---------------------------------------------------------------------------

export interface UrlOptions {
  /**
   * Allowed protocol(s), with or without the trailing colon (`'https'` or
   * `'https:'`). When set, the URL's protocol must be one of these (and the
   * default dangerous-scheme check is bypassed in favor of this allow-list).
   */
  readonly protocol?: string | ReadonlyArray<string>;
  /**
   * Allow script-bearing schemes (`javascript:`, `data:`, `vbscript:`,
   * `file:`) that are rejected by default. Only set this if you genuinely need
   * such a value and understand the risk. Default: `false`.
   */
  readonly allowDangerousSchemes?: boolean;
}

/** Normalise a protocol option entry to the `WHATWG URL.protocol` form (`'https:'`). */
function normalizeProtocol(p: string): string {
  const lower = p.toLowerCase();
  return lower.endsWith(':') ? lower : `${lower}:`;
}

/**
 * Script-bearing URL schemes that no environment variable legitimately needs
 * and that are dangerous if a value flows into the DOM/`eval`. Rejected by
 * default (secure-by-default) while still allowing every normal network scheme
 * — `http(s)`, `postgres://`, `redis://`, `amqp://`, `mongodb://`, etc. — so
 * backend connection strings keep working. Override with `protocol` to set an
 * explicit allow-list, or `allowDangerousSchemes: true` to opt out entirely.
 */
const DANGEROUS_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'file:']);

/** Validate a raw string as a URL via the WHATWG `URL` parser; returns the `URL`. */
function parseUrl(raw: string, opts: UrlOptions): ValidatorResult<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return err(`Expected a valid URL, received ${quote(raw)}`);
  }
  if (opts.protocol !== undefined) {
    const allowed = (Array.isArray(opts.protocol) ? opts.protocol : [opts.protocol]).map(
      normalizeProtocol,
    );
    if (!allowed.includes(url.protocol)) {
      const list = allowed.join(', ');
      return err(`Expected a URL with protocol ${list}, received protocol "${url.protocol}"`);
    }
  } else if (!opts.allowDangerousSchemes && DANGEROUS_PROTOCOLS.has(url.protocol)) {
    // No explicit allow-list: reject only the script-bearing schemes.
    return err(
      `Refusing URL with unsafe protocol "${url.protocol}". Pass { protocol: [...] } to allow ` +
        'it explicitly, or { allowDangerousSchemes: true } to opt out of this check.',
    );
  }
  return ok(url);
}

/**
 * A valid URL string, validated via the WHATWG `URL` parser. Returns the
 * original string by default (most config wants the string). Use
 * {@link urlObject} / `.asUrl()` for a `URL` instance.
 */
export function url(opts: UrlOptions = {}): Coercer<string> {
  return make<string>((raw) => {
    const result = parseUrl(raw, opts);
    return result.ok ? ok(raw) : (result as ValidatorResult<never>);
  });
}

/** Like {@link url} but yields a parsed `URL` instance instead of the string. */
export function urlObject(opts: UrlOptions = {}): Coercer<URL> {
  return make<URL>((raw) => parseUrl(raw, opts));
}

/**
 * A sane, anchored email regex. Deliberately not RFC-5322-complete: it rejects
 * the obviously-wrong while staying linear-time (no nested quantifiers → no
 * catastrophic backtracking). Single `@`, non-empty local part, dotted domain.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** A syntactically valid email address (string). */
export function email(): Coercer<string> {
  return make<string>((raw) => {
    if (!EMAIL_RE.test(raw)) {
      return err(`Expected a valid email address, received ${quote(raw)}`);
    }
    return ok(raw);
  });
}

/**
 * Hostname label/host validation. Anchored and linear-time. Accepts DNS
 * hostnames (`example.com`, `localhost`) and is intentionally strict: no
 * scheme, no port, no path. IPv4 passes naturally (digits + dots).
 */
const HOST_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?:\.(?!-)[A-Za-z0-9-]{1,63})*$/;

/** A valid hostname (no scheme/port/path), e.g. `example.com` or `localhost`. */
export function hostname(): Coercer<string> {
  return make<string>((raw) => {
    if (!HOST_RE.test(raw)) {
      return err(`Expected a valid hostname, received ${quote(raw)}`);
    }
    return ok(raw);
  });
}

/** Alias of {@link hostname}; the env vocabulary often says "host". */
export function host(): Coercer<string> {
  return hostname();
}

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

/**
 * One of a fixed set of string literals. The return type narrows to the union
 * of the literals (e.g. `Coercer<'a' | 'b'>`), not `string`, so consumers get
 * exhaustive narrowing. Pass the values `as const` for literal inference.
 */
export function enumOf<const T extends readonly [string, ...string[]]>(
  values: T,
): Coercer<T[number]> {
  const set = new Set<string>(values);
  return make<T[number]>((raw) => {
    if (!set.has(raw)) {
      const list = values.map((v) => quote(v)).join(', ');
      return err(`Expected one of [${list}], received ${quote(raw)}`);
    }
    return ok(raw as T[number]);
  });
}

// ---------------------------------------------------------------------------
// JSON (with optional inner schema)
// ---------------------------------------------------------------------------

/**
 * Minimal structural check for a Standard Schema, kept local to avoid a runtime
 * import cycle with `standard-schema.ts`. The adapter there is the canonical
 * detector; here we only need enough to branch.
 */
function looksLikeStandardSchema(x: unknown): x is StandardSchemaV1 {
  return (
    typeof x === 'object' &&
    x !== null &&
    '~standard' in x &&
    typeof (x as { '~standard'?: { version?: unknown } })['~standard'] === 'object' &&
    (x as { '~standard': { version?: unknown } })['~standard'].version === 1
  );
}

/** Minimal structural check for one of our (or any) `Validator`s. */
function looksLikeValidator(x: unknown): x is Validator<unknown> {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { validate?: unknown }).validate === 'function'
  );
}

/**
 * Parse a JSON string with `JSON.parse`, optionally validating the parsed shape
 * with an inner {@link Validator} or Standard Schema. Without an inner schema,
 * the output type defaults to `unknown` (caller may pass a `T`), since JSON is
 * structurally opaque to the parser.
 *
 * @example e.json<{ port: number }>()
 * @example e.json(e.array())                 // inner Validator
 * @example e.json(z.object({ a: z.string() })) // inner Standard Schema
 */
export function json<T = unknown>(): Coercer<T>;
export function json<TInner>(inner: Validator<TInner>): Coercer<TInner>;
export function json<S extends StandardSchemaV1>(
  inner: S,
): Coercer<StandardSchemaV1.InferOutput<S>>;
export function json(inner?: Validator<unknown> | StandardSchemaV1): Coercer<unknown> {
  return make<unknown>((raw, key) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return err(`Expected valid JSON, received ${quote(raw)}`);
    }
    if (inner === undefined) return ok(parsed);

    // Validate the parsed *value* (not the raw string) against the inner schema.
    if (looksLikeValidator(inner)) {
      // Inner validators expect the raw env string; JSON has already produced a
      // structured value, so we adapt by feeding it through a value-validator.
      // We re-use `validateValue` to keep the Standard Schema path uniform.
      return validateParsedValue(parsed, inner, key);
    }
    if (looksLikeStandardSchema(inner)) {
      return validateStandardValue(parsed, inner);
    }
    // Unreachable for typed callers; defensive for JS consumers.
    return ok(parsed);
  });
}

/**
 * Validate an already-parsed value against an inner `Validator`. Our own
 * coercers expect a raw *string*, so a structured (non-string) parsed value
 * cannot be re-coerced by them; in that case we accept it as-is (the inner
 * `Validator` was likely a Standard Schema wrapper, handled separately). When
 * the parsed value is a string we can defer to the validator directly.
 */
function validateParsedValue(
  value: unknown,
  inner: Validator<unknown>,
  key: string,
): ValidatorResult<unknown> {
  if (typeof value === 'string' || value === undefined) {
    return inner.validate(value as string | undefined, key);
  }
  // Non-string structured JSON: a string-coercer can't validate it. Accept the
  // parsed value; callers wanting deep validation should pass a Standard Schema.
  return ok(value);
}

/** Validate an already-parsed value against a Standard Schema (sync only). */
function validateStandardValue(value: unknown, schema: StandardSchemaV1): ValidatorResult<unknown> {
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) {
    throw new Error(
      'Async Standard Schema validation is not supported for env vars; use a synchronous schema',
    );
  }
  if (result.issues) {
    return err(...result.issues.map((i) => i.message));
  }
  return ok(result.value);
}

// ---------------------------------------------------------------------------
// Array (split a delimited string, optionally coercing each element)
// ---------------------------------------------------------------------------

export interface ArrayOptions<TItem = string> {
  /** Delimiter to split on. Default `','`. */
  readonly separator?: string;
  /** Trim whitespace around each element. Default `true`. */
  readonly trim?: boolean;
  /** Coerce/validate each element with this `Validator`. Default: keep string. */
  readonly of?: Validator<TItem>;
}

/**
 * Split a delimited string into an array. By default splits on `,`, trims each
 * element, and yields `string[]`. Pass `of` to coerce/validate each element
 * (e.g. `e.array({ of: e.number() })` → `number[]`); element errors aggregate
 * with their index so the report pinpoints the bad entry.
 */
export function array(opts?: { separator?: string; trim?: boolean }): Coercer<string[]>;
export function array<TItem>(opts: ArrayOptions<TItem>): Coercer<TItem[]>;
export function array<TItem = string>(opts: ArrayOptions<TItem> = {}): Coercer<TItem[]> {
  const separator = opts.separator ?? ',';
  const trim = opts.trim ?? true;
  const of = opts.of;
  return make<TItem[]>((raw, key) => {
    const parts = raw.split(separator).map((p) => (trim ? p.trim() : p));
    if (of === undefined) {
      return ok(parts as unknown as TItem[]);
    }
    const out: TItem[] = [];
    const issues: string[] = [];
    parts.forEach((part, index) => {
      const result = of.validate(part, `${key}[${index}]`);
      if (result.ok) {
        out.push(result.value);
      } else {
        for (const message of result.issues) {
          issues.push(`[${index}] ${message}`);
        }
      }
    });
    if (issues.length > 0) return err(...issues);
    return ok(out);
  });
}

// ---------------------------------------------------------------------------
// The `e` namespace — the public, ergonomic surface
// ---------------------------------------------------------------------------

/**
 * The built-in coercer namespace. Import as `import { e } from '@teispace/env'`
 * and compose: `e.port().default(3000)`, `e.enum(['a','b']).optional()`, etc.
 * Every factory returns a {@link Coercer}, which is a {@link Validator}, so it
 * drops straight into a `defineEnv` schema alongside Standard Schema validators.
 */
export const e = {
  string,
  number,
  int,
  port,
  boolean,
  url,
  /** URL variant returning a parsed `URL` instance instead of the string. */
  urlObject,
  email,
  /** One of a fixed set of string literals (narrows to the union). */
  enum: enumOf,
  /** Alias of {@link enumOf}. */
  oneOf: enumOf,
  json,
  array,
  host,
  hostname,
} as const;
