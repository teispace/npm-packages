/**
 * Next.js preset. Client-exposed vars must be prefixed `NEXT_PUBLIC_`, which
 * Next inlines into the browser bundle at build time. Because that inlining is
 * a static string replacement, the **client** cannot read env via dynamic
 * access — so you must pass an explicit `runtimeEnv` mapping each declared key
 * to its `process.env.X` literal (Next's bundler can only see literal access).
 * On the server, `process.env` is auto-sourced if you omit `runtimeEnv`.
 *
 * @example
 * // env.ts
 * import { defineEnv, e } from '@teispace/env/next';
 *
 * export const env = defineEnv({
 *   server: { DATABASE_URL: e.url(), STRIPE_SECRET: e.string({ min: 1 }).secret() },
 *   client: { NEXT_PUBLIC_API_URL: e.url() },
 *   // Required so Next's static inlining keeps the client vars:
 *   runtimeEnv: {
 *     DATABASE_URL: process.env.DATABASE_URL,
 *     STRIPE_SECRET: process.env.STRIPE_SECRET,
 *     NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
 *   },
 * });
 */
import { createPreset } from './preset.js';

export const defineEnv = createPreset('NEXT_PUBLIC_');

export { e } from '../coercers.js';
export type { EnvValidationError, InferEnv, StandardSchemaV1, Validator } from '../types.js';
export type { PresetOptions } from './preset.js';
