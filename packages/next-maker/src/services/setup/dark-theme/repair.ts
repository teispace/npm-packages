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
import { updateProvidersIndex, updateRootProvider } from './injectors';

const ROOT_PROVIDER = 'src/providers/RootProvider.tsx';

/**
 * Repair dark-theme drift.
 *
 * `setupDarkTheme` refuses to run as soon as CustomThemeProvider.tsx exists
 * (or the dep is installed, or globals.css carries the variant) — all three
 * are signals doctor already used to decide the feature IS installed. This
 * path restores the individual missing pieces instead.
 *
 * globals.css is deliberately not touched: it isn't in the manifest
 * footprint, so there is no drift finding that would justify editing it.
 */
export const repairDarkTheme = async (
  projectPath: string,
  drift: FeatureFinding[],
): Promise<void> => {
  const spinner = startSpinner('Repairing Dark Theme...');
  const tempDir = path.join(projectPath, '.next-maker-temp-dark-theme-repair');

  try {
    const providerPath = path.join(projectPath, PROJECT_PATHS.THEME_PROVIDER);
    const restored: string[] = [];

    if (isFileMissing(drift, PROJECT_PATHS.THEME_PROVIDER) && !fileExists(providerPath)) {
      spinner.text = 'Fetching CustomThemeProvider from starter repo...';
      await withStarterAssets(tempDir, async (temp) => {
        await copyFile(path.join(temp, PROJECT_PATHS.THEME_PROVIDER), providerPath);
      });
      restored.push(PROJECT_PATHS.THEME_PROVIDER);
    }

    if (hasMissingInjection(drift, ROOT_PROVIDER)) {
      spinner.text = 'Restoring <CustomThemeProvider> wrap...';
      // Both injectors are idempotent no-ops when the wiring is present.
      if (fileExists(path.join(projectPath, PROJECT_PATHS.PROVIDERS_INDEX))) {
        await updateProvidersIndex(projectPath);
      }
      await updateRootProvider(projectPath);
      restored.push('<CustomThemeProvider> wrap');
    }

    spinner.text = 'Restoring dependencies...';
    const installed = await repairPackages(projectPath, drift);

    const done = [
      restored.length > 0 ? `restored ${restored.join(', ')}` : null,
      installed.length > 0 ? `reinstalled ${installed.join(', ')}` : null,
    ].filter(Boolean);

    spinner.succeed(
      pc.green(
        done.length > 0 ? `Dark Theme repaired (${done.join('; ')}).` : 'Dark Theme repaired.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to repair Dark Theme.');
    throw error;
  }
};
