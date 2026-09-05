import { copyFile, readFile as readFileFs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileExists, readFile, writeFile as writeFileCore } from '../core/files';

export interface LocaleGeneratorOptions {
  code: string;
  name: string;
  country: string;
  flag: string;
  projectPath: string;
  copyTranslations: boolean;
}

export const generateLocale = async (options: LocaleGeneratorOptions): Promise<void> => {
  const { code, name, country, flag, projectPath, copyTranslations } = options;

  await createTranslationFile(projectPath, code, copyTranslations);
  await updateSupportedLocaleType(projectPath, code);
  await updateAppLocalesConfig(projectPath, code, name, country, flag);
};

const createTranslationFile = async (
  projectPath: string,
  code: string,
  copyTranslations: boolean,
): Promise<void> => {
  const translationsDir = path.join(projectPath, 'src', 'i18n', 'translations');
  const sourcePath = path.join(translationsDir, 'en.json');
  const destPath = path.join(translationsDir, `${code}.json`);

  if (copyTranslations) {
    await copyFile(sourcePath, destPath);
  } else {
    // Copy structure but empty all string values
    const sourceContent = await readFileFs(sourcePath, 'utf-8');
    const sourceJson = JSON.parse(sourceContent);
    const emptyJson = emptyValues(sourceJson);
    await writeFile(destPath, `${JSON.stringify(emptyJson, null, 2)}\n`);
  }
};

const emptyValues = (obj: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = emptyValues(value as Record<string, unknown>);
    } else {
      result[key] = '';
    }
  }
  return result;
};

const updateSupportedLocaleType = async (projectPath: string, code: string): Promise<void> => {
  const typesPath = path.join(projectPath, 'src', 'types', 'i18n.ts');
  if (!fileExists(typesPath)) return;

  let content = await readFile(typesPath);

  // v2: `export const SUPPORTED_LOCALES = ['en'] as const;`
  const arrayRe = /export const SUPPORTED_LOCALES = \[([^\]]*)\] as const;/;
  const arrayMatch = content.match(arrayRe);
  if (arrayMatch) {
    if (arrayMatch[1].includes(`'${code}'`)) return;
    const entries = arrayMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    entries.push(`'${code}'`);
    content = content.replace(
      arrayRe,
      `export const SUPPORTED_LOCALES = [${entries.join(', ')}] as const;`,
    );
    await writeFileCore(typesPath, content);
    return;
  }

  // 1.x: `export type SupportedLocale = 'en' | 'es';`
  const localeTypeRegex = /export type SupportedLocale = (.*);/;
  const match = content.match(localeTypeRegex);
  if (match && !match[1].includes(`'${code}'`)) {
    content = content.replace(
      localeTypeRegex,
      `export type SupportedLocale = ${match[1]} | '${code}';`,
    );
    await writeFileCore(typesPath, content);
  }
};

const updateAppLocalesConfig = async (
  projectPath: string,
  code: string,
  localeName: string,
  country: string,
  flag: string,
): Promise<void> => {
  const configPath = path.join(projectPath, 'src', 'lib', 'config', 'app-locales.ts');
  if (!fileExists(configPath)) return;

  let content = await readFile(configPath);

  if (content.includes(`locale: '${code}'`)) return;

  // Insert new locale before the closing bracket
  const closingBracket = content.lastIndexOf('];');
  if (closingBracket === -1) return;

  const newLocale = `  {
    name: '${localeName}',
    locale: '${code}',
    flag: '${flag}',
    country: '${country}',
    ogLocale: '${code}_${code.toUpperCase()}',
  },\n`;

  content = content.slice(0, closingBracket) + newLocale + content.slice(closingBracket);
  await writeFileCore(configPath, content);
};
