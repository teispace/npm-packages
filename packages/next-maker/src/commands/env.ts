import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import {
  addEnvVar,
  type EnvVarSpec,
  type EnvVarType,
  ensurePublicPrefix,
} from '../modifiers/env-var.modifier';

interface EnvCommandOptions {
  type?: string;
  required?: boolean;
  default?: string;
  public?: boolean;
  describe?: string;
  enum?: string;
}

const VALID_TYPES: ReadonlySet<EnvVarType> = new Set([
  'string',
  'url',
  'number',
  'boolean',
  'enum',
]);

const parseType = (raw: string | undefined): EnvVarType => {
  const value = (raw ?? 'string').toLowerCase() as EnvVarType;
  if (!VALID_TYPES.has(value)) {
    throw new Error(`Invalid --type "${raw}". Valid: ${Array.from(VALID_TYPES).join(', ')}.`);
  }
  return value;
};

const parseEnum = (raw: string | undefined): string[] | undefined => {
  if (!raw) return undefined;
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length === 0 ? undefined : values;
};

export const registerEnvCommand = (program: Command) => {
  program
    .command('env <NAME>')
    .description('Declare a new environment variable across schema, .env.example, and .env')
    .option('--type <type>', 'Zod type (string|url|number|boolean|enum)', 'string')
    .option('--required', 'Make the variable required (no .optional() / .default())')
    .option('--default <value>', 'Set a default value (mutually exclusive with --required)')
    .option('--public', 'Mark as public (auto-prefix NEXT_PUBLIC_ and tag .env.example)')
    .option('--describe <text>', 'Description (rendered as .describe() and .env.example comment)')
    .option('--enum <list>', 'Comma-separated values when --type=enum (e.g. "dev,prod")')
    .action(async (name: string, options: EnvCommandOptions) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n🔐 Env Var Generator\n'));

        if (options.required && options.default !== undefined) {
          throw new Error('--required and --default are mutually exclusive.');
        }

        const type = parseType(options.type);
        const enumValues = parseEnum(options.enum);
        if (type === 'enum' && (!enumValues || enumValues.length === 0)) {
          throw new Error('--type=enum requires at least one value via --enum a,b,c.');
        }

        const spec: EnvVarSpec = {
          name,
          type,
          required: !!options.required,
          default: options.default,
          description: options.describe,
          enumValues,
          public: !!options.public,
        };

        spinner.start('Updating schema, .env.example, and .env...');
        const result = await addEnvVar(projectPath, spec);
        spinner.succeed('Env var written');

        const fullName = ensurePublicPrefix(spec.name, spec.public);
        log(pc.green(`\n✨ ${fullName} declared.\n`));
        log(pc.dim('Touched:'));
        log(pc.dim(`  ${result.schemaUpdated ? '✏️ ' : '⏭ '} src/lib/env/schema.ts`));
        log(pc.dim(`  ${result.envExampleUpdated ? '✏️ ' : '⏭ '} .env.example`));
        log(pc.dim(`  ${result.envUpdated ? '✏️ ' : '⏭ '} .env`));
        log('');
      } catch (error) {
        spinner.fail('Env var declaration failed');
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
};
