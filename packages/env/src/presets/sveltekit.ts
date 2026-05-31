/**
 * SvelteKit preset. Public (client) vars must be prefixed `PUBLIC_` (SvelteKit
 * exposes them via `$env/static/public` / `$env/dynamic/public`); everything
 * else is private/server-only (`$env/static/private`). Validate `client` for
 * the public group and `server` for private secrets.
 *
 * Because SvelteKit's `$env/static/*` modules are virtual and tree-shaken, pass
 * the declared values explicitly via `runtimeEnv` (importing the virtual module
 * values), or `process.env` in a plain Node server context.
 *
 * @example
 * import { defineEnv, e } from '@teispace/env/sveltekit';
 *
 * export const env = defineEnv({
 *   server: { DATABASE_URL: e.url(), SECRET_KEY: e.string().min(1) },
 *   client: { PUBLIC_BASE_URL: e.url() },
 *   runtimeEnv: process.env,
 * });
 */
import { createPreset } from './preset.js';

export const defineEnv = createPreset('PUBLIC_');

export { e } from '../coercers.js';
export type { EnvValidationError, InferEnv, StandardSchemaV1, Validator } from '../types.js';
export type { PresetOptions } from './preset.js';
