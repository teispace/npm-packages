import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel } from '../config/utils';
import { fileExists } from '../core/files';

/**
 * Add a route to AppPaths in app-paths.ts.
 */
export const registerAppPath = async (
  projectPath: string,
  routeName: string,
  routePath: string,
): Promise<void> => {
  const appPathsFile = path.join(projectPath, 'src', 'lib', 'config', 'app-paths.ts');
  if (!fileExists(appPathsFile)) return;

  let content = await readFile(appPathsFile, 'utf-8');
  const camelName = kebabToCamel(routeName);

  if (content.includes(`${camelName}:`)) return;

  const closingBrace = content.lastIndexOf('} as const;');
  if (closingBrace === -1) return;

  const newEntry = `  ${camelName}: '${routePath}',\n`;
  content = content.slice(0, closingBrace) + newEntry + content.slice(closingBrace);

  await writeFile(appPathsFile, content);
};
