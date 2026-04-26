import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists, readFile, writeFile } from '../core/files';

/**
 * Adds a new environment variable across the four files that the starter
 * keeps in sync: `.env.example`, `.env` (when present), the Zod
 * `envSchema`, and the typed config. Each transformation is pure and
 * idempotent so the orchestrator can call them in any order without
 * worrying about duplicate writes.
 */

export type EnvVarType = 'string' | 'url' | 'number' | 'boolean' | 'enum';

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

const baseSchemaTypeFor = (spec: EnvVarSpec): string => {
  switch (spec.type) {
    case 'url':
      return 'z.url()';
    case 'number':
      return 'z.coerce.number()';
    case 'boolean':
      return 'z.coerce.boolean()';
    case 'enum': {
      const values = spec.enumValues ?? [];
      if (values.length === 0) {
        throw new Error(`Enum env var "${spec.name}" requires --enum values.`);
      }
      const formatted = values.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(', ');
      return `z.enum([${formatted}])`;
    }
    case 'string':
    default:
      return 'z.string()';
  }
};

/**
 * Build the line that goes inside `envSchema = z.object({ ... })`.
 *
 * Mirrors the starter's house style: numeric/string types get the
 * `preprocess(emptyStringToUndefined, …)` wrapper so empty values in `.env`
 * don't pre-empt zod defaults; enums skip it because they reject empty
 * strings outright anyway.
 */
export const buildSchemaEntry = (spec: EnvVarSpec): string => {
  const fullName = ensurePublicPrefix(spec.name, spec.public);
  const base = baseSchemaTypeFor(spec);

  let inner = base;
  const hasDefault = spec.default !== undefined;
  const optional = !spec.required && !hasDefault;
  if (hasDefault) inner += formatDefault(spec);
  if (optional && spec.type !== 'enum') inner += '.optional()';

  let expression: string;
  if (spec.type === 'enum') {
    expression = inner;
  } else {
    expression = `z.preprocess(emptyStringToUndefined, ${inner})`;
  }

  if (spec.description) {
    const escaped = spec.description.replace(/'/g, "\\'");
    expression += `\n    .describe('${escaped}')`;
  }

  return `  ${fullName}: ${expression},`;
};

const ENV_SCHEMA_RE = /(export const envSchema\s*=\s*z\.object\(\{)([\s\S]*?)(\}\);?)/;

/**
 * Insert a new entry into `envSchema = z.object({ ... })`. Preserves the
 * existing trailing newline shape and is idempotent.
 */
export const injectSchemaEntry = (content: string, spec: EnvVarSpec): string => {
  const fullName = ensurePublicPrefix(spec.name, spec.public);
  const presentRe = new RegExp(`\\b${fullName}\\s*:`);
  if (presentRe.test(content)) return content;

  const match = content.match(ENV_SCHEMA_RE);
  if (!match) {
    throw new Error('Could not locate `export const envSchema = z.object({ … })` in schema.ts.');
  }

  const [, head, body, tail] = match;
  const trimmedBody = body.replace(/\s+$/, '');
  // Ensure prior entry ends with a comma so we don't end up with `foo: zX\n  NEW`
  const normalisedBody =
    trimmedBody.length === 0 || /,\s*$/.test(trimmedBody) ? trimmedBody : `${trimmedBody},`;
  const entry = buildSchemaEntry(spec);
  const newBody = `${normalisedBody}\n${entry}\n`;
  return content.replace(ENV_SCHEMA_RE, `${head}${newBody}${tail}`);
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
}

/**
 * Orchestrates the four-file update. Each step is independently idempotent
 * so partial failures are easy to recover from — re-running picks up where
 * the previous run left off.
 */
export const addEnvVar = async (
  projectPath: string,
  spec: EnvVarSpec,
): Promise<AddEnvVarResult> => {
  validateName(spec.name);

  const schemaPath = path.join(projectPath, 'src/lib/env/schema.ts');
  if (!fileExists(schemaPath)) {
    throw new Error(`src/lib/env/schema.ts not found — run \`next-maker init\` first.`);
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

  return { schemaUpdated, envExampleUpdated, envUpdated };
};
