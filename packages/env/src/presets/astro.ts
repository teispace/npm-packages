/**
 * Astro preset. Client-exposed vars must be prefixed `PUBLIC_`; Astro exposes
 * them via `import.meta.env`. Pass `runtimeEnv: import.meta.env` (client/SSR)
 * or `process.env` (Node adapter). Server secrets (unprefixed) stay server-only.
 *
 * @example
 * import { defineEnv, e } from '@teispace/env/astro';
 *
 * export const env = defineEnv({
 *   server: { DATABASE_URL: e.url() },
 *   client: { PUBLIC_API_URL: e.url() },
 *   runtimeEnv: import.meta.env,
 * });
 */
import { createPreset } from './preset.js';

export const defineEnv = createPreset('PUBLIC_');

export { e } from '../coercers.js';
export type { EnvValidationError, InferEnv, StandardSchemaV1, Validator } from '../types.js';
export type { PresetOptions } from './preset.js';
