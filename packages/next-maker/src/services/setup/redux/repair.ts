import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { copyFile, fileExists } from '../../../core/files';
import type { FeatureFinding } from '../../../manifests/types';
import {
  hasMissingInjection,
  isFileMissing,
  repairPackages,
  withStarterAssets,
} from '../repair-kit';
import { updateRootProvider } from './injectors';

const ROOT_PROVIDER = 'src/providers/RootProvider.tsx';

/**
 * Repair Redux drift.
 *
 * Only the pieces the drift named are restored, and `src/store/` is copied
 * back ONLY when the whole directory is gone — re-copying over an existing
 * store would clobber the slices the user registered there.
 *
 * The counter demo feature and the `<Counter />` page wiring are install-time
 * scaffolding, not part of the manifest footprint, so a repair never
 * re-injects them into a project the user has since built out.
 */
export const repairRedux = async (projectPath: string, drift: FeatureFinding[]): Promise<void> => {
  const spinner = startSpinner('Repairing Redux Toolkit...');
  const tempDir = path.join(projectPath, '.next-maker-temp-redux-repair');

  try {
    const storePath = path.join(projectPath, PROJECT_PATHS.STORE);
    const providerPath = path.join(projectPath, PROJECT_PATHS.STORE_PROVIDER);

    const needsStore = isFileMissing(drift, PROJECT_PATHS.STORE) && !fileExists(storePath);
    const needsProvider =
      isFileMissing(drift, PROJECT_PATHS.STORE_PROVIDER) && !fileExists(providerPath);

    const restored: string[] = [];
    if (needsStore || needsProvider) {
      spinner.text = 'Fetching assets from starter repo...';
      await withStarterAssets(tempDir, async (temp) => {
        if (needsStore) {
          await fs.cp(path.join(temp, PROJECT_PATHS.STORE), storePath, { recursive: true });
          restored.push(PROJECT_PATHS.STORE);
        }
        if (needsProvider) {
          await copyFile(path.join(temp, PROJECT_PATHS.STORE_PROVIDER), providerPath);
          restored.push(PROJECT_PATHS.STORE_PROVIDER);
        }
      });
    }

    if (hasMissingInjection(drift, ROOT_PROVIDER)) {
      spinner.text = 'Restoring <StoreProvider> wrap...';
      await updateRootProvider(projectPath);
      restored.push('<StoreProvider> wrap');
    }

    spinner.text = 'Restoring dependencies...';
    const installed = await repairPackages(projectPath, drift);

    const done = [
      restored.length > 0 ? `restored ${restored.join(', ')}` : null,
      installed.length > 0 ? `reinstalled ${installed.join(', ')}` : null,
    ].filter(Boolean);

    spinner.succeed(
      pc.green(
        done.length > 0
          ? `Redux Toolkit repaired (${done.join('; ')}).`
          : 'Redux Toolkit repaired.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to repair Redux Toolkit.');
    throw error;
  }
};
