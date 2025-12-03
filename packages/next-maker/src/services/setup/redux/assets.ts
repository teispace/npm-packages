import path from 'node:path';
import degit from 'degit';
import { copyFile, readFile, writeFile, fileExists } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import { Ora } from 'ora';
import fs from 'node:fs/promises';

export const fetchAssets = async (tempDir: string, spinner: Ora): Promise<void> => {
  spinner.text = 'Fetching assets from starter repo...';
  const emitter = degit('teispace/nextjs-starter', {
    cache: false,
    force: true,
    verbose: false,
  });
  await emitter.clone(tempDir);
};

export const copyReduxFiles = async (projectPath: string, tempDir: string): Promise<void> => {
  // Copy StoreProvider
  const sourceProviderPath = path.join(tempDir, 'src/providers/StoreProvider.tsx');
  const destProviderPath = path.join(projectPath, PROJECT_PATHS.STORE_PROVIDER);
  await copyFile(sourceProviderPath, destProviderPath);

  // Copy src/store directory
  const sourceStoreDir = path.join(tempDir, 'src/store');
  const destStoreDir = path.join(projectPath, PROJECT_PATHS.STORE);
  await fs.cp(sourceStoreDir, destStoreDir, { recursive: true });
};

export const createCounterFeature = async (projectPath: string, tempDir: string): Promise<void> => {
  const sourceFeatureDir = path.join(tempDir, 'src/features/counter');
  const destFeatureDir = path.join(projectPath, PROJECT_PATHS.COUNTER_FEATURE);

  // Copy the entire directory first
  await fs.cp(sourceFeatureDir, destFeatureDir, { recursive: true });

  // Modify Counter.tsx to remove i18n
  const counterComponentPath = path.join(destFeatureDir, 'components/Counter.tsx');
  if (await fileExists(counterComponentPath)) {
    let content = await readFile(counterComponentPath);

    // Remove imports
    content = content.replace(/import \{ useTranslations \} from 'next-intl';\n?/, '');

    // Remove hook usage
    content = content.replace(/const t = useTranslations\('Count'\);\n?/, '');

    // Replace translations with hardcoded strings
    // {t('currentCount', { count: value })} -> Current Count: {value}
    content = content.replace(
      /\{t\('currentCount', \{ count: value \}\)\}/g,
      'Current Count: {value}',
    );

    // {t('increment')} -> Increment
    content = content.replace(/\{t\('increment'\)\}/g, 'Increment');

    // {t('decrement')} -> Decrement
    content = content.replace(/\{t\('decrement'\)\}/g, 'Decrement');

    // {t('reset')} -> Reset
    content = content.replace(/\{t\('reset'\)\}/g, 'Reset');

    await writeFile(counterComponentPath, content);
  }
};
