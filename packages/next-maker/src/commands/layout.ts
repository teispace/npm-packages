import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { detectProjectSetup } from '../detection';
import { generateLayout } from '../generators/layout.generator';

interface LayoutCommandOptions {
  group?: boolean;
  at?: string;
  locale?: boolean;
}

export const registerLayoutCommand = (program: Command) => {
  program
    .command('layout <segment>')
    .description('Generate a nested layout.tsx (locale-aware when i18n is detected)')
    .option('--group', 'Treat the segment as a route group (wraps it in parens)')
    .option('--at <path>', 'Place the layout under this nested path (kebab-case, slash-separated)')
    .option('--no-locale', 'Skip the locale wrapper even if i18n is detected')
    .action(async (segment: string, options: LayoutCommandOptions) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n📐 Layout Generator\n'));

        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        const hasI18n = detection.hasI18n && options.locale !== false;
        log(pc.dim(`  i18n: ${hasI18n ? '✓' : '✗'}\n`));

        spinner.start('Generating layout...');
        const result = await generateLayout({
          segment,
          at: options.at,
          projectPath,
          hasI18n,
          withGroup: !!options.group,
        });
        spinner.succeed('Layout generated');

        log(pc.green(`\n✨ ${result.componentName} created!\n`));
        log(pc.dim(`  📄 ${result.displayPath}`));
        log('');
      } catch (error) {
        spinner.fail('Layout generation failed');
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
};
