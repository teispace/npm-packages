import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists, readFile, writeFile } from '../core/files';

/**
 * Adds a new environment variable to a project scaffolded with `@teispace/env`.
 *
 * The starter declares its env in `src/lib/env/index.ts` via the split model:
 *
 * ```ts
 * export const env = defineEnv({
 *   server: { ... },     // leak-guarded; reading on the client throws
 *   client: { ... },     // must be NEXT_PUBLIC_*; inlined into the bundle
 *   shared: { ... },     // available everywhere
 *   runtimeEnv: { ... }, // explicit process.env.X mapping (required by Next)
 * });
 * ```
 *
 * A new variable lands in two places that must stay in lockstep: the relevant
 * group object AND the `runtimeEnv` map (Next only statically replaces
 * `process.env.X` at literal access sites, so every declared key must be spelled
 * out there). Public vars go in `client` (with the `NEXT_PUBLIC_` prefix);
 * everything else defaults to the leak-guarded `server` group.
 *
 * Every transformation is pure and idempotent so the orchestrator can call them
 * in any order without risking duplicate writes.
 */

export type EnvVarType = 'string' | 'url' | 'number' | 'boolean' | 'enum';

/** Which `defineEnv` group a variable belongs to. */
export type EnvVarGroup = 'server' | 'client' | 'shared';

export interface EnvVarSpec {
  /** UPPER_SNAKE_CASE identifier as it will appear in the schema and `.env`. */
  name: string;
  type: EnvVarType;
  required: boolean;
  /** When set, the schema gets `.default(...)` and `.env`/`.env.example` get this initial value. */
  default?: string;
  description?: string;
  /** Allowed values when `type === 'enum'`. */
  enumValues?: string[];
  /** When true, mark the value as public (visible to the browser via `# -public` and the NEXT_PUBLIC_ prefix). */
  public: boolean;
}

const NAME_RE = /^[A-Z][A-Z0-9_]*$/;

export const validateName = (name: string): void => {
  if (!NAME_RE.test(name)) {
    throw new Error(
      `Invalid env var name "${name}". Use UPPER_SNAKE_CASE (e.g. SENTRY_DSN, NEXT_PUBLIC_API_URL).`,
    );
  }
};

export const ensurePublicPrefix = (name: string, isPublic: boolean): string => {
  if (!isPublic) return name;
  return name.startsWith('NEXT_PUBLIC_') ? name : `NEXT_PUBLIC_${name}`;
};

/**
 * The `defineEnv` group a variable belongs to. Public vars must live in
 * `client` (the only group the `NEXT_PUBLIC_` prefix rule allows); everything
 * else defaults to the leak-guarded `server` group so secrets never reach the
 * browser bundle by accident.
 */
export const groupFor = (spec: EnvVarSpec): EnvVarGroup => (spec.public ? 'client' : 'server');

const formatDefault = (spec: EnvVarSpec): string => {
  if (spec.default === undefined) return '';
  switch (spec.type) {
    case 'number':
      return `.default(${Number(spec.default)})`;
    case 'boolean':
      return `.default(${spec.default === 'true'})`;
    default:
      return `.default('${spec.default.replace(/'/g, "\\'")}')`;
  }
};

/** The base `e.*` coercer call for a given type. */
const baseCoercerFor = (spec: EnvVarSpec): string => {
  switch (spec.type) {
    case 'url':
      return 'e.url()';
    case 'number':
      return 'e.number()';
    case 'boolean':
      return 'e.boolean()';
    case 'enum': {
      const values = spec.enumValues ?? [];
      if (values.length === 0) {
        throw new Error(`Enum env var "${spec.name}" requires --enum values.`);
      }
      const formatted = values.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(', ');
      return `e.enum([${formatted}])`;
    }
    default:
      return 'e.string()';
  }
};

/**
 * Build the `KEY: e.<type>()...` line that goes inside a `defineEnv` group.
 *
 * `@teispace/env` treats an empty string as absent (its `emptyStringAsUndefined`
 * default), so unlike the old Zod schema there is no `preprocess` wrapper to
 * emit — a `.default()` simply applies when the value is empty/missing.
 */
export const buildSchemaEntry = (spec: EnvVarSpec): string => {
  const fullName = ensurePublicPrefix(spec.name, spec.public);

  let expression = baseCoercerFor(spec);
  const hasDefault = spec.default !== undefined;
  const optional = !spec.required && !hasDefault;
  if (hasDefault) expression += formatDefault(spec);
  if (optional) expression += '.optional()';
  if (spec.description) {
    const escaped = spec.description.replace(/'/g, "\\'");
    expression += `\n      .describe('${escaped}')`;
  }

  return `    ${fullName}: ${expression},`;
};

/** The `KEY: process.env.KEY,` line that goes inside the `runtimeEnv` map. */
export const buildRuntimeEnvEntry = (spec: EnvVarSpec): string => {
  const fullName = ensurePublicPrefix(spec.name, spec.public);
  return `    ${fullName}: process.env.${fullName},`;
};

/**
 * Match a named `key: {` block inside `defineEnv({ ... })` and capture its body.
 * Group 1 = `<group>: {`, group 2 = body, group 3 = closing `}`. Non-greedy so
 * we stop at the first `}` that closes the group (group bodies hold only
 * `KEY: e.x(),` entries, never nested braces of their own besides the entry, so
 * the first balanced close is correct for the starter's shape).
 */
const groupBlockRe = (group: string): RegExp =>
  new RegExp(`(${group}:\\s*\\{)([\\s\\S]*?)(\\n\\s*\\})`);

/** The `runtimeEnv: { ... }` block. */
const RUNTIME_ENV_RE = /(runtimeEnv:\s*\{)([\s\S]*?)(\n\s*\})/;

/** Append `entry` to a captured block body, normalising the trailing comma. */
const appendToBlock = (head: string, body: string, tail: string, entry: string): string => {
  const trimmed = body.replace(/\s+$/, '');
  const normalised = trimmed.length === 0 || /,\s*$/.test(trimmed) ? trimmed : `${trimmed},`;
  return `${head}${normalised}\n${entry}\n${tail.replace(/^\n/, '')}`;
};

/**
 * Insert a new entry into the correct `defineEnv` group and into `runtimeEnv`.
 * Idempotent: a variable already present (by its prefixed name) is left alone.
 */
export const injectSchemaEntry = (content: string, spec: EnvVarSpec): string => {
  const fullName = ensurePublicPrefix(spec.name, spec.public);
  const group = groupFor(spec);

  // Already declared anywhere in the file? No-op.
  const presentRe = new RegExp(`\\b${fullName}\\s*:`);
  if (presentRe.test(content)) return content;

  if (!/defineEnv\(\{/.test(content)) {
    throw new Error(
      'Could not locate `defineEnv({ … })` in src/lib/env/index.ts. Is this a @teispace/env project?',
    );
  }

  // 1. Inject into the group block.
  const blockRe = groupBlockRe(group);
  const blockMatch = content.match(blockRe);
  if (!blockMatch) {
    throw new Error(`Could not locate the \`${group}: { … }\` group in src/lib/env/index.ts.`);
  }
  const [, head, body, tail] = blockMatch;
  const entry = buildSchemaEntry(spec);
  let next = content.replace(blockRe, appendToBlock(head, body, tail, entry));

  // 2. Inject into runtimeEnv.
  const rtMatch = next.match(RUNTIME_ENV_RE);
  if (!rtMatch) {
    throw new Error('Could not locate the `runtimeEnv: { … }` map in src/lib/env/index.ts.');
  }
  const [, rtHead, rtBody, rtTail] = rtMatch;
  next = next.replace(
    RUNTIME_ENV_RE,
    appendToBlock(rtHead, rtBody, rtTail, buildRuntimeEnvEntry(spec)),
  );

  return next;
};

const PUBLIC_MARKER_SUFFIX = '# -public';

const exampleLineFor = (spec: EnvVarSpec): string => {
  const fullName = ensurePublicPrefix(spec.name, spec.public);
  const value = spec.default ?? '';
  const trailing = spec.public ? ` ${PUBLIC_MARKER_SUFFIX}` : '';
  return `${fullName}=${value}${trailing}`;
};

/**
 * Append a `KEY=` (or `KEY=defaultValue`) line to the .env.example contents.
 * Adds an optional comment line for the description. Idempotent.
 */
export const appendEnvExampleEntry = (content: string, spec: EnvVarSpec): string => {
  const fullName = ensurePublicPrefix(spec.name, spec.public);
  const lineRe = new RegExp(`^${fullName}=`, 'm');
  if (lineRe.test(content)) return content;

  const trailingNewline = content === '' || content.endsWith('\n') ? '' : '\n';
  const blank = content === '' ? '' : '\n';
  const description = spec.description ? `# ${spec.description}\n` : '';
  return `${content}${trailingNewline}${blank}${description}${exampleLineFor(spec)}\n`;
};

/**
 * Mirror of `appendEnvExampleEntry` for `.env`. Always uses the spec default
 * (or empty) so secrets aren't leaked into the example file by mistake.
 * Idempotent.
 */
export const appendEnvEntry = (content: string, spec: EnvVarSpec): string => {
  const fullName = ensurePublicPrefix(spec.name, spec.public);
  const lineRe = new RegExp(`^${fullName}=`, 'm');
  if (lineRe.test(content)) return content;

  const trailingNewline = content === '' || content.endsWith('\n') ? '' : '\n';
  const value = spec.default ?? '';
  return `${content}${trailingNewline}${fullName}=${value}\n`;
};

export interface AddEnvVarResult {
  schemaUpdated: boolean;
  envExampleUpdated: boolean;
  envUpdated: boolean;
  /** The group the variable was placed in. */
  group: EnvVarGroup;
}

/**
 * Orchestrates the file updates. Each step is independently idempotent so
 * partial failures are easy to recover from — re-running picks up where the
 * previous run left off.
 */
export const addEnvVar = async (
  projectPath: string,
  spec: EnvVarSpec,
): Promise<AddEnvVarResult> => {
  validateName(spec.name);

  const schemaPath = path.join(projectPath, 'src/lib/env/index.ts');
  if (!fileExists(schemaPath)) {
    throw new Error(`src/lib/env/index.ts not found — run \`next-maker init\` first.`);
  }

  const schemaBefore = await readFile(schemaPath);
  const schemaAfter = injectSchemaEntry(schemaBefore, spec);
  const schemaUpdated = schemaAfter !== schemaBefore;
  if (schemaUpdated) await writeFile(schemaPath, schemaAfter);

  const envExamplePath = path.join(projectPath, PROJECT_PATHS.ENV_EXAMPLE);
  let envExampleUpdated = false;
  if (fileExists(envExamplePath)) {
    const before = await readFile(envExamplePath);
    const after = appendEnvExampleEntry(before, spec);
    envExampleUpdated = after !== before;
    if (envExampleUpdated) await writeFile(envExamplePath, after);
  }

  const envPath = path.join(projectPath, '.env');
  let envUpdated = false;
  if (fileExists(envPath)) {
    const before = await readFile(envPath);
    const after = appendEnvEntry(before, spec);
    envUpdated = after !== before;
    if (envUpdated) await writeFile(envPath, after);
  }

  return { schemaUpdated, envExampleUpdated, envUpdated, group: groupFor(spec) };
};
