import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, readFile, updateJson, writeFile } from '../../../core/files';
import { detectPackageManager, installDevPackages } from '../../../core/package-manager';
import { addCommitizen, missingCommitizenDeps, type PackageJsonShape } from './package-modifier';

export {
  addCommitizen,
  missingCommitizenDeps,
  type PackageJsonShape,
} from './package-modifier';

const CZRC_CONTENT = `${JSON.stringify({ path: 'cz-conventional-changelog' }, null, 2)}\n`;

export const setupCommitizen = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Setting up Commitizen...');
  try {
    const czrcPath = path.join(projectPath, PROJECT_PATHS.CZRC);
    if (!fileExists(czrcPath)) {
      await writeFile(czrcPath, CZRC_CONTENT);
    }

    const pkgPath = path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON);
    const beforePkg = JSON.parse(await readFile(pkgPath)) as PackageJsonShape;
    const missing = missingCommitizenDeps(beforePkg);

    await updateJson<PackageJsonShape>(pkgPath, (pkg) => addCommitizen(pkg));

    if (missing.length > 0) {
      spinner.text = `Installing ${missing.join(', ')}...`;
      const manager = await detectPackageManager(projectPath);
      await installDevPackages(projectPath, manager, missing);
    }

    spinner.succeed(pc.green('Commitizen configured. Use `commit` to start a guided commit.'));
  } catch (error) {
    spinner.fail('Failed to set up Commitizen.');
    throw error;
  }
};
