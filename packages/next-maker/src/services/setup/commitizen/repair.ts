import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, writeFile } from '../../../core/files';
import type { FeatureFinding } from '../../../manifests/types';
import { isFileMissing, repairPackages, repairScripts } from '../repair-kit';
import { CZRC_CONTENT } from './czrc';

/**
 * Repair Commitizen drift.
 *
 * `.czrc` is regenerated from the embedded template, the `commit` script is
 * reset from the manifest's expected value, and any dev dep missing from
 * package.json is reinstalled.
 */
export const repairCommitizen = async (
  projectPath: string,
  drift: FeatureFinding[],
): Promise<void> => {
  const spinner = startSpinner('Repairing Commitizen...');
  try {
    let rewroteCzrc = false;
    if (isFileMissing(drift, PROJECT_PATHS.CZRC)) {
      const czrcPath = path.join(projectPath, PROJECT_PATHS.CZRC);
      if (!fileExists(czrcPath)) {
        await writeFile(czrcPath, CZRC_CONTENT);
        rewroteCzrc = true;
      }
    }

    const installed = await repairPackages(projectPath, drift);
    const scripts = await repairScripts(projectPath, drift);

    const done = [
      rewroteCzrc ? `rewrote ${PROJECT_PATHS.CZRC}` : null,
      installed.length > 0 ? `reinstalled ${installed.join(', ')}` : null,
      scripts.length > 0 ? `restored ${scripts.join(', ')}` : null,
    ].filter(Boolean);

    spinner.succeed(
      pc.green(
        done.length > 0 ? `Commitizen repaired (${done.join('; ')}).` : 'Commitizen repaired.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to repair Commitizen.');
    throw error;
  }
};
