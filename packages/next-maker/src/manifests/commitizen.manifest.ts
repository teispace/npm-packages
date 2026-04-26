import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists } from '../core/files';
import { setupCommitizen } from '../services/setup/commitizen';
import type { FeatureManifest } from './types';

export const commitizenManifest: FeatureManifest = {
  id: 'commitizen',
  name: 'Commitizen',
  description: 'Guided conventional-commit prompt via `commit` script',
  detect: async (projectPath) => fileExists(path.join(projectPath, PROJECT_PATHS.CZRC)),
  files: [{ path: PROJECT_PATHS.CZRC, generated: true }],
  packages: [
    { name: 'commitizen', kind: 'devDependency' },
    { name: 'cz-conventional-changelog', kind: 'devDependency' },
  ],
  scripts: [{ name: 'commit', expectedValue: 'cz' }],
  injections: [],
  apply: setupCommitizen,
};
