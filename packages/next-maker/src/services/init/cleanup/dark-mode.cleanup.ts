import path from 'node:path';
import { deleteFile, fileExists, readFile, writeFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

export const cleanupDarkMode = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  if (answers.darkMode) return;

  await deleteFile(path.join(projectPath, PROJECT_PATHS.THEME_PROVIDER));
  await removeThemeProviderExport(projectPath);
  await removeDarkModeCSS(projectPath);

  if (!answers.i18n) {
    await removeDarkModeFromLayout(projectPath);
  }
};

const removeThemeProviderExport = async (projectPath: string): Promise<void> => {
  const providersIndexPath = path.join(projectPath, PROJECT_PATHS.PROVIDERS_INDEX);
  let content = await readFile(providersIndexPath);
  content = content.replace(/export \* from '\.\/CustomThemeProvider';\n/, '');
  await writeFile(providersIndexPath, content);
};

const removeDarkModeCSS = async (projectPath: string): Promise<void> => {
  const globalsCssPath = path.join(projectPath, PROJECT_PATHS.GLOBALS_CSS);
  if (fileExists(globalsCssPath)) {
    let content = await readFile(globalsCssPath);
    content = content.replace(/@custom-variant dark \(.*?\);\n\n/, '');
    content = content.replace(/@theme \{[\s\S]*?\}\n/, '');
    await writeFile(globalsCssPath, content);
  }
};

const removeDarkModeFromLayout = async (projectPath: string): Promise<void> => {
  const layoutPath = path.join(projectPath, PROJECT_PATHS.ROOT_LAYOUT);
  if (fileExists(layoutPath)) {
    let content = await readFile(layoutPath);
    content = content.replace(/bg-light dark:bg-dark /g, '');
    await writeFile(layoutPath, content);
  }
};
