import path from 'node:path';
import degit from 'degit';
import { copyFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import { Ora } from 'ora';

export const fetchAssets = async (tempDir: string, spinner: Ora): Promise<void> => {
  spinner.text = 'Fetching assets from starter repo...';
  const emitter = degit('teispace/nextjs-starter', {
    cache: false,
    force: true,
    verbose: false,
  });
  await emitter.clone(tempDir);
};

export const copyThemeProvider = async (projectPath: string, tempDir: string): Promise<void> => {
  const themeProviderPath = path.join(projectPath, PROJECT_PATHS.THEME_PROVIDER);
  const sourceProviderPath = path.join(tempDir, 'src/providers/CustomThemeProvider.tsx');
  await copyFile(sourceProviderPath, themeProviderPath);
};
