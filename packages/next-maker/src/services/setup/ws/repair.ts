import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { copyFile, fileExists } from '../../../core/files';
import { installPackage } from '../../../core/package-manager';
import type { FeatureFinding } from '../../../manifests/types';
import {
  hasMissingInjection,
  isFileMissing,
  missingPackageNames,
  withStarterAssets,
} from '../repair-kit';
import { stripWsTestArtifacts } from './assets';
import { ensureTestSetupMocks, installBridgeMount, registerWsReducer } from './injectors';

/** socket.io's wire protocol is version-coupled to the backend — keep the pin. */
const SOCKET_IO_SPEC = 'socket.io-client@^4.8.3';

/**
 * Repair WebSocket-layer drift.
 *
 * The installer bails when `src/lib/utils/ws/` exists, so a project that has
 * the directory but lost (say) the `wsReducer` registration could never be
 * fixed by `--fix`. This path restores each reported piece independently.
 * `registerWsReducer` and `installBridgeMount` are already idempotent.
 */
export const repairWs = async (projectPath: string, drift: FeatureFinding[]): Promise<void> => {
  const spinner = startSpinner('Repairing WebSocket layer...');
  const tempDir = path.join(projectPath, '.next-maker-temp-ws-repair');

  try {
    const wsPath = path.join(projectPath, PROJECT_PATHS.WS_UTILS);
    const slicePath = path.join(projectPath, PROJECT_PATHS.WS_SLICE_FILE);

    const needsWsDir = isFileMissing(drift, PROJECT_PATHS.WS_UTILS) && !fileExists(wsPath);
    const needsSlice = isFileMissing(drift, PROJECT_PATHS.WS_SLICE_FILE) && !fileExists(slicePath);

    const restored: string[] = [];
    if (needsWsDir || needsSlice) {
      spinner.text = 'Fetching assets from starter repo...';
      const keepTests = fileExists(path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG));
      await withStarterAssets(tempDir, async (temp) => {
        if (needsWsDir) {
          await fs.cp(path.join(temp, PROJECT_PATHS.WS_UTILS), wsPath, {
            recursive: true,
            force: true,
          });
          if (!keepTests) await stripWsTestArtifacts(wsPath);
          restored.push(PROJECT_PATHS.WS_UTILS);
        }
        if (needsSlice) {
          await copyFile(path.join(temp, PROJECT_PATHS.WS_SLICE_FILE), slicePath);
          restored.push(PROJECT_PATHS.WS_SLICE_FILE);
        }
      });
    }

    if (hasMissingInjection(drift, PROJECT_PATHS.ROOT_REDUCER)) {
      spinner.text = 'Re-registering wsReducer...';
      await registerWsReducer(projectPath);
      restored.push('wsReducer registration');
    }

    if (hasMissingInjection(drift, PROJECT_PATHS.STORE_PROVIDER)) {
      spinner.text = 'Re-mounting the WS bridge...';
      await installBridgeMount(projectPath);
      restored.push('attachWsBridge mount');
    }

    await ensureTestSetupMocks(projectPath);

    // Installed via the pinned spec rather than the generic package repair,
    // so a repair can't silently widen the protocol version.
    const installed: string[] = [];
    if (missingPackageNames(drift, 'dependency').includes('socket.io-client')) {
      spinner.text = 'Installing socket.io-client...';
      await installPackage(projectPath, SOCKET_IO_SPEC);
      installed.push('socket.io-client');
    }

    const done = [
      restored.length > 0 ? `restored ${restored.join(', ')}` : null,
      installed.length > 0 ? `reinstalled ${installed.join(', ')}` : null,
    ].filter(Boolean);

    spinner.succeed(
      pc.green(
        done.length > 0
          ? `WebSocket layer repaired (${done.join('; ')}).`
          : 'WebSocket layer repaired.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to repair WebSocket layer.');
    throw error;
  }
};
