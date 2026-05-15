import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { deleteDirectory, fileExists, readFile } from '../../../core/files';
import { detectPackageManager, installPackage, runScript } from '../../../core/package-manager';
import { copyWsFiles, fetchAssets } from './assets';
import { checkIsAlreadySetup, validateProjectStructure } from './checks';
import { ensureTestSetupMocks, installBridgeMount, registerWsReducer } from './injectors';

/**
 * Set up the WebSocket transport layer in an existing project.
 *
 * Pre-requisites validated up front: Redux must be installed (the bridge
 * dispatches into a Redux slice). On a fresh install the orchestrator
 * fails fast with guidance to run `setup --redux` first rather than
 * leaving a half-applied state.
 *
 * Steps:
 *   1. pre-check (skip if ws/ already exists)
 *   2. validate Redux is present
 *   3. degit the starter into a tempdir
 *   4. copy ws/ subtree + wsReducer slice (strip *.test.ts when no vitest)
 *   5. wire wsReducer into rootReducer (no persist — connection state is ephemeral)
 *   6. mount attachWsBridge inside StoreProvider's useEffect
 *   7. ensure test/setup.ts has the react-secure-storage + server-only mocks
 *   8. install socket.io-client (pinned to ^4.8.3 — backend protocol match)
 *   9. format via `lint:fix`
 */
export const setupWs = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Setting up WebSocket layer...');
  const tempDir = path.join(projectPath, '.next-maker-temp-ws');

  try {
    // 1. Pre-check
    const { isSetup, reason } = await checkIsAlreadySetup(projectPath);
    if (isSetup) {
      spinner.fail(`WebSocket layer is already set up (${reason}).`);
      return;
    }

    // 2. Validation — Redux is a hard dep
    await validateProjectStructure(projectPath);

    // 3. Fetch assets
    await fetchAssets(tempDir, spinner);

    // 4. Copy files. Strip test files when the project has no vitest —
    //    orphan *.test.ts files would just generate IDE noise.
    spinner.text = 'Copying WebSocket files...';
    const keepTests = fileExists(path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG));
    await copyWsFiles(projectPath, tempDir, { keepTests });

    // 5. Wire the slice into rootReducer
    spinner.text = 'Registering wsReducer...';
    await registerWsReducer(projectPath);

    // 6. Mount the bridge inside StoreProvider
    spinner.text = 'Mounting WS bridge in StoreProvider...';
    await installBridgeMount(projectPath);

    // 7. Test setup mocks (idempotent — no-op if vitest isn't installed)
    spinner.text = 'Ensuring test/setup.ts mocks...';
    await ensureTestSetupMocks(projectPath);

    // 8. Install dependency
    spinner.text = 'Installing socket.io-client...';
    const packageJsonPath = path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON);
    const pkg = JSON.parse(await readFile(packageJsonPath));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!deps['socket.io-client']) {
      // Pin to the backend's exact major.minor — protocol compatibility
      // matters for socket.io. Patch updates are fine.
      await installPackage(projectPath, 'socket.io-client@^4.8.3');
    }

    // 9. Format
    spinner.text = 'Formatting code...';
    const packageManager = await detectPackageManager(projectPath);
    await runScript(projectPath, packageManager, 'lint:fix');

    spinner.succeed(pc.green('WebSocket layer setup successfully!'));
  } catch (error) {
    spinner.fail('Failed to setup WebSocket layer.');
    throw error;
  } finally {
    await deleteDirectory(tempDir);
  }
};
