import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists, readFile } from '../../../core/files';

export const checkIsAlreadySetup = async (
  projectPath: string,
): Promise<{ isSetup: boolean; reason: string }> => {
  const i18nDir = path.join(projectPath, PROJECT_PATHS.I18N_DIR);
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (fileExists(i18nDir)) {
    return { isSetup: true, reason: 'src/i18n directory exists' };
  }

  if (fileExists(packageJsonPath)) {
    const packageJson = JSON.parse(await readFile(packageJsonPath));
    if (packageJson.dependencies?.['next-intl'] || packageJson.devDependencies?.['next-intl']) {
      return { isSetup: true, reason: 'next-intl is installed' };
    }
  }

  return { isSetup: false, reason: '' };
};

export const validateProjectStructure = async (projectPath: string): Promise<void> => {
  const rootLayoutPath = path.join(projectPath, PROJECT_PATHS.ROOT_LAYOUT);
  const localeLayoutPath = path.join(projectPath, 'src/app/[locale]/layout.tsx');

  if (!fileExists(rootLayoutPath) && !fileExists(localeLayoutPath)) {
    throw new Error('Project structure mismatch. Ensure src/app/layout.tsx exists.');
  }
};
