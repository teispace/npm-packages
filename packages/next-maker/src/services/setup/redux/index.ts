import path from 'node:path';
import pc from 'picocolors';
import { deleteDirectory } from '../../../core/files';
import { installPackage, runScript, detectPackageManager } from '../../../core/package-manager';
import { startSpinner } from '../../../config/spinner';
import { checkIsAlreadySetup, validateProjectStructure } from './checks';
import { fetchAssets, copyReduxFiles, createCounterFeature } from './assets';
import { updateProvidersIndex, updateRootProvider, updatePage } from './injectors';

export const setupRedux = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Setting up Redux Toolkit...');
  const tempDir = path.join(projectPath, '.next-maker-temp-redux');

  try {
    // 1. Pre-check
    const { isSetup, reason } = await checkIsAlreadySetup(projectPath);
    if (isSetup) {
      spinner.fail(`Redux is already set up (${reason}).`);
      return;
    }

    // 2. Validation
    await validateProjectStructure(projectPath);

    // 3. Fetch Assets
    await fetchAssets(tempDir, spinner);

    // 4. Copy Files
    spinner.text = 'Copying Redux files...';
    await copyReduxFiles(projectPath, tempDir);

    spinner.text = 'Creating Counter feature...';
    await createCounterFeature(projectPath, tempDir);

    // 5. Inject Code
    spinner.text = 'Updating providers and pages...';
    await updateProvidersIndex(projectPath);
    await updateRootProvider(projectPath);
    await updatePage(projectPath);

    // 6. Install Dependencies
    spinner.text = 'Installing dependencies...';
    await installPackage(projectPath, '@reduxjs/toolkit');
    await installPackage(projectPath, 'react-redux');
    await installPackage(projectPath, 'redux-persist');
    // Check if react-secure-storage is needed (starter uses it in persist.ts? No, it used storage from redux-persist/lib/storage in the file I viewed)
    // But let's check if the starter has it in package.json just in case.
    // Based on previous view of package.json in test project, it had react-secure-storage.
    // Let's install it to be safe if the starter uses it elsewhere or if I missed it.
    await installPackage(projectPath, 'react-secure-storage');

    // 7. Format Code
    spinner.text = 'Formatting code...';
    const packageManager = await detectPackageManager(projectPath);
    await runScript(projectPath, packageManager, 'format');

    spinner.succeed(pc.green('Redux Toolkit setup successfully!'));
  } catch (error) {
    spinner.fail('Failed to setup Redux Toolkit.');
    throw error;
  } finally {
    await deleteDirectory(tempDir);
  }
};
