import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists, readFile } from '../core/files';
import { setupReactCompiler } from '../services/setup/react-compiler';
import type { FeatureManifest } from './types';

export const reactCompilerManifest: FeatureManifest = {
  id: 'react-compiler',
  name: 'React Compiler',
  description: 'reactCompiler: true in next.config.ts + babel-plugin-react-compiler',
  detect: async (projectPath) => {
    const target = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
    if (!fileExists(target)) return false;
    return /reactCompiler\s*:\s*true/.test(await readFile(target));
  },
  files: [],
  packages: [{ name: 'babel-plugin-react-compiler', kind: 'devDependency' }],
  scripts: [],
  injections: [
    {
      file: PROJECT_PATHS.NEXT_CONFIG,
      description: '`reactCompiler: true` flag',
      presence: /reactCompiler\s*:\s*true/,
      removePattern: /\n\s*reactCompiler:\s*true,?/,
    },
  ],
  apply: setupReactCompiler,
};
