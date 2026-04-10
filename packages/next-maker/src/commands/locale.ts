import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { fileExists } from '../core/files';
import { detectProjectSetup } from '../detection';
import { generateLocale } from '../generators';
import { promptForLocaleDetails } from '../prompts/locale.prompt';

interface LocaleCommandOptions {
  copyTranslations?: boolean;
}

export const registerLocaleCommand = (program: Command) => {
  program
    .command('locale [code]')
    .description('Add a new locale/language')
    .option('--copy-translations', 'Copy translations from English instead of empty values')
    .action(async (code: string | undefined, options: LocaleCommandOptions) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n🌍 Locale Generator\n'));

        // Check i18n is set up
        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        if (!detection.hasI18n) {
          spinner.fail('i18n is not set up in this project');
          logError('Please set up internationalization first');
          log(pc.dim('\nRun: npx @teispace/next-maker setup --i18n\n'));
          process.exit(1);
        }

        // Prompt
        const localeOptions = await promptForLocaleDetails(code);

        // Check if locale already exists
        const translationFile = path.join(
          projectPath,
          'src',
          'i18n',
          'translations',
          `${localeOptions.code}.json`,
        );
        if (fileExists(translationFile)) {
          logError(`Locale '${localeOptions.code}' already exists!`);
          process.exit(1);
        }

        // Generate
        spinner.start('Adding locale...');
        await generateLocale({
          ...localeOptions,
          projectPath,
          copyTranslations: options.copyTranslations ?? localeOptions.copyTranslations,
        });
        spinner.succeed('Locale added');

        // Success
        log(
          pc.green(
            `\n✨ Locale '${localeOptions.code}' (${localeOptions.name}) added successfully!\n`,
          ),
        );
        log(pc.dim('Updated files:'));
        log(pc.dim(`  📄 src/i18n/translations/${localeOptions.code}.json`));
        log(pc.dim(`  📝 src/types/i18n.ts (SupportedLocale type)`));
        log(pc.dim(`  📝 src/lib/config/app-locales.ts`));
        log('');

        log(pc.cyan('Next steps:'));
        log(pc.dim(`  1. Translate: src/i18n/translations/${localeOptions.code}.json`));
        log(pc.dim(`  2. Visit: http://localhost:3000/${localeOptions.code}`));
        log('');
      } catch (error) {
        spinner.fail('Locale generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
