/**
 * Nuxt preset. Public (client) vars are conventionally prefixed `NUXT_PUBLIC_`
 * (mapped into `runtimeConfig.public`). Validate them as the `client` group;
 * server-only secrets go in `server`. Pass `runtimeEnv: process.env` on the
 * server; for the client, map the declared keys explicitly.
 *
 * @example
 * import { defineEnv, e } from '@teispace/env/nuxt';
 *
 * export const env = defineEnv({
 *   server: { NITRO_PRESET: e.string().optional(), DB_URL: e.url() },
 *   client: { NUXT_PUBLIC_SITE_URL: e.url() },
 *   runtimeEnv: process.env,
 * });
 */
import { createPreset } from './preset.js';

export const defineEnv = createPreset('NUXT_PUBLIC_');

export { e } from '../coercers.js';
export type { EnvValidationError, InferEnv, StandardSchemaV1, Validator } from '../types.js';
export type { PresetOptions } from './preset.js';
