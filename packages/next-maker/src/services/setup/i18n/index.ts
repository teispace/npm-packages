import path from 'node:path';
import pc from 'picocolors';
import { deleteDirectory } from '../../../core/files';
import { installPackage, runScript, detectPackageManager } from '../../../core/package-manager';
import { startSpinner } from '../../../config/spinner';
import { checkIsAlreadySetup, validateProjectStructure } from './checks';
import { fetchAssets, copyI18nFiles } from './assets';
import {
  updateNextConfig,
  updateTypesIndex,
  updateConfigIndex,
  migrateToLocaleStructure,
  updateRootProvider,
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

    // 7. Format Code
    spinner.text = 'Formatting code...';
    const packageManager = await detectPackageManager(projectPath);
    await runScript(projectPath, packageManager, 'format');

    spinner.succeed(pc.green('Internationalization setup successfully!'));
  } catch (error) {
    spinner.fail('Failed to setup Internationalization.');
    throw error;
  } finally {
    await deleteDirectory(tempDir);
  }
};
