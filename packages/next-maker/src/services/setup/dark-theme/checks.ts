import path from 'node:path';
import { fileExists, readFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import { findLayoutPath } from './utils';

export const checkIsAlreadySetup = async (
  projectPath: string,
): Promise<{ isSetup: boolean; reason: string }> => {
  const themeProviderPath = path.join(projectPath, PROJECT_PATHS.THEME_PROVIDER);
  const globalsCssPath = path.join(projectPath, PROJECT_PATHS.GLOBALS_CSS);
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (fileExists(themeProviderPath)) {
    return { isSetup: true, reason: 'CustomThemeProvider.tsx exists' };
  }

  if (fileExists(packageJsonPath)) {
    const packageJson = JSON.parse(await readFile(packageJsonPath));
    if (
      (packageJson.dependencies && packageJson.dependencies['next-themes']) ||
      (packageJson.devDependencies && packageJson.devDependencies['next-themes'])
    ) {
      return { isSetup: true, reason: 'next-themes is installed' };
    }
  }

  if (fileExists(globalsCssPath)) {
    const globalsCss = await readFile(globalsCssPath);
    if (globalsCss.includes('@custom-variant dark')) {
      return { isSetup: true, reason: 'Dark theme CSS found in globals.css' };
    }
  }

  return { isSetup: false, reason: '' };
};

export const validateProjectStructure = async (projectPath: string): Promise<string> => {
  const globalsCssPath = path.join(projectPath, PROJECT_PATHS.GLOBALS_CSS);
  const providersIndexPath = path.join(projectPath, PROJECT_PATHS.PROVIDERS_INDEX);
  const layoutPath = await findLayoutPath(projectPath);

  if (!fileExists(globalsCssPath) || !layoutPath || !fileExists(providersIndexPath)) {
    throw new Error(
      'Project structure mismatch. Ensure src/styles/globals.css, src/app/layout.tsx (or src/app/[locale]/layout.tsx), and src/providers/index.ts exist.',
    );
  }

  return layoutPath;
};
