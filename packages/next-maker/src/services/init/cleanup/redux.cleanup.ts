import path from 'node:path';
import { deleteDirectory, deleteFile, fileExists, readFile, writeFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

export const cleanupRedux = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (answers.redux) return;

  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.STORE));
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.COUNTER_FEATURE));
  await deleteFile(path.join(projectPath, PROJECT_PATHS.STORE_PROVIDER));

  await removeStoreProviderExport(projectPath);
  await removeCounterFromPages(projectPath);
};

const removeStoreProviderExport = async (projectPath: string): Promise<void> => {
  const providersIndexPath = path.join(projectPath, PROJECT_PATHS.PROVIDERS_INDEX);
  let content = await readFile(providersIndexPath);
  content = content.replace(/export \* from '\.\/StoreProvider';\n/, '');
  await writeFile(providersIndexPath, content);
};

const removeCounterFromPages = async (projectPath: string): Promise<void> => {
  const pagesToClean = [
    path.join(projectPath, PROJECT_PATHS.ROOT_PAGE),
    path.join(projectPath, PROJECT_PATHS.LOCALE_PAGE),
  ];

  for (const pagePath of pagesToClean) {
    if (fileExists(pagePath)) {
      let content = await readFile(pagePath);
      content = content.replace(
        /import\s+\{\s*Counter\s*\}\s+from\s+['"]@\/features\/counter['"];\n?/,
        '',
      );
      content = content.replace(/<Counter\s*\/>\n?/g, '');
      await writeFile(pagePath, content);
    }
  }
};
