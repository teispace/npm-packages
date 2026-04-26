import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { generateProvider } from '../generators/provider.generator';
import { registerProvider } from '../modifiers/root-provider.modifier';

export const registerProviderCommand = (program: Command) => {
  program
    .command('provider <name>')
    .description('Generate a context provider in src/providers/ and wire it into RootProvider')
    .action(async (name: string) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n🔌 Provider Generator\n'));

        spinner.start('Generating provider...');
        const { componentName, fileBaseName, providerFile } = await generateProvider({
          name,
          projectPath,
        });
        spinner.succeed('Provider generated');

        spinner.start('Registering provider in RootProvider and barrel...');
        const { rootProviderFile, barrelFile } = await registerProvider({
          projectPath,
          componentName,
          fileBaseName,
        });
        spinner.succeed('Provider registered');

        log(pc.green(`\n✨ ${componentName} created!\n`));
        log(pc.dim('Generated files:'));
        log(pc.dim(`  📄 ${path.relative(projectPath, providerFile)}`));
        if (rootProviderFile) {
          log(pc.dim(`  ✏️  ${path.relative(projectPath, rootProviderFile)} — wrapped {children}`));
        } else {
          log(
            pc.yellow('\n⚠️  Could not locate a RootProvider file. Wire the new provider manually:'),
          );
          log(pc.dim(`     <${componentName}>{children}</${componentName}>`));
        }
        if (barrelFile) {
          log(pc.dim(`  ✏️  ${path.relative(projectPath, barrelFile)} — added re-export`));
        }
        log('');
      } catch (error) {
        spinner.fail('Provider generation failed');
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
};
