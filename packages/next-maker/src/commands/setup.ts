import type { Command } from 'commander';
import Enquirer from 'enquirer';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { setupBundleAnalyzer } from '../services/setup/bundle-analyzer';
import { setupDarkTheme } from '../services/setup/dark-theme';
import { setupHttpClient } from '../services/setup/http-client';
import { setupI18n } from '../services/setup/i18n';
import { setupReactCompiler } from '../services/setup/react-compiler';
import { setupRedux } from '../services/setup/redux';
import { setupTests } from '../services/setup/tests';

const { prompt } = Enquirer;

interface SetupOptions {
  httpClient?: string;
  darkTheme?: boolean;
  redux?: boolean;
  i18n?: boolean;
  tests?: boolean;
  reactCompiler?: boolean;
  bundleAnalyzer?: boolean;
}

export const registerSetupCommand = (program: Command) => {
  program
    .command('setup')
    .description('Setup features in an existing Next.js project')
    .option('--http-client', 'Setup HTTP client (axios|fetch)')
    .option('--dark-theme', 'Setup Dark Theme (Tailwind + @teispace/next-themes)')
    .option('--redux', 'Setup Redux Toolkit')
    .option('--i18n', 'Setup next-intl for internationalization')
    .option('--tests', 'Setup testing (Vitest + React Testing Library)')
    .option('--react-compiler', 'Enable the React Compiler')
    .option('--bundle-analyzer', 'Add @next/bundle-analyzer')
    .action(async (options: SetupOptions) => {
      try {
        log(pc.cyan('\n🔧 Setup Wizard\n'));

        const anyFlag =
          options.httpClient ||
          options.darkTheme ||
          options.redux ||
          options.i18n ||
          options.tests ||
          options.reactCompiler ||
          options.bundleAnalyzer;

        if (anyFlag) {
          if (options.httpClient) await setupHttpClient(process.cwd());
          if (options.darkTheme) await setupDarkTheme(process.cwd());
          if (options.redux) await setupRedux(process.cwd());
          if (options.i18n) await setupI18n(process.cwd());
          if (options.tests) await setupTests(process.cwd());
          if (options.reactCompiler) await setupReactCompiler(process.cwd());
          if (options.bundleAnalyzer) await setupBundleAnalyzer(process.cwd());
          return;
        }

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
              { name: 'Testing (Vitest + RTL)', value: 'tests' },
              { name: 'React Compiler', value: 'react-compiler' },
              { name: 'Bundle Analyzer', value: 'bundle-analyzer' },
              'Cancel',
            ],
          },
        ]);
        const feature = setupChoice.feature;

        if (feature === 'Cancel') {
          log(pc.yellow('Setup cancelled.'));
          return;
        }

        const handlers: Record<string, (cwd: string) => Promise<void>> = {
          'dark-theme': setupDarkTheme,
          redux: setupRedux,
          'http-client': setupHttpClient,
          i18n: setupI18n,
          tests: setupTests,
          'react-compiler': setupReactCompiler,
          'bundle-analyzer': setupBundleAnalyzer,
        };

        const handler = handlers[feature];
        if (handler) {
          await handler(process.cwd());
        } else {
          log(pc.yellow(`\n⚠️  ${feature} setup is not implemented yet.`));
        }
      } catch (error) {
        spinner.fail('Setup failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
