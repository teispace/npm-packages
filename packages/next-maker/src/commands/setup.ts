import { Command } from 'commander';
import pc from 'picocolors';
import Enquirer from 'enquirer';
import { log, logError, spinner } from '../config';
import {
  setupHttpClient,
  getRequiredPackages,
  HttpClientType,
} from '../services/setup/http-client.service';
import {
  setupDarkTheme,
  isDarkThemeSetup,
  getDarkThemePackages,
} from '../services/setup/dark-theme.service';
import { setupRedux, isReduxSetup, getReduxPackages } from '../services/setup/redux.service';
import { setupI18n, checkIfI18nExists } from '../services/setup/i18n.service';
import { detectProjectSetup } from '../services/feature/detection.service';
import { installPackages, detectPackageManager } from '../core/package-manager';

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
        const projectPath = process.cwd();

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

          if (setupChoice.feature === 'Cancel') {
            log(pc.yellow('Setup cancelled.'));
            return;
          }

          if (setupChoice.feature === 'HTTP Client (Axios/Fetch)') {
            await setupHttpClientInteractive(projectPath);
          } else if (setupChoice.feature === 'Dark Theme') {
            await setupDarkThemeFlow(projectPath);
          } else if (setupChoice.feature === 'Redux Toolkit') {
            await setupReduxFlow(projectPath);
          } else if (setupChoice.feature === 'Internationalization (next-intl)') {
            await setupI18nFlow(projectPath);
          }
        } else {
          // Direct setup via flags
          if (options.httpClient) {
            await setupHttpClientDirect(projectPath, options.httpClient);
          }
          if (options.darkTheme) {
            await setupDarkThemeFlow(projectPath);
          }
          if (options.redux) {
            await setupReduxFlow(projectPath);
          }
          if (options.i18n) {
            await setupI18nFlow(projectPath);
          }
        }
      } catch (error) {
        spinner.fail('Setup failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};

const setupHttpClientInteractive = async (projectPath: string): Promise<void> => {
  // Detect current setup
  spinner.start('Detecting project setup...');
  const detection = await detectProjectSetup(projectPath);
  spinner.succeed('Project setup detected');

  // Show current status
  log(pc.dim(`\nCurrent HTTP Client: ${detection.httpClient}\n`));

  // If both clients already exist
  if (detection.httpClient === 'both') {
    log(pc.green('✓ Both Axios and Fetch clients are already setup!'));
    return;
  }

  // Determine available options
  const choices: string[] = [];
  const choiceMap: Record<string, HttpClientType> = {};

  if (detection.httpClient === 'none') {
    choices.push('Axios Client', 'Fetch Client', 'Both (Axios + Fetch)');
    choiceMap['Axios Client'] = 'axios';
    choiceMap['Fetch Client'] = 'fetch';
    choiceMap['Both (Axios + Fetch)'] = 'both';
  } else if (detection.httpClient === 'axios') {
    choices.push('Add Fetch Client', 'Reinstall Axios Client');
    choiceMap['Add Fetch Client'] = 'fetch';
    choiceMap['Reinstall Axios Client'] = 'axios';
  } else if (detection.httpClient === 'fetch') {
    choices.push('Add Axios Client', 'Reinstall Fetch Client');
    choiceMap['Add Axios Client'] = 'axios';
    choiceMap['Reinstall Fetch Client'] = 'fetch';
  }

  const { clientChoice } = await prompt<{ clientChoice: string }>([
    {
      type: 'select',
      name: 'clientChoice',
      message: 'Which HTTP client would you like to setup?',
      choices,
    },
  ]);

  const clientType = choiceMap[clientChoice];

  await performHttpClientSetup(projectPath, clientType);
};

const setupHttpClientDirect = async (projectPath: string, clientType: string): Promise<void> => {
  // Validate client type
  if (!['axios', 'fetch', 'both'].includes(clientType)) {
    logError(`Invalid HTTP client type: ${clientType}`);
    log(pc.dim('Valid options: axios, fetch, both'));
    process.exit(1);
  }

  // Check if clients already exist
  spinner.start('Detecting project setup...');
  const detection = await detectProjectSetup(projectPath);
  spinner.succeed('Project setup detected');

  const requestedType = clientType as HttpClientType;

  // Check if the requested setup is already complete
  if (requestedType === 'both' && detection.httpClient === 'both') {
    log(pc.green('\n✓ Both Axios and Fetch clients are already setup!'));
    return;
  }

  if (
    requestedType === 'axios' &&
    (detection.httpClient === 'axios' || detection.httpClient === 'both')
  ) {
    log(pc.green('\n✓ Axios client is already setup!'));
    return;
  }

  if (
    requestedType === 'fetch' &&
    (detection.httpClient === 'fetch' || detection.httpClient === 'both')
  ) {
    log(pc.green('\n✓ Fetch client is already setup!'));
    return;
  }

  await performHttpClientSetup(projectPath, requestedType);
};

const performHttpClientSetup = async (
  projectPath: string,
  clientType: HttpClientType,
): Promise<void> => {
  // Setup HTTP client files
  spinner.start('Setting up HTTP client files...');
  const installedClients = await setupHttpClient({
    projectPath,
    clientType,
  });
  spinner.succeed('HTTP client files setup complete');

  // Install required packages
  const requiredPackages = getRequiredPackages(clientType);

  if (requiredPackages.length > 0) {
    spinner.start('Installing required packages...');
    const packageManager = await detectPackageManager(projectPath);

    await installPackages(projectPath, packageManager, requiredPackages);
    spinner.succeed('Packages installed');
  }

  // Success message
  log(pc.green('\n✨ HTTP Client setup completed successfully!\n'));

  if (installedClients.length > 0) {
    log(pc.dim('Installed clients:'));
    installedClients.forEach((client) => {
      log(pc.dim(`  ✓ ${client}`));
    });
    log('');
  }

  log(pc.cyan('Next steps:'));
  log(pc.dim('  1. HTTP client is now available at: src/lib/utils/http/'));

  if (clientType === 'axios' || installedClients.includes('axios')) {
    log(pc.dim("  2. Use Axios: import { axiosClient } from '@/lib/utils/http';"));
  }

  if (clientType === 'fetch' || installedClients.includes('fetch')) {
    log(pc.dim("  2. Use Fetch: import { fetchClient } from '@/lib/utils/http';"));
  }

  log(pc.dim('  3. Create services using: npm run make service <name>'));
  log('');
};

const setupDarkThemeFlow = async (projectPath: string): Promise<void> => {
  // Check if dark theme is already setup
  spinner.start('Checking dark theme setup...');
  const isSetup = await isDarkThemeSetup(projectPath);
  spinner.succeed('Check complete');

  if (isSetup) {
    log(pc.green('\n✓ Dark theme is already setup!'));
    return;
  }

  // Setup dark theme
  spinner.start('Setting up dark theme...');
  const installed = await setupDarkTheme(projectPath);
  spinner.succeed('Dark theme files setup complete');

  // Install required packages
  if (installed) {
    const requiredPackages = getDarkThemePackages();
    spinner.start('Installing required packages...');
    const packageManager = await detectPackageManager(projectPath);

    await installPackages(projectPath, packageManager, requiredPackages);
    spinner.succeed('Packages installed');
  }

  // Success message
  log(pc.green('\n✨ Dark theme setup completed successfully!\n'));

  log(pc.dim('What was added:'));
  log(pc.dim('  ✓ CustomThemeProvider component'));
  log(pc.dim('  ✓ Integrated with RootProvider'));
  log(pc.dim('  ✓ next-themes package installed'));
  log('');

  log(pc.cyan('Next steps:'));
  log(pc.dim('  1. Dark theme is now available in your app'));
  log(pc.dim('  2. Users can toggle between light/dark/system modes'));
  log(pc.dim("  3. Use the theme: import { useTheme } from 'next-themes';"));
  log(pc.dim('  4. Add dark mode classes to your Tailwind CSS (e.g., dark:bg-gray-900)'));
  log('');
};

const setupReduxFlow = async (projectPath: string): Promise<void> => {
  // Check if Redux is already setup
  spinner.start('Checking Redux setup...');
  const isSetup = await isReduxSetup(projectPath);
  spinner.succeed('Check complete');

  if (isSetup) {
    log(pc.green('\n✓ Redux Toolkit is already setup!'));
    return;
  }

  // Setup Redux
  spinner.start('Setting up Redux Toolkit...');
  const installed = await setupRedux(projectPath);
  spinner.succeed('Redux Toolkit files setup complete');

  // Install required packages
  if (installed) {
    const requiredPackages = getReduxPackages();
    spinner.start('Installing required packages...');
    const packageManager = await detectPackageManager(projectPath);

    await installPackages(projectPath, packageManager, requiredPackages);
    spinner.succeed('Packages installed');
  }

  // Success message
  log(pc.green('\n✨ Redux Toolkit setup completed successfully!\n'));

  log(pc.dim('What was added:'));
  log(pc.dim('  ✓ Store configuration (src/store)'));
  log(pc.dim('  ✓ Redux hooks (useAppDispatch, useAppSelector)'));
  log(pc.dim('  ✓ Redux Persist integration'));
  log(pc.dim('  ✓ StoreProvider component'));
  log(pc.dim('  ✓ Integrated with RootProvider'));
  log(pc.dim('  ✓ Required packages installed'));
  log('');

  log(pc.cyan('Next steps:'));
  log(pc.dim('  1. Redux store is now available in your app'));
  log(pc.dim("  2. Use hooks: import { useAppDispatch, useAppSelector } from '@/store/hooks';"));
  log(pc.dim('  3. Create features with state: npm run make feature <name> --store persist'));
  log(pc.dim('  4. Create slices: npm run make slice <name>'));
  log('');
};

const setupI18nFlow = async (projectPath: string): Promise<void> => {
  // Check if i18n is already setup
  spinner.start('Checking i18n setup...');
  const isSetup = checkIfI18nExists(projectPath);
  spinner.succeed('Check complete');

  if (isSetup) {
    log(pc.green('\n✓ next-intl is already setup!'));
    return;
  }

  // Setup i18n
  spinner.start('Setting up next-intl (i18n)...');
  await setupI18n(projectPath);
  spinner.succeed('next-intl setup complete');

  // Install required packages
  const requiredPackages = ['next-intl'];
  spinner.start('Installing required packages...');
  const packageManager = await detectPackageManager(projectPath);

  await installPackages(projectPath, packageManager, requiredPackages);
  spinner.succeed('Packages installed');

  // Success message
  log(pc.green('\n✨ next-intl (i18n) setup completed successfully!\n'));

  log(pc.dim('What was added:'));
  log(pc.dim('  ✓ i18n configuration (src/i18n)'));
  log(pc.dim('  ✓ Translation files (src/i18n/translations)'));
  log(pc.dim('  ✓ Locale types and config'));
  log(pc.dim('  ✓ Middleware for routing (src/proxy.ts)'));
  log(pc.dim('  ✓ Updated next.config.ts'));
  log(pc.dim('  ✓ Updated RootProvider with NextIntlClientProvider'));
  log(pc.dim('  ✓ Created [locale] route structure'));
  log(pc.dim('  ✓ next-intl package installed'));
  log('');

  log(pc.cyan('Next steps:'));
  log(pc.dim('  1. Add more locales in src/lib/config/app-locales.ts'));
  log(pc.dim('  2. Add translations in src/i18n/translations/<locale>.json'));
  log(pc.dim("  3. Use translations: import { useTranslations } from 'next-intl';"));
  log(pc.dim("  4. Use navigation: import { Link, useRouter } from '@/i18n/navigation';"));
  log(pc.dim('  5. Update SupportedLocale type in src/types/i18n.ts'));
  log('');
};
