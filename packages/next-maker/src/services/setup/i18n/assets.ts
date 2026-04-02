import path from 'node:path';
import degit from 'degit';
import { copyFile } from '../../../core/files';
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

export const copyI18nFiles = async (projectPath: string, tempDir: string): Promise<void> => {
  // Copy src/i18n directory
  const sourceI18nDir = path.join(tempDir, 'src/i18n');
  const destI18nDir = path.join(projectPath, PROJECT_PATHS.I18N_DIR);
  await fs.cp(sourceI18nDir, destI18nDir, { recursive: true });

  // Copy src/proxy.ts
  const sourceProxyPath = path.join(tempDir, 'src/proxy.ts');
  const destProxyPath = path.join(projectPath, PROJECT_PATHS.PROXY);
  await copyFile(sourceProxyPath, destProxyPath);

  // Copy src/types/i18n.ts
  const sourceTypesPath = path.join(tempDir, 'src/types/i18n.ts');
  const destTypesPath = path.join(projectPath, PROJECT_PATHS.I18N_TYPES);
  await copyFile(sourceTypesPath, destTypesPath);

  // Copy src/lib/config/app-locales.ts
  const sourceLocalesPath = path.join(tempDir, 'src/lib/config/app-locales.ts');
  const destLocalesPath = path.join(projectPath, PROJECT_PATHS.APP_LOCALES);
  await copyFile(sourceLocalesPath, destLocalesPath);
};
