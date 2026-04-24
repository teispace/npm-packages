import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { kebabToPascal } from '../config/utils';
import { detectProjectSetup } from '../detection';
import { generateHook, generateTest } from '../generators';
import { promptForHookDetails } from '../prompts/hook.prompt';

interface HookCommandOptions {
  client?: boolean;
  feature?: string;
  test?: boolean;
  noTest?: boolean;
}

export const registerHookCommand = (program: Command) => {
  program
    .command('hook [name]')
    .description('Generate a custom React hook')
    .option('--client', "Add 'use client' directive (default: true)", true)
    .option('--feature <path>', 'Generate in feature directory (e.g., src/features/auth)')
    .option('--test', 'Also generate a sibling test file')
    .option('--no-test', 'Skip test file generation')
    .action(async (name: string | undefined, options: HookCommandOptions) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n🪝 Hook Generator\n'));

        const detection = await detectProjectSetup(projectPath);

        const hookOptions = await promptForHookDetails(name);
        const pascalName = kebabToPascal(hookOptions.hookName);
        const hookName = `use${pascalName}`;
        const shouldTest = resolveShouldTest(options, detection.hasTests);

        spinner.start('Generating hook...');
        await generateHook({
          name: hookOptions.hookName,
          projectPath,
          isClient: options.client ?? true,
          featurePath: options.feature,
        });
        spinner.succeed('Hook generated');

        const hookFile = options.feature
          ? path.join(projectPath, options.feature, 'hooks', `${hookName}.ts`)
          : path.join(projectPath, 'src/hooks', `${hookName}.ts`);

        let testFile: string | null = null;
        if (shouldTest) {
          spinner.start('Generating test...');
          testFile = await generateTest({
            projectPath,
            sourceFile: hookFile,
            kind: 'hook',
            symbolName: hookName,
            hookUsesStore: detection.hasRedux && !!options.feature,
          });
          spinner.succeed('Test generated');
        }

        const location = options.feature
          ? `${options.feature}/hooks/${hookName}.ts`
          : `src/hooks/${hookName}.ts`;

        log(pc.green(`\n✨ Hook '${hookName}' created successfully!\n`));
        log(pc.dim(`  📄 ${location}`));
        if (testFile) log(pc.dim(`  🧪 ${path.relative(projectPath, testFile)}`));
        log('');
        log(pc.cyan('Usage:'));
        const importPath = options.feature
          ? `${options.feature.replace(/^src\//, '@/')}/hooks/${hookName}`
          : `@/hooks/${hookName}`;
        log(pc.dim(`  import { ${hookName} } from '${importPath}';`));
        log('');
      } catch (error) {
        spinner.fail('Hook generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};

const resolveShouldTest = (
  options: { test?: boolean; noTest?: boolean },
  hasTests: boolean,
): boolean => {
  if (options.noTest) return false;
  if (options.test) return true;
  return hasTests;
};
