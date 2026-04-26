import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { kebabToPascal } from '../config/utils';
import { detectProjectSetup } from '../detection';
import { generateComponent, generateTest } from '../generators';
import { promptForComponentDetails } from '../prompts/component.prompt';

interface ComponentCommandOptions {
  client?: boolean;
  i18n?: boolean;
  feature?: string;
  test?: boolean;
  noTest?: boolean;
}

export const registerComponentCommand = (program: Command) => {
  program
    .command('component [name]')
    .description('Generate a shared component')
    .option('--client', "Add 'use client' directive")
    .option('--i18n', 'Add useTranslations hook')
    .option('--feature <path>', 'Generate in feature directory (e.g., src/features/auth)')
    .option('--test', 'Also generate a sibling test file')
    .option('--no-test', 'Skip test file generation')
    .action(async (name: string | undefined, options: ComponentCommandOptions) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n🧩 Component Generator\n'));

        // Detect i18n for auto-adding useTranslations
        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        // Prompt — skip questions whose answers were already given via flags.
        const componentOptions = await promptForComponentDetails(name, {
          client: options.client,
        });
        const componentName = kebabToPascal(componentOptions.componentName);
        const isClient = componentOptions.isClient;
        const hasI18n = options.i18n ?? false;
        const shouldTest = resolveShouldTest(options, detection.hasTests);

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

        let testFile: string | null = null;
        if (shouldTest) {
          const componentFile = options.feature
            ? path.join(projectPath, options.feature, 'components', `${componentName}.tsx`)
            : path.join(
                projectPath,
                'src/components/common',
                componentName,
                `${componentName}.tsx`,
              );
          spinner.start('Generating test...');
          testFile = await generateTest({
            projectPath,
            sourceFile: componentFile,
            kind: 'component',
            symbolName: componentName,
            hasRedux: detection.hasRedux,
            hasI18n: detection.hasI18n,
          });
          spinner.succeed('Test generated');
        }

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
        if (testFile) {
          log(pc.dim(`  🧪 ${path.relative(projectPath, testFile)}`));
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

const resolveShouldTest = (
  options: { test?: boolean; noTest?: boolean },
  hasTests: boolean,
): boolean => {
  if (options.noTest) return false;
  if (options.test) return true;
  // Default: co-generate when tests are already installed.
  return hasTests;
};
