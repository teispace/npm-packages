/**
 * Foundational contract for `@teispace/env`.
 *
 * Every module codes against the types here. The two validator families —
 * built-in coercers (`e.*`) and external Standard Schema libraries
 * (Zod/Valibot/ArkType) — both normalize to the single `Validator<TOut>`
 * interface so `defineEnv` can infer a fully-typed, coerced output object.
 */

// ---------------------------------------------------------------------------
// Standard Schema spec (https://standardschema.dev) — the 60-line interface
// implemented by Zod/Valibot/ArkType. Inlined so we have ZERO dependencies.
// ---------------------------------------------------------------------------

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }
  export type Result<Output> = SuccessResult<Output> | FailureResult;
  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  export interface PathSegment {
    readonly key: PropertyKey;
  }
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema['~standard']['types']
  >['output'];
}

// ---------------------------------------------------------------------------
// Internal validator — the common shape coercers + std-schema adapters produce
// ---------------------------------------------------------------------------

/**
 * A synchronous validator/coercer for a single env var. Both the built-in
 * `e.*` coercers and the Standard Schema adapter implement this. `validate`
 * receives the raw `string | undefined` from the env source and returns the
 * parsed/coerced value or a list of issues.
 */
export interface Validator<TOut> {
  /**
   * Phantom field carrying the output type for inference (`OutputOf`); never
   * present at runtime. A plain optional property (not a `unique symbol`
   * computed key) so it survives bundling and tooling cleanly.
   */
  readonly _output?: TOut;
  /**
   * Parse a raw env value. `raw` is `undefined` when the variable is absent.
   * Implementations apply defaults, optionality, coercion, and refinement.
   */
  validate(raw: string | undefined, key: string): ValidatorResult<TOut>;
  /** Marks the var as client-safe documentation only; the leak guard uses the schema group. */
  readonly meta?: ValidatorMeta;
}

export interface ValidatorMeta {
  /** Human description, surfaced in error reports and (future) docs generation. */
  readonly description?: string;
  /** When true, the value is redacted in error output (default: inferred as secret). */
  readonly secret?: boolean;
}

export type ValidatorResult<TOut> =
  | { readonly ok: true; readonly value: TOut }
  | { readonly ok: false; readonly issues: ReadonlyArray<string> };

/** Anything usable as a schema entry: a built-in coercer or a Standard Schema. */
export type SchemaEntry = Validator<unknown> | StandardSchemaV1;

/** A schema is a record of env-var name → validator/standard-schema. */
export type EnvSchema = Record<string, SchemaEntry>;

// ---------------------------------------------------------------------------
// Type inference — map a schema to its coerced output object
// ---------------------------------------------------------------------------

/** Extract the output type of a single schema entry. */
export type OutputOf<E> =
  E extends Validator<infer T>
    ? T
    : E extends StandardSchemaV1
      ? StandardSchemaV1.InferOutput<E>
      : never;

/**
 * The fully-typed, coerced output object inferred from a schema. This is the
 * type of the value `defineEnv` returns — the single source of truth, with
 * coerced types (e.g. `PORT: number`) that never "lie" because the value was
 * actually coerced, not just type-asserted.
 */
export type InferEnv<TSchema extends EnvSchema> = {
  readonly [K in keyof TSchema]: OutputOf<TSchema[K]>;
};

// Merge of a client + server split schema.
export type InferSplit<
  TServer extends EnvSchema,
  TClient extends EnvSchema,
  TShared extends EnvSchema,
> = InferEnv<TServer> & InferEnv<TClient> & InferEnv<TShared>;

// ---------------------------------------------------------------------------
// Env source — where raw values come from (runtime-agnostic)
// ---------------------------------------------------------------------------

/** A flat bag of raw env values. `process.env`, a Workers binding, etc. */
export type RawEnv = Record<string, string | undefined>;

// ---------------------------------------------------------------------------
// defineEnv / createEnv options
// ---------------------------------------------------------------------------

export interface DefineEnvOptions<TSchema extends EnvSchema> {
  /** Flat schema (server-only model). Use server/client for the split model. */
  schema: TSchema;
  /**
   * Explicit raw source. Optional on the server (auto-detected from
   * process.env/Deno.env/Bun.env); used as-is when provided. Required when a
   * client schema is present (bundlers can't statically read dynamic access).
   */
  runtimeEnv?: RawEnv;
  /** Skip validation but still apply defaults & coercion (CI/Docker builds). */
  skipValidation?: boolean;
  /** Treat empty strings as absent (so defaults apply). Default: true. */
  emptyStringAsUndefined?: boolean;
  /** Called with the structured failure instead of throwing. */
  onValidationError?: (error: EnvValidationError) => never | void;
  /** Called when a server var is accessed in a client context. */
  onInvalidAccess?: (key: string) => never | void;
}

export interface DefineSplitOptions<
  TServer extends EnvSchema,
  TClient extends EnvSchema,
  TShared extends EnvSchema,
> {
  /** Vars only available on the server; reading them client-side throws. */
  server?: TServer;
  /** Vars exposed to the client; must start with `clientPrefix`. */
  client?: TClient;
  /** Vars available everywhere (no prefix rule). */
  shared?: TShared;
  /** Required prefix for client vars, e.g. `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`. */
  clientPrefix?: string;
  /** Whether code is currently running on the server. Default: auto-detected. */
  isServer?: boolean;
  runtimeEnv?: RawEnv;
  skipValidation?: boolean;
  emptyStringAsUndefined?: boolean;
  onValidationError?: (error: EnvValidationError) => never | void;
  onInvalidAccess?: (key: string) => never | void;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface EnvIssue {
  readonly key: string;
  readonly received: string | undefined;
  readonly messages: ReadonlyArray<string>;
  /** The validator's `meta.description`, if any — shown as a hint in the report. */
  readonly description?: string;
}

/** Thrown when validation fails; aggregates ALL issues (never first-only). */
export class EnvValidationError extends Error {
  readonly issues: ReadonlyArray<EnvIssue>;
  constructor(issues: ReadonlyArray<EnvIssue>, message?: string) {
    super(message ?? EnvValidationError.format(issues));
    this.name = 'EnvValidationError';
    this.issues = issues;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, EnvValidationError.prototype);
  }
  /** Placeholder; the real formatter lives in the error module and is injected. */
  static format(issues: ReadonlyArray<EnvIssue>): string {
    return `Invalid environment variables: ${issues.map((i) => i.key).join(', ')}`;
  }
}
