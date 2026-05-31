/**
 * Standard Schema → {@link Validator} adapter.
 *
 * [Standard Schema](https://standardschema.dev) is the 60-line interface
 * implemented by Zod, Valibot, and ArkType (see RESEARCH §4). Wrapping it lets
 * `defineEnv` accept any of those validators next to the built-in `e.*`
 * coercers, all normalised to one `Validator<TOut>` shape so `InferEnv` infers
 * uniformly.
 *
 * ### Synchronous-only — and why
 * `validate` in the spec MAY return a `Promise`. Env validation is *eager and
 * synchronous* (a frozen object returned at module init), so an async schema
 * cannot be honoured. We detect a returned `Promise` and throw a clear,
 * actionable error rather than silently producing a pending value. In practice
 * every env-relevant Zod/Valibot/ArkType schema validates synchronously.
 */

import { Coercer } from './coercers.js';
import type { StandardSchemaV1, Validator, ValidatorResult } from './types.js';

/** The output type a Standard Schema produces, for adapter return typing. */
type InferOutput<S extends StandardSchemaV1> = StandardSchemaV1.InferOutput<S>;

/**
 * Structural type guard for a Standard Schema: an object exposing a `~standard`
 * prop whose `version` is exactly `1`. This is the spec's own discriminator, so
 * it reliably tells Zod/Valibot/ArkType schemas apart from our coercers.
 */
export function isStandardSchema(x: unknown): x is StandardSchemaV1 {
  if (typeof x !== 'object' || x === null || !('~standard' in x)) return false;
  const std = (x as { '~standard'?: unknown })['~standard'];
  return typeof std === 'object' && std !== null && (std as { version?: unknown }).version === 1;
}

/**
 * Structural type guard for one of our (or any) {@link Validator}s. A coercer is
 * an object with a `validate` method; the `_output` brand is type-only so we
 * cannot probe it at runtime. We additionally require it is NOT a Standard
 * Schema, so the two guards are mutually exclusive for the normalizer.
 */
export function isValidator(x: unknown): x is Validator<unknown> {
  if (typeof x !== 'object' || x === null) return false;
  if (isStandardSchema(x)) return false;
  return typeof (x as { validate?: unknown }).validate === 'function';
}

/**
 * Run a Standard Schema synchronously and map its result to a
 * {@link ValidatorResult}. Shared by the env-string adapter and the JSON
 * inner-schema path. Throws on async (Promise) results.
 */
function runStandard<S extends StandardSchemaV1>(
  schema: S,
  value: unknown,
): ValidatorResult<InferOutput<S>> {
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) {
    throw new Error(
      'Async Standard Schema validation is not supported for env vars; use a synchronous schema',
    );
  }
  if (result.issues) {
    // Flatten issue messages; the core attaches the key and renders the report.
    return { ok: false, issues: result.issues.map((issue) => issue.message) };
  }
  return { ok: true, value: result.value as InferOutput<S> };
}

/**
 * Wrap a Standard Schema as a {@link Validator}. The schema receives the raw
 * `string | undefined` from the env source as-is — the schema itself owns
 * optionality/defaults/coercion (e.g. `z.coerce.number().default(3000)`), so we
 * do not second-guess absence here; we simply forward and map the result.
 *
 * @example fromStandardSchema(z.string().url())
 */
export function fromStandardSchema<S extends StandardSchemaV1>(
  schema: S,
): Validator<InferOutput<S>> {
  // The `_output` brand is a type-only optional phantom on `Validator`; the
  // explicit return annotation carries the inferred output type, so we do NOT
  // emit a runtime `_output` key here (nothing reads it at runtime).
  return {
    validate(raw: string | undefined): ValidatorResult<InferOutput<S>> {
      return runStandard(schema, raw);
    },
  };
}

/**
 * Normalise any {@link SchemaEntry} to a {@link Validator}. Returns the entry
 * unchanged when it is already a `Validator` (a built-in coercer or a prior
 * adapter), or wraps it via {@link fromStandardSchema} when it is a Standard
 * Schema. The core uses this so the rest of the pipeline only ever sees
 * `Validator`s.
 *
 * Note: a `Coercer` is itself a `Validator`, so it short-circuits here. We check
 * Standard Schema *first* because a wrapped schema is never a coercer, and a
 * coercer is never a Standard Schema — the two guards are disjoint.
 */
export function toValidator(entry: Validator<unknown> | StandardSchemaV1): Validator<unknown> {
  if (entry instanceof Coercer) return entry;
  if (isStandardSchema(entry)) return fromStandardSchema(entry);
  if (isValidator(entry)) return entry;
  // Defensive: a malformed entry that is neither. Surface it as a hard error at
  // schema-build time rather than failing cryptically during validation.
  throw new TypeError(
    'Invalid schema entry: expected a coercer (e.*), a Validator, or a Standard Schema',
  );
}
