import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { deleteDirectory, deleteFile, fileExists, readFile, writeFile } from '../../../core/files';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

export const cleanupI18n = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (answers.i18n) return;

  await deleteI18nFiles(projectPath);
  await removeI18nExports(projectPath);
  await removeI18nFromNextConfig(projectPath);
  await removeI18nFromCounter(projectPath);
  await removeI18nFromEnv(projectPath);
};

const removeI18nFromEnv = async (projectPath: string): Promise<void> => {
  const envPath = path.join(projectPath, PROJECT_PATHS.ENV_EXAMPLE);
  if (!fileExists(envPath)) return;
  let content = await readFile(envPath);
  // Strip the DEFAULT_TIMEZONE/DEFAULT_LOCALE blocks (incl. their comment headers).
  content = content.replace(/#[^\n]*IANA time zone[\s\S]*?DEFAULT_TIMEZONE=[^\n]*\n?/, '');
  content = content.replace(/#[^\n]*Fallback locale[\s\S]*?DEFAULT_LOCALE=[^\n]*\n?/, '');
  // Fallback cleanup if the comments changed/were removed.
  content = content.replace(/^DEFAULT_TIMEZONE=.*\n?/m, '');
  content = content.replace(/^DEFAULT_LOCALE=.*\n?/m, '');
  await writeFile(envPath, content);
};

const deleteI18nFiles = async (projectPath: string): Promise<void> => {
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.I18N_DIR));
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.LOCALE_DIR));
  await deleteFile(path.join(projectPath, PROJECT_PATHS.PROXY));
  await deleteFile(path.join(projectPath, PROJECT_PATHS.MIDDLEWARE));
  await deleteFile(path.join(projectPath, PROJECT_PATHS.I18N_TYPES));
  await deleteFile(path.join(projectPath, PROJECT_PATHS.APP_LOCALES));
};

const removeI18nExports = async (projectPath: string): Promise<void> => {
  const typesIndexPath = path.join(projectPath, PROJECT_PATHS.TYPES_INDEX);
  if (fileExists(typesIndexPath)) {
    let content = await readFile(typesIndexPath);
    content = content.replace(/export \* from '\.\/i18n';\n/, '');
    await writeFile(typesIndexPath, content);
  }

  const configIndexPath = path.join(projectPath, PROJECT_PATHS.CONFIG_INDEX);
  if (fileExists(configIndexPath)) {
    let content = await readFile(configIndexPath);
    content = content.replace(/export \* from '\.\/app-locales';\n/, '');
    await writeFile(configIndexPath, content);
  }
};

const removeI18nFromNextConfig = async (projectPath: string): Promise<void> => {
  const nextConfigPath = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
  if (fileExists(nextConfigPath)) {
    let content = await readFile(nextConfigPath);
    content = content.replace(/import createNextIntlPlugin from 'next-intl\/plugin';\n/, '');
    content = content.replace(/const withNextIntl = createNextIntlPlugin\(\);\n+/, '');
    // Unwrap withNextIntl(...) wherever it appears — the arg may itself be
    // a call like bundleAnalyzer(...) depending on enabled features.
    content = content.replace(/withNextIntl\(([^)]+)\)/, '$1');
    await writeFile(nextConfigPath, content);
  }
};

const removeI18nFromCounter = async (projectPath: string): Promise<void> => {
  const counterComponentPath = path.join(projectPath, PROJECT_PATHS.COUNTER_COMPONENT);
  if (fileExists(counterComponentPath)) {
    let content = await readFile(counterComponentPath);
    content = content.replace(
      /import\s+\{\s*useTranslations\s*\}\s+from\s+['"]next-intl['"];\n/,
      '',
    );
    content = content.replace(/\s*const\s+t\s*=\s*useTranslations\(['"]Count['"]\);\n/, '');
    content = content.replace(
      /\{t\('currentCount',\s*\{\s*count:\s*value\s*\}\)\}/g,
      'Current Count: {value}',
    );
    content = content.replace(/\{t\(['"]increment['"]\)\}/g, 'Increment');
    content = content.replace(/\{t\(['"]decrement['"]\)\}/g, 'Decrement');
    content = content.replace(/\{t\(['"]reset['"]\)\}/g, 'Reset');
    await writeFile(counterComponentPath, content);
  }

  // Counter.test.tsx and test-utils.tsx both depend on i18n — delete them
  // to avoid dangling references. Users can re-introduce tests later.
  const counterTestPath = path.join(
    projectPath,
    'src/features/counter/components/Counter.test.tsx',
  );
  const testUtilsPath = path.join(projectPath, 'test/test-utils.tsx');
  await deleteFile(counterTestPath);
  await deleteFile(testUtilsPath);
};
