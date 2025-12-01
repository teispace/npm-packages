import path from 'node:path';
import { deleteDirectory, deleteFile, fileExists, readFile, writeFile } from '../../core/files';
import { ProjectPrompts } from '../../prompts/create-app.prompt';
import { startSpinner } from '../../config/spinner';

import { PROJECT_PATHS } from '../../config/paths';

// ... (imports)

export const cleanupFeatures = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  const spinner = startSpinner('Customizing features...');
  try {
    await cleanupHttpClient(projectPath, answers);
    await cleanupSecureStorage(projectPath, answers);
    await cleanupRedux(projectPath, answers);
    await cleanupDarkMode(projectPath, answers);
    await cleanupI18n(projectPath, answers);
    await cleanupLicense(projectPath);
    await cleanupChangelog(projectPath);
    await cleanupConfig(projectPath);
    spinner.succeed('Features customized.');
  } catch (error) {
    spinner.fail('Failed to customize features.');
    throw error;
  }
};

const cleanupHttpClient = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  const httpUtilsPath = path.join(projectPath, PROJECT_PATHS.HTTP_UTILS);
  const keepSecureStorage = answers.httpClient !== 'none' || answers.reactSecureStorage;

  if (answers.httpClient === 'none') {
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.AXIOS_CLIENT));
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.FETCH_CLIENT));

    if (keepSecureStorage) {
      await writeFile(path.join(httpUtilsPath, 'index.ts'), "export * from './token-store';\n");
      // token-store.ts does not use client-utils, so we can remove it
      await deleteFile(path.join(projectPath, PROJECT_PATHS.CLIENT_UTILS));
    } else {
      await deleteDirectory(httpUtilsPath);
      const utilsIndexPath = path.join(projectPath, PROJECT_PATHS.UTILS_INDEX);
      if (fileExists(utilsIndexPath)) {
        let content = await readFile(utilsIndexPath);
        content = content.replace(/export \* from '\.\/http';\n/, '');
        await writeFile(utilsIndexPath, content);
      }

      // Remove app-apis.ts if no client and no secure storage (likely no auth)
      await deleteFile(path.join(projectPath, PROJECT_PATHS.APP_APIS));
      const configIndexPath = path.join(projectPath, PROJECT_PATHS.CONFIG_INDEX);
      if (fileExists(configIndexPath)) {
        let content = await readFile(configIndexPath);
        content = content.replace(/export \* from '\.\/app-apis';\n/, '');
        await writeFile(configIndexPath, content);
      }
    }

    // Remove API constants
    const constantsPath = path.join(projectPath, PROJECT_PATHS.CONSTANTS);
    if (fileExists(constantsPath)) {
      let content = await readFile(constantsPath);
      content = content.replace(/export const API_RESPONSE_DATA_KEY = 'data';\n/, '');
      content = content.replace(/export const SAVE_AUTH_TOKENS = false;\n/, '');
      await writeFile(constantsPath, content);
    }

    // Remove errors and types
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.ERRORS_DIR));

    // Only remove common types if we don't keep secure storage (TokenStore needs common/http.types.ts)
    if (!keepSecureStorage) {
      await deleteDirectory(path.join(projectPath, PROJECT_PATHS.COMMON_TYPES_DIR));
      await deleteDirectory(path.join(projectPath, PROJECT_PATHS.UTILITY_TYPES_DIR));

      // Update types/index.ts
      const typesIndexPath = path.join(projectPath, PROJECT_PATHS.TYPES_INDEX);
      if (fileExists(typesIndexPath)) {
        let content = await readFile(typesIndexPath);
        content = content.replace(/export \* from '\.\/utility';\n/, '');
        content = content.replace(/export \* from '\.\/common';\n/, '');
        await writeFile(typesIndexPath, content);
      }
    }
  } else if (answers.httpClient === 'axios') {
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.FETCH_CLIENT));
    let content = await readFile(path.join(httpUtilsPath, 'index.ts'));
    content = content.replace(/export .* from '\.\/fetch-client';\n/g, '');
    await writeFile(path.join(httpUtilsPath, 'index.ts'), content);
  } else if (answers.httpClient === 'fetch') {
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.AXIOS_CLIENT));
    let content = await readFile(path.join(httpUtilsPath, 'index.ts'));
    content = content.replace(/export .* from '\.\/axios-client';\n/g, '');
    await writeFile(path.join(httpUtilsPath, 'index.ts'), content);
  }
};

const cleanupSecureStorage = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  const keepSecureStorage = answers.httpClient !== 'none' || answers.reactSecureStorage;
  if (!keepSecureStorage) {
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.STORAGE_SERVICE));
  }
};

const cleanupRedux = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (!answers.redux) {
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.STORE));
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.COUNTER_FEATURE));
    await deleteFile(path.join(projectPath, 'src/providers/StoreProvider.tsx'));
    await deleteFile(path.join(projectPath, 'src/components/Count.tsx'));

    const providersIndexPath = path.join(projectPath, PROJECT_PATHS.PROVIDERS_INDEX);
    let providersIndexContent = await readFile(providersIndexPath);
    providersIndexContent = providersIndexContent.replace(
      /export \* from '\.\/StoreProvider';\n/,
      '',
    );
    await writeFile(providersIndexPath, providersIndexContent);

    const componentsIndexPath = path.join(projectPath, PROJECT_PATHS.COMPONENTS_INDEX);
    if (fileExists(componentsIndexPath)) {
      let componentsIndexContent = await readFile(componentsIndexPath);
      componentsIndexContent = componentsIndexContent.replace(/export \* from '\.\/Count';\n?/, '');
      await writeFile(componentsIndexPath, componentsIndexContent);
    }
  }
};

const cleanupDarkMode = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (!answers.darkMode) {
    await deleteFile(path.join(projectPath, 'src/providers/CustomThemeProvider.tsx'));
    const providersIndexPath = path.join(projectPath, PROJECT_PATHS.PROVIDERS_INDEX);
    let providersIndexContent = await readFile(providersIndexPath);
    providersIndexContent = providersIndexContent.replace(
      /export \* from '\.\/CustomThemeProvider';\n/,
      '',
    );
    await writeFile(providersIndexPath, providersIndexContent);

    const globalsCssPath = path.join(projectPath, PROJECT_PATHS.GLOBALS_CSS);
    if (fileExists(globalsCssPath)) {
      let cssContent = await readFile(globalsCssPath);
      cssContent = cssContent.replace(/@custom-variant dark \(.*?\);\n?/, '');
      await writeFile(globalsCssPath, cssContent);
    }
  }
};

const cleanupI18n = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (!answers.i18n) {
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.I18N_DIR));
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.LOCALE_DIR));
    await deleteFile(path.join(projectPath, PROJECT_PATHS.PROXY));
    await deleteFile(path.join(projectPath, PROJECT_PATHS.MIDDLEWARE));
    await deleteFile(path.join(projectPath, PROJECT_PATHS.I18N_TYPES));
    await deleteFile(path.join(projectPath, PROJECT_PATHS.APP_LOCALES));

    const typesIndexPath = path.join(projectPath, PROJECT_PATHS.TYPES_INDEX);
    if (fileExists(typesIndexPath)) {
      let content = await readFile(typesIndexPath);
      content = content.replace(/export \* from '\.\/i18n';\n/, '');
      await writeFile(typesIndexPath, content);
    }

    const configIndexPath = path.join(projectPath, PROJECT_PATHS.CONFIG_INDEX);
    if (fileExists(configIndexPath)) {
      let content = await readFile(configIndexPath);
      content = content.replace(/export \* from '\.\/app-locales';\n/, '');
      await writeFile(configIndexPath, content);
    }

    const nextConfigPath = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
    if (fileExists(nextConfigPath)) {
      let configContent = await readFile(nextConfigPath);
      configContent = configContent.replace(
        /import createNextIntlPlugin from 'next-intl\/plugin';\n/,
        '',
      );
      configContent = configContent.replace(/const withNextIntl = createNextIntlPlugin\(\);\n/, '');
      configContent = configContent.replace(
        /export default withNextIntl\(nextConfig\);/,
        'export default nextConfig;',
      );
      await writeFile(nextConfigPath, configContent);
    }
  }
};

const cleanupLicense = async (projectPath: string): Promise<void> => {
  await deleteFile(path.join(projectPath, PROJECT_PATHS.LICENSE));
};

const cleanupChangelog = async (projectPath: string): Promise<void> => {
  await deleteFile(path.join(projectPath, PROJECT_PATHS.CHANGELOG));
};

const cleanupConfig = async (projectPath: string): Promise<void> => {
  await deleteFile(path.join(projectPath, PROJECT_PATHS.NVM_RC));
  await deleteFile(path.join(projectPath, PROJECT_PATHS.NPM_RC));
};
