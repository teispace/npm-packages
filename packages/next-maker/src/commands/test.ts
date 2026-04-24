import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { kebabToCamel, kebabToPascal } from '../config/utils';
import { fileExists, readFile } from '../core/files';
import { detectProjectSetup } from '../detection';
import { generateTest, type TestKind } from '../generators';

interface TestCommandOptions {
  kind?: string;
  force?: boolean;
}

export const registerTestCommand = (program: Command) => {
  program
    .command('test <file>')
    .description(
      'Generate a sibling test file for an existing component, hook, or slice.\n' +
        'Infers the kind from filename/content; pass --kind to override.',
    )
    .option('--kind <kind>', 'Override inferred kind: component | hook | slice')
    .option('--force', 'Overwrite an existing test file')
    .action(async (file: string, options: TestCommandOptions) => {
      try {
        const projectPath = process.cwd();
        const sourceFile = path.isAbsolute(file) ? file : path.join(projectPath, file);

        log(pc.cyan('\n🧪 Test Generator\n'));

        if (!fileExists(sourceFile)) {
          logError(`Source file not found: ${file}`);
          process.exit(1);
        }

        const detection = await detectProjectSetup(projectPath);
        if (!detection.hasTests) {
          logError(
            'Testing is not installed in this project. Run `next-maker setup --tests` first.',
          );
          process.exit(1);
        }

        const content = await readFile(sourceFile);
        const kind = validateKind(options.kind) ?? inferKind(sourceFile, content);
        if (!kind) {
          logError(
            `Could not infer test kind for ${path.basename(sourceFile)}. Pass --kind component|hook|slice.`,
          );
          process.exit(1);
        }

        const symbolName = inferSymbolName(sourceFile, kind);

        const testPath = getTestPath(sourceFile, kind);
        if (fileExists(testPath) && !options.force) {
          logError(
            `Test file already exists: ${path.relative(projectPath, testPath)}. Use --force to overwrite.`,
          );
          process.exit(1);
        }

        spinner.start(`Generating ${kind} test...`);
        const written = await generateTest({
          projectPath,
          sourceFile,
          kind,
          symbolName,
          hasRedux: detection.hasRedux,
          hasI18n: detection.hasI18n,
          hookUsesStore:
            kind === 'hook' && detection.hasRedux && content.includes('useAppSelector'),
        });
        spinner.succeed('Test generated');

        log(pc.green(`\n✨ Test '${path.basename(written)}' created.\n`));
        log(pc.dim(`  🧪 ${path.relative(projectPath, written)}`));
        log('');
      } catch (error) {
        spinner.fail('Test generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};

const validateKind = (input: string | undefined): TestKind | null => {
  if (!input) return null;
  if (input === 'component' || input === 'hook' || input === 'slice') return input;
  throw new Error(`Invalid --kind: ${input}. Use component | hook | slice.`);
};

const inferKind = (sourceFile: string, content: string): TestKind | null => {
  const base = path.basename(sourceFile);
  if (/\.slice\.ts$/.test(base)) return 'slice';
  if (/^use[A-Z]/.test(base.replace(/\.tsx?$/, ''))) return 'hook';
  if (base.endsWith('.tsx')) return 'component';
  // .ts file that's not a slice and not a hook — check content for signals.
  if (/createSlice\s*\(/.test(content)) return 'slice';
  if (/^export\s+(const|function)\s+use[A-Z]/m.test(content)) return 'hook';
  return null;
};

const inferSymbolName = (sourceFile: string, kind: TestKind): string => {
  const base = path.basename(sourceFile).replace(/\.(tsx?|jsx?)$/i, '');
  if (kind === 'slice') {
    // counter.slice → counter
    return kebabToCamel(base.replace(/\.slice$/, ''));
  }
  if (kind === 'hook') {
    // useCounter.ts → useCounter; use-counter.ts → useCounter
    if (/^use[A-Z]/.test(base)) return base;
    return `use${kebabToPascal(base.replace(/^use-?/, ''))}`;
  }
  return kebabToPascal(base);
};

const getTestPath = (sourceFile: string, kind: TestKind): string => {
  const dir = path.dirname(sourceFile);
  const base = path.basename(sourceFile).replace(/\.(tsx?|jsx?)$/i, '');
  const ext = kind === 'component' ? '.tsx' : '.ts';
  return path.join(dir, `${base}.test${ext}`);
};
