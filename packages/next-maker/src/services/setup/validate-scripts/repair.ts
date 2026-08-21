import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, updateJson, writeFile } from '../../../core/files';
import { detectPackageManager } from '../../../core/package-manager';
import type { FeatureFinding } from '../../../manifests/types';
import { isFileMissing, repairPackages, repairScripts } from '../repair-kit';
import { addValidationScripts, type PackageJsonShape } from './package-modifier';
import { SCRIPT_TARGETS } from './scripts';

/**
 * Repair validation-scripts drift.
 *
 * Deleted script files are re-written from the embedded templates (no
 * network needed), missing packages are reinstalled, and the scripts block
 * is rebuilt. `validate` has no `expectedValue` in the manifest — its chain
 * is package-manager specific — so it is restored through
 * `addValidationScripts`, which knows how to build it, rather than through
 * the generic finding-driven script repair.
 */
export const repairValidationScripts = async (
  projectPath: string,
  drift: FeatureFinding[],
): Promise<void> => {
  const spinner = startSpinner('Repairing validation scripts...');
  try {
    const restored: string[] = [];
    for (const { relative, content } of SCRIPT_TARGETS) {
      if (!isFileMissing(drift, relative)) continue;
      const target = path.join(projectPath, relative);
      if (fileExists(target)) continue;
      await writeFile(target, content);
      restored.push(relative);
    }

    const installed = await repairPackages(projectPath, drift);

    // Fill in any script the manifest declared but package.json lacks…
    const pkgPath = path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON);
    if (fileExists(pkgPath)) {
      const manager = await detectPackageManager(projectPath);
      await updateJson<PackageJsonShape>(pkgPath, (pkg) => addValidationScripts(pkg, manager));
    }
    // …then reset the ones whose value drifted from what we declare.
    const scripts = await repairScripts(projectPath, drift);

    const done = [
      restored.length > 0 ? `rewrote ${restored.join(', ')}` : null,
      installed.length > 0 ? `reinstalled ${installed.join(', ')}` : null,
      scripts.length > 0 ? `reset ${scripts.join(', ')}` : null,
    ].filter(Boolean);

    spinner.succeed(
      pc.green(
        done.length > 0
          ? `Validation scripts repaired (${done.join('; ')}).`
          : 'Validation scripts repaired.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to repair validation scripts.');
    throw error;
  }
};
