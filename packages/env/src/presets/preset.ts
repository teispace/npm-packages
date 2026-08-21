/**
 * Shared factory for framework presets. A preset is thin sugar over
 * `defineEnvSplit` that bakes in the framework's client-exposure prefix and
 * (optionally) a default runtime source, so a consumer writes the minimum
 * boilerplate for their framework while still getting the full validation,
 * coercion, type-inference, and server→client leak guard of the core.
 */
import { defineEnvSplit } from '../define-env.js';
import type { DefineSplitOptions, EnvSchema, InferSplit } from '../types.js';

/** Options a preset accepts — the split options minus the prefix it fixes. */
export type PresetOptions<
  TServer extends EnvSchema,
  TClient extends EnvSchema,
  TShared extends EnvSchema,
> = Omit<DefineSplitOptions<TServer, TClient, TShared>, 'clientPrefix'>;

/**
 * Create a framework-specific `defineEnv` bound to `clientPrefix`. The returned
 * function has the exact inference of `defineEnvSplit`, so `env.X` is fully
 * typed and coerced.
 */
export function createPreset(
  clientPrefix: string,
  /**
   * Default for `runtimeEnvStrict`. Enabled for bundler-inlined frameworks
   * (Next, Vite, …) where a schema key with no literal `runtimeEnv` mapping is
   * silently absent in the browser — the single most common way to ship a
   * broken client env. Callers can still turn it off explicitly.
   */
  defaultRuntimeEnvStrict = false,
) {
  return function defineEnv<
    TServer extends EnvSchema = Record<never, never>,
    TClient extends EnvSchema = Record<never, never>,
    TShared extends EnvSchema = Record<never, never>,
  >(
    opts: PresetOptions<TServer, TClient, TShared>,
  ): Readonly<InferSplit<TServer, TClient, TShared>> {
    return defineEnvSplit({
      runtimeEnvStrict: defaultRuntimeEnvStrict,
      ...opts,
      clientPrefix,
    } as DefineSplitOptions<TServer, TClient, TShared>);
  };
}
