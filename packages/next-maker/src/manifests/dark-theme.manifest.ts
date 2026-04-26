import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists } from '../core/files';
import { setupDarkTheme } from '../services/setup/dark-theme';
import { unwrapJsxChain } from './transforms/unwrap-jsx';
import type { FeatureManifest } from './types';

export const darkThemeManifest: FeatureManifest = {
  id: 'dark-theme',
  name: 'Dark Theme',
  description: '@teispace/next-themes + CustomThemeProvider',
  detect: async (projectPath) => fileExists(path.join(projectPath, PROJECT_PATHS.THEME_PROVIDER)),
  files: [{ path: PROJECT_PATHS.THEME_PROVIDER, generated: true }],
  packages: [{ name: '@teispace/next-themes', kind: 'dependency' }],
  scripts: [],
  injections: [
    {
      file: 'src/providers/RootProvider.tsx',
      description: '<CustomThemeProvider> wrap',
      presence: /CustomThemeProvider/,
      removePattern: unwrapJsxChain('CustomThemeProvider'),
    },
  ],
  apply: setupDarkTheme,
};
