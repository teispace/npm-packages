/**
 * Node / backend preset (NestJS, Express, Fastify, Hono, plain Node, workers,
 * scripts). Backend apps have no client bundle, so there is no prefix rule and
 * no leak guard to worry about — every var is server-side. This preset is a
 * convenience that (optionally) loads `.env` files first, then validates with
 * the flat `defineEnv` model, auto-sourcing `process.env`.
 *
 * @example
 * import { defineEnv, e } from '@teispace/env/node';
 *
 * export const env = defineEnv({
 *   schema: {
 *     NODE_ENV: e.enum(['development', 'production', 'test']).default('development'),
 *     PORT: e.port().default(3000),
 *     DATABASE_URL: e.url(),
 *   },
 *   load: true, // load .env cascade before validating (default: false)
 * });
 *
 * @example NestJS — feed the validated object into ConfigModule
 * import { env } from './env';
 * ConfigModule.forRoot({ validate: () => env, isGlobal: true });
 */
import { defineEnv as coreDefineEnv } from '../define-env.js';
import { loadEnv } from '../load.js';
import type { DefineEnvOptions, EnvSchema, InferEnv } from '../types.js';

export interface NodeDefineEnvOptions<TSchema extends EnvSchema> extends DefineEnvOptions<TSchema> {
  /**
   * Load the `.env` cascade (`.env`, `.env.local`, `.env.[mode]`,
   * `.env.[mode].local`) into `process.env` before validating. Pass `true` for
   * defaults, or an options object forwarded to `loadEnv`. Default: `false`
   * (assumes the runtime or your bootstrap already populated `process.env`).
   */
  load?: boolean | Parameters<typeof loadEnv>[0];
}

export function defineEnv<TSchema extends EnvSchema>(
  opts: NodeDefineEnvOptions<TSchema>,
): Readonly<InferEnv<TSchema>> {
  const { load, ...rest } = opts;
  if (load) {
    loadEnv(load === true ? undefined : load);
  }
  return coreDefineEnv(rest);
}

export { e } from '../coercers.js';
export { loadEnv } from '../load.js';
export type { EnvValidationError, InferEnv, StandardSchemaV1, Validator } from '../types.js';
