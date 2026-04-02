import path from 'node:path';
import fs from 'node:fs/promises';
import pc from 'picocolors';
import Enquirer from 'enquirer';
import { deleteDirectory, fileExists } from '../../../core/files';
import {
  installPackage,
  runScript,
  detectPackageManager,
  uninstallPackage,
} from '../../../core/package-manager';
import { startSpinner } from '../../../config/spinner';
import { checkIsAlreadySetup, validateProjectStructure, HttpClientType } from './checks';
import { fetchAssets, copyHttpClientFiles, performFullCleanup } from './assets';
import {
  updateHttpIndex,
  updateUtilsIndex,
  updateTypesIndex,
  updateConfigIndex,
  migrateClientUsages,
  cleanupHttpTypes,
  removeHttpExports,
} from './injectors';

type ClientType = 'fetch' | 'axios';

interface SetupAction {
  type: 'install' | 'add' | 'replace' | 'remove-one' | 'remove-both' | 'cancel';
  clients: ClientType[];
  fromClient?: ClientType; // For replace action
}

export const setupHttpClient = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Checking HTTP Client setup...');
  const tempDir = path.join(projectPath, '.next-maker-temp-http');

  try {
    // 1. Pre-check
    const { status, reason } = await checkIsAlreadySetup(projectPath);
    spinner.stop();

    const action = await determineAction(status, reason);

    if (action.type === 'cancel') {
      console.log(pc.yellow('Setup cancelled.'));
      return;
    }

    spinner.start(`Setting up HTTP client(s)...`);

    // 2. Validation
    await validateProjectStructure(projectPath);

    // 3. Fetch Assets
    await fetchAssets(tempDir, spinner);

    // 4. Execute action based on type
    if (action.type === 'replace' && action.fromClient) {
      // Replace: migrate imports before copying new files
      spinner.text = 'Migrating client usages...';
      await migrateClientUsages(projectPath, action.fromClient, action.clients[0]);
    }

    if (action.type !== 'remove-both' && action.type !== 'remove-one') {
      // Copy files for install/add/replace
      spinner.text = 'Copying client files...';
      const clientsToRemove =
        action.type === 'replace' && action.fromClient ? [action.fromClient] : undefined;
      await copyHttpClientFiles(projectPath, tempDir, action.clients, clientsToRemove);
    }

    if (action.type === 'remove-one' || action.type === 'remove-both') {
      // Remove specified clients
      spinner.text = 'Removing client files...';
      const { PROJECT_PATHS } = await import('../../../config/paths');
      for (const client of action.clients) {
        const clientPath = path.join(
          projectPath,
          client === 'fetch' ? PROJECT_PATHS.FETCH_CLIENT : PROJECT_PATHS.AXIOS_CLIENT,
        );
        await deleteDirectory(clientPath);
      }

      // Check if any clients remain
      const activeClients = getActiveClients(status, action);
      if (activeClients.length === 0) {
        spinner.text = 'Performing full cleanup...';
        await performFullCleanup(projectPath);
        await removeHttpExports(projectPath);
      }
    }

    // 5. Update exports in http/index.ts
    const activeClients = getActiveClients(status, action);

    // Only update exports if there are active clients remaining
    if (activeClients.length > 0) {
      spinner.text = 'Configuring client...';
      await updateHttpIndex(projectPath, activeClients);
      await updateUtilsIndex(projectPath);
      await updateTypesIndex(projectPath);
      await updateConfigIndex(projectPath);
    }

    // Always cleanup types (even if removing both, we need to strip client-specific types from the preserved http.types.ts)
    await cleanupHttpTypes(projectPath, activeClients);

    // 6. Dependency Management
    spinner.text = 'Managing dependencies...';
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // Axios Management
    if (activeClients.includes('axios')) {
      if (!dependencies['axios']) {
        spinner.text = 'Installing Axios...';
        await installPackage(projectPath, 'axios');
      }
    } else {
      if (dependencies['axios']) {
        spinner.text = 'Uninstalling Axios...';
        await uninstallPackage(projectPath, 'axios');
      }
    }

    // React Secure Storage Management
    // Needed if ANY client exists (for token store), OR if used elsewhere (checked by file existence)
    const storageServicePath = path.join(projectPath, 'src/services/storage'); // Hardcoded path to match assets.ts usage
    const isStorageNeeded = activeClients.length > 0 || fileExists(storageServicePath);

    if (isStorageNeeded) {
      if (!dependencies['react-secure-storage']) {
        spinner.text = 'Installing react-secure-storage...';
        await installPackage(projectPath, 'react-secure-storage');
      }
    } else {
      if (dependencies['react-secure-storage']) {
        spinner.text = 'Uninstalling react-secure-storage...';
        await uninstallPackage(projectPath, 'react-secure-storage');
      }
    }

    // 7. Format Code
    spinner.text = 'Formatting code...';
    const packageManager = await detectPackageManager(projectPath);
    await runScript(projectPath, packageManager, 'format');

    spinner.succeed(pc.green(getSuccessMessage(action)));
  } catch (error) {
    spinner.fail('Failed to setup HTTP Client.');
    throw error;
  } finally {
    await deleteDirectory(tempDir);
  }
};

async function determineAction(status: HttpClientType, reason?: string): Promise<SetupAction> {
  if (status === 'none') {
    // No clients exist - choose what to install
    const { choice } = await Enquirer.prompt<{ choice: string }>({
      type: 'select',
      name: 'choice',
      message: 'Which HTTP client(s) do you want to setup?',
      choices: [
        { name: 'fetch', message: 'Fetch (Native)' },
        { name: 'axios', message: 'Axios' },
        { name: 'both', message: 'Both (Fetch + Axios)' },
      ],
    });

    if (choice === 'both') {
      return { type: 'install', clients: ['fetch', 'axios'] };
    }
    return { type: 'install', clients: [choice as ClientType] };
  }

  if (status === 'fetch') {
    // Only fetch exists
    const { action } = await Enquirer.prompt<{ action: string }>({
      type: 'select',
      name: 'action',
      message: `${reason}. What would you like to do?`,
      choices: [
        { name: 'cancel', message: 'Keep Fetch only (cancel)' },
        { name: 'add', message: 'Add Axios (have both)' },
        { name: 'replace', message: 'Replace with Axios only' },
        { name: 'remove', message: 'Remove Fetch' },
      ],
    });

    if (action === 'cancel') return { type: 'cancel', clients: [] };
    if (action === 'add') return { type: 'add', clients: ['axios'] };
    if (action === 'replace') return { type: 'replace', clients: ['axios'], fromClient: 'fetch' };
    if (action === 'remove') return { type: 'remove-one', clients: ['fetch'] };
  }

  if (status === 'axios') {
    // Only axios exists
    const { action } = await Enquirer.prompt<{ action: string }>({
      type: 'select',
      name: 'action',
      message: `${reason}. What would you like to do?`,
      choices: [
        { name: 'cancel', message: 'Keep Axios only (cancel)' },
        { name: 'add', message: 'Add Fetch (have both)' },
        { name: 'replace', message: 'Replace with Fetch only' },
        { name: 'remove', message: 'Remove Axios' },
      ],
    });

    if (action === 'cancel') return { type: 'cancel', clients: [] };
    if (action === 'add') return { type: 'add', clients: ['fetch'] };
    if (action === 'replace') return { type: 'replace', clients: ['fetch'], fromClient: 'axios' };
    if (action === 'remove') return { type: 'remove-one', clients: ['axios'] };
  }

  // Both exist
  console.log(pc.yellow(`✖ ${reason}`));
  const { action } = await Enquirer.prompt<{ action: string }>({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: 'cancel', message: 'Keep both (cancel)' },
      { name: 'remove-fetch', message: 'Remove Fetch (keep Axios)' },
      { name: 'remove-axios', message: 'Remove Axios (keep Fetch)' },
      { name: 'remove-both', message: 'Remove both' },
    ],
  });

  if (action === 'cancel') return { type: 'cancel', clients: [] };
  if (action === 'remove-fetch') return { type: 'remove-one', clients: ['fetch'] };
  if (action === 'remove-axios') return { type: 'remove-one', clients: ['axios'] };
  if (action === 'remove-both') return { type: 'remove-both', clients: ['fetch', 'axios'] };

  return { type: 'cancel', clients: [] };
}

function getActiveClients(status: HttpClientType, action: SetupAction): ClientType[] {
  if (action.type === 'install') {
    return action.clients;
  }

  if (action.type === 'add') {
    const existing: ClientType[] = status === 'fetch' ? ['fetch'] : ['axios'];
    return [...existing, ...action.clients];
  }

  if (action.type === 'replace') {
    return action.clients;
  }

  if (action.type === 'remove-one') {
    if (status === 'both') {
      return action.clients[0] === 'fetch' ? ['axios'] : ['fetch'];
    }
    return [];
  }

  return [];
}

function getSuccessMessage(action: SetupAction): string {
  if (action.type === 'install') {
    const names = action.clients.map((c) => (c === 'fetch' ? 'Fetch' : 'Axios')).join(' + ');
    return `HTTP Client (${names}) setup successfully!`;
  }

  if (action.type === 'add') {
    const name = action.clients[0] === 'fetch' ? 'Fetch' : 'Axios';
    return `${name} client added successfully! Both clients are now available.`;
  }

  if (action.type === 'replace') {
    const from = action.fromClient === 'fetch' ? 'Fetch' : 'Axios';
    const to = action.clients[0] === 'fetch' ? 'Fetch' : 'Axios';
    return `Replaced ${from} with ${to} successfully! Imports automatically migrated.`;
  }

  if (action.type === 'remove-one') {
    const name = action.clients[0] === 'fetch' ? 'Fetch' : 'Axios';
    return `${name} client removed successfully!`;
  }

  if (action.type === 'remove-both') {
    return 'Both HTTP clients removed successfully!';
  }

  return 'HTTP Client setup completed!';
}
