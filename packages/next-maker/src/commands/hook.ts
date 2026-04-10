import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { kebabToPascal } from '../config/utils';
import { generateHook } from '../generators';
import { promptForHookDetails } from '../prompts/hook.prompt';

interface HookCommandOptions {
  client?: boolean;
  feature?: string;
}

export const registerHookCommand = (program: Command) => {
  program
    .command('hook [name]')
    .description('Generate a custom React hook')
    .option('--client', "Add 'use client' directive (default: true)", true)
    .option('--feature <path>', 'Generate in feature directory (e.g., src/features/auth)')
    .action(async (name: string | undefined, options: HookCommandOptions) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n🪝 Hook Generator\n'));

        const hookOptions = await promptForHookDetails(name);
        const pascalName = kebabToPascal(hookOptions.hookName);
        const hookName = `use${pascalName}`;

        spinner.start('Generating hook...');
        await generateHook({
          name: hookOptions.hookName,
          projectPath,
          isClient: options.client ?? true,
          featurePath: options.feature,
        });
        spinner.succeed('Hook generated');

        const location = options.feature
          ? `${options.feature}/hooks/${hookName}.ts`
          : `src/hooks/${hookName}.ts`;

        log(pc.green(`\n✨ Hook '${hookName}' created successfully!\n`));
        log(pc.dim(`  📄 ${location}`));
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
