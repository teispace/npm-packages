import path from 'node:path';
import { deleteDirectory, deleteFile, fileExists, readFile, writeFile } from '../../core/files';
import { ProjectPrompts } from '../../prompts/create-app.prompt';
import { startSpinner } from '../../config/spinner';

export class CleanupService {
  async cleanupFeatures(projectPath: string, answers: ProjectPrompts): Promise<void> {
    const spinner = startSpinner('Customizing features...');
    try {
      await this.cleanupHttpClient(projectPath, answers);
      await this.cleanupSecureStorage(projectPath, answers);
      await this.cleanupRedux(projectPath, answers);
      await this.cleanupDarkMode(projectPath, answers);
      await this.cleanupI18n(projectPath, answers);
      await this.cleanupLicense(projectPath);
      await this.cleanupChangelog(projectPath);
      spinner.succeed('Features customized.');
    } catch (error) {
      spinner.fail('Failed to customize features.');
      throw error;
    }
  }

  private async cleanupHttpClient(projectPath: string, answers: ProjectPrompts): Promise<void> {
    const httpUtilsPath = path.join(projectPath, 'src/lib/utils/http');
    const keepSecureStorage = answers.httpClient !== 'none' || answers.reactSecureStorage;

    if (answers.httpClient === 'none') {
      await deleteDirectory(path.join(httpUtilsPath, 'axios-client'));
      await deleteDirectory(path.join(httpUtilsPath, 'fetch-client'));

      if (keepSecureStorage) {
        await writeFile(path.join(httpUtilsPath, 'index.ts'), "export * from './token-store';\n");
      } else {
        await deleteDirectory(httpUtilsPath);
        const utilsIndexPath = path.join(projectPath, 'src/lib/utils/index.ts');
        if (fileExists(utilsIndexPath)) {
          let content = await readFile(utilsIndexPath);
          content = content.replace(/export \* from '\.\/http';\n/, '');
          await writeFile(utilsIndexPath, content);
        }
      }

      // Remove API constants
      const constantsPath = path.join(projectPath, 'src/lib/config/constants.ts');
      if (fileExists(constantsPath)) {
        let content = await readFile(constantsPath);
        content = content.replace(/export const API_RESPONSE_DATA_KEY = 'data';\n/, '');
        content = content.replace(/export const SAVE_AUTH_TOKENS = false;\n/, '');
        await writeFile(constantsPath, content);
      }

      // Remove errors and types
      await deleteDirectory(path.join(projectPath, 'src/lib/errors'));
      await deleteDirectory(path.join(projectPath, 'src/types/utility'));
      await deleteDirectory(path.join(projectPath, 'src/types/common'));

      // Update types/index.ts
      const typesIndexPath = path.join(projectPath, 'src/types/index.ts');
      if (fileExists(typesIndexPath)) {
        let content = await readFile(typesIndexPath);
        content = content.replace(/export \* from '\.\/utility';\n/, '');
        content = content.replace(/export \* from '\.\/common';\n/, '');
        await writeFile(typesIndexPath, content);
      }
    } else if (answers.httpClient === 'axios') {
      await deleteDirectory(path.join(httpUtilsPath, 'fetch-client'));
      let content = await readFile(path.join(httpUtilsPath, 'index.ts'));
      content = content.replace(/export .* from '\.\/fetch-client';\n/g, '');
      await writeFile(path.join(httpUtilsPath, 'index.ts'), content);
    } else if (answers.httpClient === 'fetch') {
      await deleteDirectory(path.join(httpUtilsPath, 'axios-client'));
      let content = await readFile(path.join(httpUtilsPath, 'index.ts'));
      content = content.replace(/export .* from '\.\/axios-client';\n/g, '');
      await writeFile(path.join(httpUtilsPath, 'index.ts'), content);
    }
  }

  private async cleanupSecureStorage(projectPath: string, answers: ProjectPrompts): Promise<void> {
    const keepSecureStorage = answers.httpClient !== 'none' || answers.reactSecureStorage;
    if (!keepSecureStorage) {
      await deleteDirectory(path.join(projectPath, 'src/services/storage'));
    }
  }

  private async cleanupRedux(projectPath: string, answers: ProjectPrompts): Promise<void> {
    if (!answers.redux) {
      await deleteDirectory(path.join(projectPath, 'src/store'));
      await deleteDirectory(path.join(projectPath, 'src/features/counter'));
      await deleteFile(path.join(projectPath, 'src/providers/StoreProvider.tsx'));
      await deleteFile(path.join(projectPath, 'src/components/Count.tsx'));

      const providersIndexPath = path.join(projectPath, 'src/providers/index.ts');
      let providersIndexContent = await readFile(providersIndexPath);
      providersIndexContent = providersIndexContent.replace(
        /export \* from '\.\/StoreProvider';\n/,
        '',
      );
      await writeFile(providersIndexPath, providersIndexContent);

      const componentsIndexPath = path.join(projectPath, 'src/components/index.ts');
      if (fileExists(componentsIndexPath)) {
        let componentsIndexContent = await readFile(componentsIndexPath);
        componentsIndexContent = componentsIndexContent.replace(
          /export \* from '\.\/Count';\n?/,
          '',
        );
        await writeFile(componentsIndexPath, componentsIndexContent);
      }
    }
  }

  private async cleanupDarkMode(projectPath: string, answers: ProjectPrompts): Promise<void> {
    if (!answers.darkMode) {
      await deleteFile(path.join(projectPath, 'src/providers/CustomThemeProvider.tsx'));
      const providersIndexPath = path.join(projectPath, 'src/providers/index.ts');
      let providersIndexContent = await readFile(providersIndexPath);
      providersIndexContent = providersIndexContent.replace(
        /export \* from '\.\/CustomThemeProvider';\n/,
        '',
      );
      await writeFile(providersIndexPath, providersIndexContent);

      const globalsCssPath = path.join(projectPath, 'src/styles/globals.css');
      if (fileExists(globalsCssPath)) {
        let cssContent = await readFile(globalsCssPath);
        cssContent = cssContent.replace(/@custom-variant dark \(.*?\);\n?/, '');
        await writeFile(globalsCssPath, cssContent);
      }
    }
  }

  private async cleanupI18n(projectPath: string, answers: ProjectPrompts): Promise<void> {
    if (!answers.i18n) {
      await deleteDirectory(path.join(projectPath, 'src/i18n'));
      await deleteDirectory(path.join(projectPath, 'src/app/[locale]'));
      await deleteFile(path.join(projectPath, 'src/proxy.ts'));
      await deleteFile(path.join(projectPath, 'src/middleware.ts'));
      await deleteFile(path.join(projectPath, 'src/types/i18n.ts'));
      await deleteFile(path.join(projectPath, 'src/lib/config/app-locales.ts'));

      const typesIndexPath = path.join(projectPath, 'src/types/index.ts');
      if (fileExists(typesIndexPath)) {
        let content = await readFile(typesIndexPath);
        content = content.replace(/export \* from '\.\/i18n';\n/, '');
        await writeFile(typesIndexPath, content);
      }

      const configIndexPath = path.join(projectPath, 'src/lib/config/index.ts');
      if (fileExists(configIndexPath)) {
        let content = await readFile(configIndexPath);
        content = content.replace(/export \* from '\.\/app-locales';\n/, '');
        await writeFile(configIndexPath, content);
      }

      const nextConfigPath = path.join(projectPath, 'next.config.ts');
      if (fileExists(nextConfigPath)) {
        let configContent = await readFile(nextConfigPath);
        configContent = configContent.replace(
          /import createNextIntlPlugin from 'next-intl\/plugin';\n/,
          '',
        );
        configContent = configContent.replace(
          /const withNextIntl = createNextIntlPlugin\(\);\n/,
          '',
        );
        configContent = configContent.replace(
          /export default withNextIntl\(nextConfig\);/,
          'export default nextConfig;',
        );
        configContent = configContent.replace(
          /export default withNextIntl\(withAnalyzer\(nextConfig\)\);/,
          'export default withAnalyzer(nextConfig);',
        );
        await writeFile(nextConfigPath, configContent);
      }
    }
  }

  private async cleanupLicense(projectPath: string): Promise<void> {
    await deleteFile(path.join(projectPath, 'LICENSE'));
  }

  private async cleanupChangelog(projectPath: string): Promise<void> {
    await deleteFile(path.join(projectPath, 'CHANGELOG.md'));
  }
}
