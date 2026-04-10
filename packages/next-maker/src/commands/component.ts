import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { kebabToPascal } from '../config/utils';
import { detectProjectSetup } from '../detection';
import { generateComponent } from '../generators';
import { promptForComponentDetails } from '../prompts/component.prompt';

interface ComponentCommandOptions {
  client?: boolean;
  i18n?: boolean;
  feature?: string;
}

export const registerComponentCommand = (program: Command) => {
  program
    .command('component [name]')
    .description('Generate a shared component')
    .option('--client', "Add 'use client' directive")
    .option('--i18n', 'Add useTranslations hook')
    .option('--feature <path>', 'Generate in feature directory (e.g., src/features/auth)')
    .action(async (name: string | undefined, options: ComponentCommandOptions) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n🧩 Component Generator\n'));

        // Detect i18n for auto-adding useTranslations
        spinner.start('Detecting project setup...');
        await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        // Prompt
        const componentOptions = await promptForComponentDetails(name);
        const componentName = kebabToPascal(componentOptions.componentName);
        const isClient = options.client ?? componentOptions.isClient;
        const hasI18n = options.i18n ?? false;

        // Generate
        spinner.start('Generating component...');
        await generateComponent({
          name: componentOptions.componentName,
          projectPath,
          isClient: isClient || hasI18n,
          hasI18n,
          featurePath: options.feature,
        });
        spinner.succeed('Component generated');

        // Success
        const location = options.feature
          ? `${options.feature}/components/${componentName}.tsx`
          : `src/components/common/${componentName}/${componentName}.tsx`;

        log(pc.green(`\n✨ Component '${componentName}' created successfully!\n`));
        log(pc.dim(`  📄 ${location}`));

        if (!options.feature) {
          log(pc.dim(`  📄 src/components/common/${componentName}/index.ts`));
          log(pc.dim(`  📝 Updated src/components/common/index.ts`));
          log(pc.dim(`  📝 Updated src/components/index.ts`));
        }

        log('');
        log(pc.cyan('Usage:'));
        if (options.feature) {
          log(
            pc.dim(
              `  import { ${componentName} } from '${options.feature.replace(/^src\//, '@/')}/components/${componentName}';`,
            ),
          );
        } else {
          log(pc.dim(`  import { ${componentName} } from '@/components';`));
        }
        log('');
      } catch (error) {
        spinner.fail('Component generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
