import path from 'node:path';
import type { Ora } from 'ora';
import { PROJECT_PATHS } from '../../../config/paths';
import { cloneStarter } from '../../../config/starter';
import { copyFile } from '../../../core/files';

export const fetchAssets = async (tempDir: string, spinner: Ora): Promise<void> => {
  spinner.text = 'Fetching assets from starter repo...';
  await cloneStarter(tempDir);
};

export const copyThemeProvider = async (projectPath: string, tempDir: string): Promise<void> => {
  const themeProviderPath = path.join(projectPath, PROJECT_PATHS.THEME_PROVIDER);
  const sourceProviderPath = path.join(tempDir, 'src/providers/CustomThemeProvider.tsx');
  await copyFile(sourceProviderPath, themeProviderPath);
};
