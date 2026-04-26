import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addEnvVar,
  appendEnvEntry,
  appendEnvExampleEntry,
  buildSchemaEntry,
  type EnvVarSpec,
  ensurePublicPrefix,
  injectSchemaEntry,
  validateEnvVarName,
} from '../../src/modifiers';

const baseSpec = (overrides: Partial<EnvVarSpec> = {}): EnvVarSpec => ({
  name: 'SENTRY_DSN',
  type: 'string',
  required: false,
  public: false,
  ...overrides,
});

const SAMPLE_SCHEMA = `import { z } from 'zod';

export const emptyStringToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  NEXT_PUBLIC_API_URL: z
    .preprocess(emptyStringToUndefined, z.url().optional())
    .describe('Base URL for the backing API.'),
});

export type Env = z.infer<typeof envSchema>;
`;

describe('validateEnvVarName', () => {
  it('accepts UPPER_SNAKE_CASE', () => {
    expect(() => validateEnvVarName('SENTRY_DSN')).not.toThrow();
    expect(() => validateEnvVarName('NEXT_PUBLIC_API_URL')).not.toThrow();
  });

  it('rejects lowercase or invalid chars', () => {
    expect(() => validateEnvVarName('sentryDsn')).toThrow(/UPPER_SNAKE_CASE/);
    expect(() => validateEnvVarName('SENTRY-DSN')).toThrow(/UPPER_SNAKE_CASE/);
  });
});

describe('ensurePublicPrefix', () => {
  it('prefixes when public and missing', () => {
    expect(ensurePublicPrefix('FEATURE_FLAG', true)).toBe('NEXT_PUBLIC_FEATURE_FLAG');
  });

  it('preserves an existing public prefix', () => {
    expect(ensurePublicPrefix('NEXT_PUBLIC_API_URL', true)).toBe('NEXT_PUBLIC_API_URL');
  });

  it('does nothing when not public', () => {
    expect(ensurePublicPrefix('SECRET', false)).toBe('SECRET');
  });
});

describe('buildSchemaEntry', () => {
  it('emits an optional preprocessed string by default', () => {
    expect(buildSchemaEntry(baseSpec())).toBe(
      '  SENTRY_DSN: z.preprocess(emptyStringToUndefined, z.string().optional()),',
    );
  });

  it('emits z.url() for type=url', () => {
    expect(buildSchemaEntry(baseSpec({ type: 'url' }))).toContain('z.url()');
  });

  it('emits coerced number with default', () => {
    const entry = buildSchemaEntry(baseSpec({ type: 'number', default: '3000' }));
    expect(entry).toContain('z.coerce.number().default(3000)');
    expect(entry).not.toContain('.optional()');
  });

  it('emits boolean default with proper literal', () => {
    expect(buildSchemaEntry(baseSpec({ type: 'boolean', default: 'true' }))).toContain(
      'z.coerce.boolean().default(true)',
    );
  });

  it('emits z.enum without preprocess', () => {
    const entry = buildSchemaEntry(
      baseSpec({ type: 'enum', enumValues: ['dev', 'prod'], default: 'dev' }),
    );
    expect(entry).toContain("z.enum(['dev', 'prod']).default('dev')");
    expect(entry).not.toContain('preprocess');
  });

  it('throws when enum has no values', () => {
    expect(() => buildSchemaEntry(baseSpec({ type: 'enum' }))).toThrow(/--enum/);
  });

  it('omits .optional() when --required', () => {
    const entry = buildSchemaEntry(baseSpec({ required: true }));
    expect(entry).not.toContain('.optional()');
  });

  it('appends .describe(...) when description set', () => {
    const entry = buildSchemaEntry(baseSpec({ description: 'Sentry endpoint' }));
    expect(entry).toContain(".describe('Sentry endpoint')");
  });

  it('escapes single quotes in defaults and descriptions', () => {
    const entry = buildSchemaEntry(baseSpec({ default: "it's", description: "user's note" }));
    expect(entry).toContain(".default('it\\'s')");
    expect(entry).toContain(".describe('user\\'s note')");
  });

  it('auto-prefixes the name when public', () => {
    expect(buildSchemaEntry(baseSpec({ name: 'API_URL', public: true }))).toContain(
      'NEXT_PUBLIC_API_URL:',
    );
  });
});

describe('injectSchemaEntry', () => {
  it('inserts a new entry inside z.object({ ... })', () => {
    const next = injectSchemaEntry(SAMPLE_SCHEMA, baseSpec({ type: 'url' }));
    expect(next).toContain('SENTRY_DSN:');
    expect(next).toContain('NODE_ENV');
    expect(next).toContain('NEXT_PUBLIC_API_URL');
  });

  it('is idempotent', () => {
    const once = injectSchemaEntry(SAMPLE_SCHEMA, baseSpec());
    const twice = injectSchemaEntry(once, baseSpec());
    expect(twice).toBe(once);
  });

  it('detects an existing entry under the prefixed name', () => {
    const next = injectSchemaEntry(SAMPLE_SCHEMA, baseSpec({ name: 'API_URL', public: true }));
    expect(next).toBe(SAMPLE_SCHEMA);
  });

  it('throws when the schema shape is missing', () => {
    expect(() => injectSchemaEntry('export const other = {};\n', baseSpec())).toThrow(/envSchema/);
  });
});

describe('appendEnvExampleEntry', () => {
  it('appends KEY= with description comment', () => {
    const result = appendEnvExampleEntry(
      'EXISTING=value\n',
      baseSpec({ description: 'Sentry endpoint' }),
    );
    expect(result).toContain('# Sentry endpoint');
    expect(result).toContain('SENTRY_DSN=');
  });

  it('appends the public marker when public', () => {
    const result = appendEnvExampleEntry('', baseSpec({ name: 'API_URL', public: true }));
    expect(result).toContain('NEXT_PUBLIC_API_URL= # -public');
  });

  it('writes the default value when present', () => {
    const result = appendEnvExampleEntry('', baseSpec({ default: 'dsn-here' }));
    expect(result).toContain('SENTRY_DSN=dsn-here');
  });

  it('is idempotent', () => {
    const once = appendEnvExampleEntry('', baseSpec());
    const twice = appendEnvExampleEntry(once, baseSpec());
    expect(twice).toBe(once);
  });
});

describe('appendEnvEntry', () => {
  it('does not write the description comment in .env', () => {
    const result = appendEnvEntry('', baseSpec({ description: 'private secret' }));
    expect(result).toBe('SENTRY_DSN=\n');
  });

  it('respects defaults', () => {
    const result = appendEnvEntry('', baseSpec({ default: 'dsn-here' }));
    expect(result).toBe('SENTRY_DSN=dsn-here\n');
  });

  it('is idempotent', () => {
    const once = appendEnvEntry('', baseSpec({ default: 'dsn-here' }));
    const twice = appendEnvEntry(once, baseSpec({ default: 'overridden-by-no-op' }));
    expect(twice).toBe(once);
  });
});

describe('addEnvVar (orchestrator)', () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(path.join(tmpdir(), 'next-maker-env-'));
    await mkdir(path.join(projectPath, 'src/lib/env'), { recursive: true });
    await writeFile(path.join(projectPath, 'src/lib/env/schema.ts'), SAMPLE_SCHEMA);
    await writeFile(path.join(projectPath, '.env.example'), 'NEXT_PUBLIC_API_URL=\n');
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it('updates schema and .env.example, skips .env when missing', async () => {
    const result = await addEnvVar(projectPath, baseSpec());

    expect(result.schemaUpdated).toBe(true);
    expect(result.envExampleUpdated).toBe(true);
    expect(result.envUpdated).toBe(false);

    const schema = await readFile(path.join(projectPath, 'src/lib/env/schema.ts'), 'utf-8');
    expect(schema).toContain('SENTRY_DSN:');

    const example = await readFile(path.join(projectPath, '.env.example'), 'utf-8');
    expect(example).toContain('SENTRY_DSN=');
  });

  it('updates .env when present', async () => {
    await writeFile(path.join(projectPath, '.env'), 'EXISTING=value\n');
    const result = await addEnvVar(projectPath, baseSpec({ default: 'abc' }));
    expect(result.envUpdated).toBe(true);
    const env = await readFile(path.join(projectPath, '.env'), 'utf-8');
    expect(env).toContain('SENTRY_DSN=abc');
  });

  it('is idempotent across full pipeline', async () => {
    await writeFile(path.join(projectPath, '.env'), 'EXISTING=value\n');
    const first = await addEnvVar(projectPath, baseSpec());
    const second = await addEnvVar(projectPath, baseSpec());
    expect(first.schemaUpdated).toBe(true);
    expect(second.schemaUpdated).toBe(false);
    expect(second.envExampleUpdated).toBe(false);
    expect(second.envUpdated).toBe(false);
  });

  it('throws when the schema is missing', async () => {
    await rm(path.join(projectPath, 'src/lib/env/schema.ts'));
    await expect(addEnvVar(projectPath, baseSpec())).rejects.toThrow(/schema\.ts/);
  });

  it('rejects bad names before touching any file', async () => {
    await expect(addEnvVar(projectPath, { ...baseSpec(), name: 'lowercase' })).rejects.toThrow(
      /UPPER_SNAKE_CASE/,
    );
  });
});
