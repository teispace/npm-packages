import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, updateJson, writeFile } from '../../../core/files';
import { detectPackageManager, installDevPackages } from '../../../core/package-manager';
import { addValidationScripts, type PackageJsonShape } from './package-modifier';
import { CHECK_DEPRECATED_SCRIPT, SYNC_ENV_SCRIPT } from './scripts';

export {
  addValidationScripts,
  type PackageJsonShape,
} from './package-modifier';
export { CHECK_DEPRECATED_SCRIPT, SYNC_ENV_SCRIPT } from './scripts';

const SCRIPT_TARGETS = [
  { relative: 'scripts/sync-env.ts', content: SYNC_ENV_SCRIPT },
  { relative: 'scripts/check-deprecated.ts', content: CHECK_DEPRECATED_SCRIPT },
] as const;

export const setupValidationScripts = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Adding validation scripts...');
  try {
    // 1. Write script files (skip when present — never overwrite user edits)
    let wroteAny = false;
    for (const { relative, content } of SCRIPT_TARGETS) {
      const target = path.join(projectPath, relative);
      if (fileExists(target)) continue;
      await writeFile(target, content);
      wroteAny = true;
    }

    // 2. Patch package.json
    const manager = await detectPackageManager(projectPath);
    let needsTsx = false;
    await updateJson<PackageJsonShape>(
      path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON),
      (pkg) => {
        const before = pkg.devDependencies?.tsx;
        const next = addValidationScripts(pkg, manager);
        needsTsx = !before && !!next.devDependencies?.tsx;
        return next;
      },
    );

    // 3. Install tsx (only if it was newly added)
    if (needsTsx) {
      spinner.text = 'Installing tsx...';
      await installDevPackages(projectPath, manager, ['tsx']);
    }

    spinner.succeed(
      pc.green(
        wroteAny
          ? 'Validation scripts added (env:sync, check:deprecated, validate).'
          : 'Validation scripts already present — refreshed package.json.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to add validation scripts.');
    throw error;
  }
};
