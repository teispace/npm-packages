import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists } from '../core/files';
import { setupTests } from '../services/setup/tests';
import type { FeatureManifest } from './types';

export const testsManifest: FeatureManifest = {
  id: 'tests',
  name: 'Tests',
  description: 'Vitest + React Testing Library + jsdom',
  detect: async (projectPath) => fileExists(path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG)),
  files: [
    { path: PROJECT_PATHS.VITEST_CONFIG, generated: true },
    {
      path: 'test',
      generated: true,
      isDir: true,
      containsUserContent: true,
      removeHint:
        'holds setup.ts / test-utils.tsx and any helpers you added — review before deleting',
    },
  ],
  packages: [
    { name: 'vitest', kind: 'devDependency' },
    { name: 'jsdom', kind: 'devDependency' },
    { name: '@vitejs/plugin-react', kind: 'devDependency' },
    { name: '@testing-library/dom', kind: 'devDependency' },
    { name: '@testing-library/jest-dom', kind: 'devDependency' },
    { name: '@testing-library/react', kind: 'devDependency' },
    { name: '@testing-library/user-event', kind: 'devDependency' },
  ],
  scripts: [
    { name: 'test', expectedValue: 'vitest run' },
    { name: 'test:watch', expectedValue: 'vitest' },
  ],
  injections: [],
  apply: setupTests,
};
