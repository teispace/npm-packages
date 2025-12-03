import { Command } from 'commander';
import pc from 'picocolors';
import Enquirer from 'enquirer';
import { log, logError, spinner } from '../config';
import { setupDarkTheme } from '../services/setup/dark-theme';

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
    .description('Setup additional features for your Next.js project')
    .option('--http-client <type>', 'Setup HTTP client (axios|fetch|both)')
    .option('--dark-theme', 'Setup dark theme support')
    .option('--redux', 'Setup Redux Toolkit with persistence')
    .option('--i18n', 'Setup next-intl for internationalization')
    .action(async (options: SetupOptions) => {
      try {
        log(pc.cyan('\n🔧 Setup Wizard\n'));

        // If no options provided, show interactive menu
        if (!options.httpClient && !options.darkTheme && !options.redux && !options.i18n) {
          const setupChoice = await prompt<{ feature: string }>([
            {
              type: 'select',
              name: 'feature',
              message: 'What would you like to setup?',
              choices: [
                'HTTP Client (Axios/Fetch)',
                'Dark Theme',
                'Redux Toolkit',
                'Internationalization (next-intl)',
                'Cancel',
              ],
            },
          ]);

          if (setupChoice.feature === 'Dark Theme') {
            await setupDarkTheme(process.cwd());
            return;
          }

          if (setupChoice.feature === 'Cancel') {
            log(pc.yellow('Setup cancelled.'));
            return;
          }

          log(pc.yellow(`\n⚠️  ${setupChoice.feature} setup is not implemented yet.`));
          log(pc.dim('This feature will be available in a future update.'));
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
            log(pc.yellow('\n⚠️  Redux Toolkit setup is not implemented yet.'));
            log(pc.dim('This feature will be available in a future update.'));
          }
          if (options.i18n) {
            log(pc.yellow('\n⚠️  Internationalization setup is not implemented yet.'));
            log(pc.dim('This feature will be available in a future update.'));
          }
        }
      } catch (error) {
        spinner.fail('Setup failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
