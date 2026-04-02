import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileExists } from '../core/files';

/**
 * Add a translation namespace to the default (en) translation file.
 */
export const addTranslationNamespace = async (
  projectPath: string,
  namespace: string,
): Promise<void> => {
  const translationFile = path.join(projectPath, 'src', 'i18n', 'translations', 'en.json');
  if (!fileExists(translationFile)) return;

  const content = await readFile(translationFile, 'utf-8');
  const json = JSON.parse(content);

  if (json[namespace]) return;

  json[namespace] = {
    title: namespace,
    description: `${namespace} page description`,
  };

  await writeFile(translationFile, JSON.stringify(json, null, 2) + '\n');
};
