import path from 'node:path';
import pc from 'picocolors';
import { startSpinner } from '../../../config/spinner';
import { deleteDirectory } from '../../../core/files';
import { detectPackageManager, installPackage, runScript } from '../../../core/package-manager';
import { copyThemeProvider, fetchAssets } from './assets';
import { checkIsAlreadySetup, validateProjectStructure } from './checks';
import {
  updateGlobalsCss,
  updateLayout,
  updateProvidersIndex,
  updateRootProvider,
} from './injectors';

export const setupDarkTheme = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Setting up Dark Theme...');
  const tempDir = path.join(projectPath, '.next-maker-temp');

  try {
    // 1. Pre-check
    const { isSetup, reason } = await checkIsAlreadySetup(projectPath);
    if (isSetup) {
      spinner.fail(`Dark Theme is already set up (${reason}).`);
      return;
    }

    // 2. Validation
    const layoutPath = await validateProjectStructure(projectPath);

    // 3. Fetch Assets
    await fetchAssets(tempDir, spinner);

    // 4. Copy Files
    await copyThemeProvider(projectPath, tempDir);

    // 5. Inject Code
    await updateProvidersIndex(projectPath);
    await updateRootProvider(projectPath);
    await updateGlobalsCss(projectPath, tempDir);
    await updateLayout(layoutPath);

    // 6. Install Dependencies
    spinner.text = 'Installing @teispace/next-themes...';
    await installPackage(projectPath, '@teispace/next-themes');

    // 7. Format Code
    spinner.text = 'Formatting code...';
    const packageManager = await detectPackageManager(projectPath);
    await runScript(projectPath, packageManager, 'lint:fix');

    spinner.succeed(pc.green('Dark Theme setup successfully!'));
  } catch (error) {
    spinner.fail('Failed to setup Dark Theme.');
    throw error;
  } finally {
    await deleteDirectory(tempDir);
  }
};
