import type { Command } from 'commander';
import Enquirer from 'enquirer';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { setupDarkTheme } from '../services/setup/dark-theme';
import { setupHttpClient } from '../services/setup/http-client';
import { setupI18n } from '../services/setup/i18n';
import { setupRedux } from '../services/setup/redux';

const { prompt } = Enquirer;

interface SetupOptions {
  httpClient?: string;
  darkTheme?: boolean;
  redux?: boolean;
  i18n?: boolean;
}

export const registerSetupCommand = (program: Command) => {
  program
    .command('setup')
    .description('Setup features in an existing Next.js project')
    .option('--http-client', 'Setup HTTP client (axios|fetch)')
    .option('--dark-theme', 'Setup Dark Theme (Tailwind + next-themes)')
    .option('--redux', 'Setup Redux Toolkit')
    .option('--i18n', 'Setup next-intl for internationalization')
    .action(async (options: SetupOptions) => {
      try {
        log(pc.cyan('\n🔧 Setup Wizard\n'));

        // Direct setup via flags
        if (options.httpClient || options.darkTheme || options.redux || options.i18n) {
          if (options.httpClient) {
            await setupHttpClient(process.cwd());
          }
          if (options.darkTheme) {
            await setupDarkTheme(process.cwd());
          }
          if (options.redux) {
            await setupRedux(process.cwd());
          }
          if (options.i18n) {
            await setupI18n(process.cwd());
          }
          return;
        }

        // If no options provided, show interactive menu
        const setupChoice = await prompt<{ feature: string }>([
          {
            type: 'select',
            name: 'feature',
            message: 'What would you like to setup?',
            choices: [
              { name: 'Dark Theme', value: 'dark-theme' },
              { name: 'Redux Toolkit', value: 'redux' },
              { name: 'HTTP Client (Axios/Fetch)', value: 'http-client' },
              { name: 'Internationalization (next-intl)', value: 'i18n' },
              'Cancel',
            ],
          },
        ]);
        const feature = setupChoice.feature;

        if (feature === 'Cancel') {
          log(pc.yellow('Setup cancelled.'));
          return;
        }

        if (feature === 'dark-theme') {
          await setupDarkTheme(process.cwd());
        } else if (feature === 'redux') {
          await setupRedux(process.cwd());
        } else if (feature === 'http-client') {
          await setupHttpClient(process.cwd());
        } else if (feature === 'i18n') {
          await setupI18n(process.cwd());
        } else {
          log(pc.yellow(`\n⚠️  ${feature} setup is not implemented yet.`));
          log(pc.dim('This feature will be available in a future update.'));
        }
      } catch (error) {
        spinner.fail('Setup failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
