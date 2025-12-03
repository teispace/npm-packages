import { Command } from 'commander';
import pc from 'picocolors';
import Enquirer from 'enquirer';
import { log, logError, spinner } from '../config';
import { setupDarkTheme } from '../services/setup/dark-theme';
import { setupRedux } from '../services/setup/redux';
import { setupI18n } from '../services/setup/i18n';

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
    .option('--http-client <type>', 'Setup HTTP client (axios|fetch|both)')
    .option('--dark-theme', 'Setup Dark Theme (Tailwind + next-themes)')
    .option('--redux', 'Setup Redux Toolkit')
    .option('--i18n', 'Setup next-intl for internationalization')
    .action(async (options: SetupOptions) => {
      try {
        log(pc.cyan('\n🔧 Setup Wizard\n'));

        let feature: string | undefined;

        // If no options provided, show interactive menu
        if (!options.httpClient && !options.darkTheme && !options.redux && !options.i18n) {
          const setupChoice = await prompt<{ feature: string }>([
            {
              type: 'select',
              name: 'feature',
              message: 'What would you like to setup?',
              choices: [
                'Dark Theme',
                'Redux Toolkit',
                'HTTP Client (Axios/Fetch)',
                'Internationalization (next-intl)',
                'Cancel',
              ],
            },
          ]);
          feature = setupChoice.feature;

          if (feature === 'Cancel') {
            log(pc.yellow('Setup cancelled.'));
            return;
          }

          if (feature === 'Dark Theme') {
            await setupDarkTheme(process.cwd());
          } else if (feature === 'Redux Toolkit') {
            await setupRedux(process.cwd());
          } else if (feature === 'Internationalization (next-intl)') {
            await setupI18n(process.cwd());
          } else {
            log(pc.yellow(`\n⚠️  ${feature} setup is not implemented yet.`));
            log(pc.dim('This feature will be available in a future update.'));
          }
        } else {
          // Direct setup via flags
          if (options.httpClient) {
            log(pc.yellow('\n⚠️  HTTP Client setup is not implemented yet.'));
            log(pc.dim('This feature will be available in a future update.'));
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
        }
      } catch (error) {
        spinner.fail('Setup failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
