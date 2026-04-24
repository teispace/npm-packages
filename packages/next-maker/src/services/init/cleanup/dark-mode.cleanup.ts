import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { deleteFile, fileExists, readFile, writeFile } from '../../../core/files';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

export const cleanupDarkMode = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  if (answers.darkMode) return;

  await deleteFile(path.join(projectPath, PROJECT_PATHS.THEME_PROVIDER));
  await removeThemeProviderExport(projectPath);
  await removeDarkModeCSS(projectPath);
  // Strip dark-mode classes from whichever layout is present. generateLayout
  // overwrites src/app/layout.tsx when i18n is off, so we focus on [locale]/layout.tsx
  // but handle both for robustness.
  await removeDarkModeFromLayout(projectPath);
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

const stripDarkModeClasses = (content: string): string => {
  // Template layouts use "bg-light antialiased dark:bg-dark" in various orderings.
  // Drop the bg-light and dark:bg-dark tokens and collapse stray whitespace.
  return content
    .replace(/\bbg-light\b\s?/g, '')
    .replace(/\bdark:bg-dark\b\s?/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/suppressHydrationWarning=\{true\}/g, '');
};

const removeDarkModeFromLayout = async (projectPath: string): Promise<void> => {
  const layoutPaths = [
    path.join(projectPath, PROJECT_PATHS.ROOT_LAYOUT),
    path.join(projectPath, 'src/app/[locale]/layout.tsx'),
  ];

  for (const layoutPath of layoutPaths) {
    if (fileExists(layoutPath)) {
      const original = await readFile(layoutPath);
      const updated = stripDarkModeClasses(original);
      if (updated !== original) {
        await writeFile(layoutPath, updated);
      }
    }
  }
};
