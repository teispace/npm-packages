import path from 'node:path';
import pc from 'picocolors';
import Enquirer from 'enquirer';
import { deleteDirectory } from '../../../core/files';
import { installPackage, runScript, detectPackageManager } from '../../../core/package-manager';
import { startSpinner } from '../../../config/spinner';
import { checkIsAlreadySetup, validateProjectStructure } from './checks';
import { fetchAssets, copyHttpClientFiles } from './assets';
import {
  updateHttpIndex,
  updateHttpTypes,
  updateUtilsIndex,
  updateTypesIndex,
  updateConfigIndex,
} from './injectors';

export const setupHttpClient = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Checking HTTP Client setup...');
  const tempDir = path.join(projectPath, '.next-maker-temp-http');

  try {
    // 1. Pre-check
    const { status, reason } = await checkIsAlreadySetup(projectPath);
    spinner.stop();

    let clientType: 'fetch' | 'axios' = 'fetch';

    if (status === 'both') {
      console.log(pc.red(`✖ ${reason}`));
      return;
    }

    if (status !== 'none') {
      const { action } = await Enquirer.prompt<{ action: string }>({
        type: 'select',
        name: 'action',
        message: `${reason}. What would you like to do?`,
        choices: [
          { name: 'cancel', message: 'Cancel' },
          {
            name: 'switch',
            message: `Switch to ${status === 'fetch' ? 'Axios' : 'Fetch'}`,
          },
        ],
      });

      if (action === 'cancel') {
        return;
      }

      clientType = status === 'fetch' ? 'axios' : 'fetch';
    } else {
      const { type } = await Enquirer.prompt<{ type: 'fetch' | 'axios' }>({
        type: 'select',
        name: 'type',
        message: 'Which HTTP client do you want to setup?',
        choices: [
          { name: 'fetch', message: 'Fetch (Native)' },
          { name: 'axios', message: 'Axios' },
        ],
      });
      clientType = type;
    }

    spinner.start(`Setting up ${clientType === 'fetch' ? 'Fetch' : 'Axios'} client...`);

    // 2. Validation
    await validateProjectStructure(projectPath);

    // 3. Fetch Assets
    await fetchAssets(tempDir, spinner);

    // 4. Copy Files
    spinner.text = 'Copying client files...';
    await copyHttpClientFiles(projectPath, tempDir, clientType);

    // 5. Inject Code
    spinner.text = 'Configuring client...';
    await updateHttpIndex(projectPath, clientType);
    await updateHttpTypes(projectPath, clientType);
    await updateUtilsIndex(projectPath);
    await updateTypesIndex(projectPath);
    await updateConfigIndex(projectPath);

    // 6. Install Dependencies
    if (clientType === 'axios') {
      spinner.text = 'Installing Axios...';
      await installPackage(projectPath, 'axios');
    }

    // 7. Format Code
    spinner.text = 'Formatting code...';
    const packageManager = await detectPackageManager(projectPath);
    await runScript(projectPath, packageManager, 'format');

    spinner.succeed(pc.green(`HTTP Client (${clientType}) setup successfully!`));
  } catch (error) {
    spinner.fail('Failed to setup HTTP Client.');
    throw error;
  } finally {
    await deleteDirectory(tempDir);
  }
};
