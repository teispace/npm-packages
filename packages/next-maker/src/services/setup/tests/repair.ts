import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { copyFile, fileExists, readFile } from '../../../core/files';
import type { FeatureFinding } from '../../../manifests/types';
import { writeTestUtils } from '../../common/test-utils';
import { isFileMissing, repairPackages, repairScripts, withStarterAssets } from '../repair-kit';

/**
 * Repair testing-setup drift.
 *
 * The installer bails the moment `vitest.config.ts` exists — which is
 * precisely the state doctor reports drift in — so this path re-copies only
 * the artefacts the drift named and leaves everything else alone. In
 * particular `test/` is never wiped: it accumulates user-authored helpers.
 */
export const repairTests = async (projectPath: string, drift: FeatureFinding[]): Promise<void> => {
  const spinner = startSpinner('Repairing testing setup...');
  const tempDir = path.join(projectPath, '.next-maker-temp-tests-repair');

  try {
    const needsConfig =
      isFileMissing(drift, PROJECT_PATHS.VITEST_CONFIG) &&
      !fileExists(path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG));
    const testSetupPath = path.join(projectPath, PROJECT_PATHS.TEST_SETUP_FILE);
    const needsTestDir = isFileMissing(drift, PROJECT_PATHS.TEST_DIR) && !fileExists(testSetupPath);

    const restored: string[] = [];
    if (needsConfig || needsTestDir) {
      spinner.text = 'Fetching assets from starter repo...';
      await withStarterAssets(tempDir, async (temp) => {
        if (needsConfig) {
          await copyFile(
            path.join(temp, PROJECT_PATHS.VITEST_CONFIG),
            path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG),
          );
          restored.push(PROJECT_PATHS.VITEST_CONFIG);
        }
        if (needsTestDir) {
          await copyFile(path.join(temp, PROJECT_PATHS.TEST_SETUP_FILE), testSetupPath);
          restored.push(PROJECT_PATHS.TEST_SETUP_FILE);
        }
      });

      if (needsTestDir) {
        // test-utils has to match the features the project actually has, so
        // it is generated rather than copied.
        const pkgPath = path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON);
        const pkg = fileExists(pkgPath) ? JSON.parse(await readFile(pkgPath)) : {};
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        await writeTestUtils(projectPath, {
          redux: !!(deps['@reduxjs/toolkit'] && deps['react-redux']),
          i18n: !!deps['next-intl'],
        });
        restored.push('test/test-utils.tsx');
      }
    }

    spinner.text = 'Restoring testing dependencies...';
    const installed = await repairPackages(projectPath, drift);
    const scripts = await repairScripts(projectPath, drift);

    const done = [
      restored.length > 0 ? `restored ${restored.join(', ')}` : null,
      installed.length > 0 ? `reinstalled ${installed.join(', ')}` : null,
      scripts.length > 0 ? `reset ${scripts.join(', ')}` : null,
    ].filter(Boolean);

    spinner.succeed(
      pc.green(
        done.length > 0
          ? `Testing setup repaired (${done.join('; ')}).`
          : 'Testing setup repaired.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to repair testing setup.');
    throw error;
  }
};
