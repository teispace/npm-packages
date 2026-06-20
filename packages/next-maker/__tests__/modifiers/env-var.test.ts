import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addEnvVar,
  appendEnvEntry,
  appendEnvExampleEntry,
  buildRuntimeEnvEntry,
  buildSchemaEntry,
  type EnvVarSpec,
  ensurePublicPrefix,
  groupFor,
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

// Mirrors the starter's src/lib/env/index.ts (@teispace/env split model).
const SAMPLE_ENV = `import { defineEnv, e } from '@teispace/env/next';

export const env = defineEnv({
  server: {
    DEFAULT_LOCALE: e.string().default('en'),
  },
  client: {
    NEXT_PUBLIC_API_URL: e.url().optional(),
  },
  shared: {
    NODE_ENV: e.enum(['development', 'production', 'test']).default('development'),
  },
  runtimeEnv: {
    DEFAULT_LOCALE: process.env.DEFAULT_LOCALE,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NODE_ENV: process.env.NODE_ENV,
  },
});

export type Env = typeof env;
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

describe('groupFor', () => {
  it('routes non-public vars to the server group', () => {
    expect(groupFor(baseSpec())).toBe('server');
  });
  it('routes public vars to the client group', () => {
    expect(groupFor(baseSpec({ public: true }))).toBe('client');
  });
});

describe('buildSchemaEntry (@teispace/env coercers)', () => {
  it('emits an optional e.string() by default (no preprocess wrapper)', () => {
    const entry = buildSchemaEntry(baseSpec());
    expect(entry).toContain('SENTRY_DSN: e.string().optional()');
    expect(entry).not.toContain('preprocess');
    expect(entry).not.toContain('z.');
  });

  it('emits e.url() for type=url', () => {
    expect(buildSchemaEntry(baseSpec({ type: 'url' }))).toContain('e.url()');
  });

  it('emits e.number() with default and no .optional()', () => {
    const entry = buildSchemaEntry(baseSpec({ type: 'number', default: '3000' }));
    expect(entry).toContain('e.number().default(3000)');
    expect(entry).not.toContain('.optional()');
  });

  it('emits e.boolean() default with proper literal', () => {
    expect(buildSchemaEntry(baseSpec({ type: 'boolean', default: 'true' }))).toContain(
      'e.boolean().default(true)',
    );
  });

  it('emits e.enum([...])', () => {
    const entry = buildSchemaEntry(
      baseSpec({ type: 'enum', enumValues: ['dev', 'prod'], default: 'dev' }),
    );
    expect(entry).toContain("e.enum(['dev', 'prod']).default('dev')");
  });

  it('throws when enum has no values', () => {
    expect(() => buildSchemaEntry(baseSpec({ type: 'enum' }))).toThrow(/--enum/);
  });

  it('omits .optional() when --required', () => {
    expect(buildSchemaEntry(baseSpec({ required: true }))).not.toContain('.optional()');
  });

  it('appends .describe(...) when description set', () => {
    expect(buildSchemaEntry(baseSpec({ description: 'Sentry endpoint' }))).toContain(
      ".describe('Sentry endpoint')",
    );
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

describe('buildRuntimeEnvEntry', () => {
  it('maps the prefixed name to process.env', () => {
    expect(buildRuntimeEnvEntry(baseSpec())).toBe('    SENTRY_DSN: process.env.SENTRY_DSN,');
  });
  it('uses the public prefix', () => {
    expect(buildRuntimeEnvEntry(baseSpec({ name: 'API_URL', public: true }))).toBe(
      '    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,',
    );
  });
});

describe('injectSchemaEntry (group + runtimeEnv)', () => {
  it('inserts a non-public var into the server group and runtimeEnv', () => {
    const next = injectSchemaEntry(SAMPLE_ENV, baseSpec({ type: 'url' }));
    const serverBlock = next.slice(next.indexOf('server: {'), next.indexOf('client: {'));
    expect(serverBlock).toContain('SENTRY_DSN: e.url().optional()');
    expect(next).toContain('SENTRY_DSN: process.env.SENTRY_DSN,');
    expect(next).toContain('DEFAULT_LOCALE');
    expect(next).toContain('NEXT_PUBLIC_API_URL');
  });

  it('inserts a public var into the client group (prefixed) and runtimeEnv', () => {
    const next = injectSchemaEntry(SAMPLE_ENV, baseSpec({ name: 'FEATURE_X', public: true }));
    const clientBlock = next.slice(next.indexOf('client: {'), next.indexOf('shared: {'));
    expect(clientBlock).toContain('NEXT_PUBLIC_FEATURE_X: e.string().optional()');
    const serverBlock = next.slice(next.indexOf('server: {'), next.indexOf('client: {'));
    expect(serverBlock).not.toContain('FEATURE_X');
    expect(next).toContain('NEXT_PUBLIC_FEATURE_X: process.env.NEXT_PUBLIC_FEATURE_X,');
  });

  it('is idempotent', () => {
    const once = injectSchemaEntry(SAMPLE_ENV, baseSpec());
    const twice = injectSchemaEntry(once, baseSpec());
    expect(twice).toBe(once);
  });

  it('detects an existing entry under the prefixed name', () => {
    const next = injectSchemaEntry(SAMPLE_ENV, baseSpec({ name: 'API_URL', public: true }));
    expect(next).toBe(SAMPLE_ENV);
  });

  it('throws when defineEnv is missing', () => {
    expect(() => injectSchemaEntry('export const other = {};\n', baseSpec())).toThrow(/defineEnv/);
  });

  it('keeps exactly one runtimeEnv block', () => {
    const next = injectSchemaEntry(SAMPLE_ENV, baseSpec());
    expect(next.match(/runtimeEnv:/g)?.length).toBe(1);
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
    expect(appendEnvExampleEntry('', baseSpec({ default: 'dsn-here' }))).toContain(
      'SENTRY_DSN=dsn-here',
    );
  });

  it('is idempotent', () => {
    const once = appendEnvExampleEntry('', baseSpec());
    expect(appendEnvExampleEntry(once, baseSpec())).toBe(once);
  });
});

describe('appendEnvEntry', () => {
  it('does not write the description comment in .env', () => {
    expect(appendEnvEntry('', baseSpec({ description: 'private secret' }))).toBe('SENTRY_DSN=\n');
  });
  it('respects defaults', () => {
    expect(appendEnvEntry('', baseSpec({ default: 'dsn-here' }))).toBe('SENTRY_DSN=dsn-here\n');
  });
  it('is idempotent', () => {
    const once = appendEnvEntry('', baseSpec({ default: 'dsn-here' }));
    expect(appendEnvEntry(once, baseSpec({ default: 'overridden-by-no-op' }))).toBe(once);
  });
});

describe('addEnvVar (orchestrator)', () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(path.join(tmpdir(), 'next-maker-env-'));
    await mkdir(path.join(projectPath, 'src/lib/env'), { recursive: true });
    await writeFile(path.join(projectPath, 'src/lib/env/index.ts'), SAMPLE_ENV);
    await writeFile(path.join(projectPath, '.env.example'), 'NEXT_PUBLIC_API_URL=\n');
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it('updates index.ts and .env.example, skips .env when missing, reports group', async () => {
    const result = await addEnvVar(projectPath, baseSpec());

    expect(result.schemaUpdated).toBe(true);
    expect(result.envExampleUpdated).toBe(true);
    expect(result.envUpdated).toBe(false);
    expect(result.group).toBe('server');

    const index = await readFile(path.join(projectPath, 'src/lib/env/index.ts'), 'utf-8');
    expect(index).toContain('SENTRY_DSN: e.string().optional()');
    expect(index).toContain('SENTRY_DSN: process.env.SENTRY_DSN,');

    const example = await readFile(path.join(projectPath, '.env.example'), 'utf-8');
    expect(example).toContain('SENTRY_DSN=');
  });

  it('places a --public var in the client group', async () => {
    const result = await addEnvVar(projectPath, baseSpec({ name: 'FLAG', public: true }));
    expect(result.group).toBe('client');
    const index = await readFile(path.join(projectPath, 'src/lib/env/index.ts'), 'utf-8');
    const clientBlock = index.slice(index.indexOf('client: {'), index.indexOf('shared: {'));
    expect(clientBlock).toContain('NEXT_PUBLIC_FLAG');
  });

  it('updates .env when present', async () => {
    await writeFile(path.join(projectPath, '.env'), 'EXISTING=value\n');
    const result = await addEnvVar(projectPath, baseSpec({ default: 'abc' }));
    expect(result.envUpdated).toBe(true);
    const env = await readFile(path.join(projectPath, '.env'), 'utf-8');
    expect(env).toContain('SENTRY_DSN=abc');
  });

  it('is idempotent across the full pipeline', async () => {
    await writeFile(path.join(projectPath, '.env'), 'EXISTING=value\n');
    const first = await addEnvVar(projectPath, baseSpec());
    const second = await addEnvVar(projectPath, baseSpec());
    expect(first.schemaUpdated).toBe(true);
    expect(second.schemaUpdated).toBe(false);
    expect(second.envExampleUpdated).toBe(false);
    expect(second.envUpdated).toBe(false);
  });

  it('throws when the env module is missing', async () => {
    await rm(path.join(projectPath, 'src/lib/env/index.ts'));
    await expect(addEnvVar(projectPath, baseSpec())).rejects.toThrow(/index\.ts/);
  });

  it('rejects bad names before touching any file', async () => {
    await expect(addEnvVar(projectPath, { ...baseSpec(), name: 'lowercase' })).rejects.toThrow(
      /UPPER_SNAKE_CASE/,
    );
  });
});
