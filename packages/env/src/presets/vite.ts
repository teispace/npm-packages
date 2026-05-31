/**
 * Vite preset. Client-exposed vars must be prefixed `VITE_`; Vite statically
 * replaces `import.meta.env.VITE_*` at build time. Pass `runtimeEnv` reading
 * from `import.meta.env` so the client values survive bundling; on the server
 * (SSR/Node scripts) you can read from `process.env` instead.
 *
 * @example
 * import { defineEnv, e } from '@teispace/env/vite';
 *
 * export const env = defineEnv({
 *   client: { VITE_API_URL: e.url(), VITE_ANALYTICS_ID: e.string() },
 *   runtimeEnv: import.meta.env,
 * });
 */
import { createPreset } from './preset.js';

export const defineEnv = createPreset('VITE_');

export { e } from '../coercers.js';
export type { EnvValidationError, InferEnv, StandardSchemaV1, Validator } from '../types.js';
export type { PresetOptions } from './preset.js';
