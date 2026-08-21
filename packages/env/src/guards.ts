/**
 * Dependency-free structural type guards shared across the package.
 *
 * This module deliberately imports **only types**, so it can be pulled in from
 * anywhere without creating a runtime import cycle. That matters here: the
 * `~standard` detector is needed by both `standard-schema.ts` (which owns the
 * public adapter) and `coercers.ts` (whose `e.json()` accepts an inner schema).
 * Those two modules already import each other, so previously `coercers.ts`
 * carried private near-copies of these guards with a comment explaining the
 * cycle. Hoisting the implementations here removes the duplication and the
 * cycle at once — `guards.ts` is a leaf.
 */

import type { StandardSchemaV1, Validator } from './types.js';

/**
 * A Standard Schema is an object exposing a `~standard` property whose
 * `version` is exactly `1`. That is the spec's own discriminator, so it
 * reliably separates Zod/Valibot/ArkType schemas from our coercers.
 */
export function isStandardSchemaLike(x: unknown): x is StandardSchemaV1 {
  if (typeof x !== 'object' || x === null || !('~standard' in x)) return false;
  const std = (x as { '~standard'?: unknown })['~standard'];
  return typeof std === 'object' && std !== null && (std as { version?: unknown }).version === 1;
}

/**
 * Anything exposing a `validate` method. Note this is the *loose* check: a
 * Standard Schema does not satisfy it (it has no top-level `validate`), but
 * callers that need the two to be mutually exclusive should compose with
 * {@link isStandardSchemaLike} — the public `isValidator` in
 * `standard-schema.ts` does exactly that.
 */
export function isValidatorLike(x: unknown): x is Validator<unknown> {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { validate?: unknown }).validate === 'function'
  );
}

/**
 * Detect a promise-like value structurally rather than with `instanceof Promise`.
 *
 * A Standard Schema's `validate` may return a thenable that is not a native,
 * same-realm `Promise` — a cross-realm promise (Node `vm`, a worker, an iframe)
 * or a userland/polyfilled implementation. `instanceof` misses all of those, and
 * the miss was silent and severe: such a value has no `.issues`, so it read as a
 * success whose `value` is `undefined`, and because the core drops undefined
 * values the variable vanished from the env object with **no error at all**.
 * Duck-typing on `.then` closes that hole.
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}
