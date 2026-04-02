import path from 'node:path';
import { fileExists, readFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import { findLayoutPath } from '../dark-theme/utils'; // Reuse utility

export const checkIsAlreadySetup = async (
  projectPath: string,
): Promise<{ isSetup: boolean; reason: string }> => {
  const storePath = path.join(projectPath, PROJECT_PATHS.STORE);
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (fileExists(storePath)) {
    return { isSetup: true, reason: 'src/store directory exists' };
  }

  if (fileExists(packageJsonPath)) {
    const packageJson = JSON.parse(await readFile(packageJsonPath));
    if (
      (packageJson.dependencies && packageJson.dependencies['@reduxjs/toolkit']) ||
      (packageJson.devDependencies && packageJson.devDependencies['@reduxjs/toolkit'])
    ) {
      return { isSetup: true, reason: '@reduxjs/toolkit is installed' };
    }
  }

  return { isSetup: false, reason: '' };
};

export const validateProjectStructure = async (projectPath: string): Promise<void> => {
  const providersIndexPath = path.join(projectPath, PROJECT_PATHS.PROVIDERS_INDEX);
  // We check for layout just to ensure it's a valid next app, reusing the robust check
  const layoutPath = await findLayoutPath(projectPath);

  if (!layoutPath || !fileExists(providersIndexPath)) {
    throw new Error(
      'Project structure mismatch. Ensure src/app/layout.tsx (or src/app/[locale]/layout.tsx) and src/providers/index.ts exist.',
    );
  }
};
