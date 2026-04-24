import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { deleteDirectory, fileExists, readFile } from '../../../core/files';
import { detectPackageManager, installPackage, runScript } from '../../../core/package-manager';
import { writeTestUtils } from '../../common/test-utils';
import { copyI18nFiles, fetchAssets } from './assets';
import { checkIsAlreadySetup, validateProjectStructure } from './checks';
import {
  migrateToLocaleStructure,
  updateConfigIndex,
  updateNextConfig,
  updateRootProvider,
  updateTypesIndex,
} from './injectors';

export const setupI18n = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Setting up Internationalization (next-intl)...');
  const tempDir = path.join(projectPath, '.next-maker-temp-i18n');

  try {
    // 1. Pre-check
    const { isSetup, reason } = await checkIsAlreadySetup(projectPath);
    if (isSetup) {
      spinner.fail(`i18n is already set up (${reason}).`);
      return;
    }

    // 2. Validation
    await validateProjectStructure(projectPath);

    // 3. Fetch Assets
    await fetchAssets(tempDir, spinner);

    // 4. Copy Files
    spinner.text = 'Copying i18n files...';
    await copyI18nFiles(projectPath, tempDir);

    // 5. Inject Code & Migrate Structure
    spinner.text = 'Configuring project structure...';
    await updateNextConfig(projectPath);
    await updateTypesIndex(projectPath);
    await updateConfigIndex(projectPath);
    await updateRootProvider(projectPath);

    spinner.text = 'Migrating to [locale] structure...';
    await migrateToLocaleStructure(projectPath);

    // 6. Install Dependencies
    spinner.text = 'Installing dependencies...';
    await installPackage(projectPath, 'next-intl');

    // 7. If tests are present, regenerate test-utils so it wraps in i18n.
    const vitestConfigPath = path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG);
    if (fileExists(vitestConfigPath)) {
      const pkg = JSON.parse(await readFile(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON)));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const hasRedux = !!(deps['@reduxjs/toolkit'] && deps['react-redux']);
      await writeTestUtils(projectPath, { redux: hasRedux, i18n: true });
    }

    // 8. Format Code
    spinner.text = 'Formatting code...';
    const packageManager = await detectPackageManager(projectPath);
    await runScript(projectPath, packageManager, 'lint:fix');

    spinner.succeed(pc.green('Internationalization setup successfully!'));
  } catch (error) {
    spinner.fail('Failed to setup Internationalization.');
    throw error;
  } finally {
    await deleteDirectory(tempDir);
  }
};
