import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { kebabToPascal } from '../config/utils';
import { detectProjectSetup, directoryExists } from '../detection';
import { generatePage } from '../generators';
import { addTranslationNamespace, registerAppPath } from '../modifiers';
import { promptForPageDetails } from '../prompts/page.prompt';

interface PageCommandOptions {
  dynamic?: string;
  loading?: boolean;
  error?: boolean;
}

export const registerPageCommand = (program: Command) => {
  program
    .command('page [name]')
    .description('Generate a new page/route')
    .option('--dynamic <param>', 'Create dynamic route with parameter (e.g., id)')
    .option('--loading', 'Generate loading.tsx')
    .option('--error', 'Generate error.tsx')
    .action(async (name: string | undefined, options: PageCommandOptions) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n📄 Page Generator\n'));

        // Detect i18n
        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        log(pc.dim(`  i18n: ${detection.hasI18n ? '✓' : '✗'}\n`));

        // Prompt
        const pageOptions = await promptForPageDetails(name);
        const pageName = pageOptions.pageName;
        const componentName = kebabToPascal(pageName);

        // Check existence
        const baseDir = detection.hasI18n ? 'src/app/[locale]' : 'src/app';
        const exists = await directoryExists(projectPath, pageName, baseDir);
        if (exists) {
          logError(`Page '${pageName}' already exists at ${baseDir}/${pageName}!`);
          process.exit(1);
        }

        // Generate
        spinner.start('Generating page files...');
        await generatePage({
          name: pageName,
          projectPath,
          hasI18n: detection.hasI18n,
          dynamic: options.dynamic,
          withLoading: options.loading ?? pageOptions.withLoading,
          withError: options.error ?? pageOptions.withError,
        });
        spinner.succeed('Page files generated');

        // Register route in app-paths
        spinner.start('Registering route...');
        const routePath = options.dynamic ? `/${pageName}/[${options.dynamic}]` : `/${pageName}`;
        await registerAppPath(projectPath, pageName, routePath);
        spinner.succeed('Route registered');

        // Add translation namespace if i18n
        if (detection.hasI18n) {
          spinner.start('Adding translation namespace...');
          await addTranslationNamespace(projectPath, componentName);
          spinner.succeed('Translation namespace added');
        }

        // Success
        const displayPath = options.dynamic
          ? path.join(baseDir, pageName, `[${options.dynamic}]`)
          : path.join(baseDir, pageName);

        log(pc.green(`\n✨ Page '${pageName}' created successfully!\n`));
        log(pc.dim('Generated files:'));
        log(pc.dim(`  📂 ${displayPath}/`));
        log(pc.dim(`     ├── page.tsx`));
        if (options.loading ?? pageOptions.withLoading) log(pc.dim(`     ├── loading.tsx`));
        if (options.error ?? pageOptions.withError) log(pc.dim(`     └── error.tsx`));
        log('');

        if (detection.hasI18n) {
          log(pc.cyan('Next steps:'));
          log(
            pc.dim(`  1. Add translations in: src/i18n/translations/en.json → "${componentName}"`),
          );
          log(pc.dim(`  2. Visit: http://localhost:3000/${pageName}`));
          log('');
        }
      } catch (error) {
        spinner.fail('Page generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
