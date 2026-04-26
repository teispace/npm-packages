import path from 'node:path';
import { fileExists } from '../core/files';
import { setupValidationScripts } from '../services/setup/validate-scripts';
import type { FeatureManifest } from './types';

const SCRIPT_FILES = ['scripts/sync-env.ts', 'scripts/check-deprecated.ts'] as const;

export const validateScriptsManifest: FeatureManifest = {
  id: 'validate-scripts',
  name: 'Validation Scripts',
  description: 'sync-env, check-deprecated, and the validate chain',
  detect: async (projectPath) =>
    SCRIPT_FILES.every((rel) => fileExists(path.join(projectPath, rel))),
  files: SCRIPT_FILES.map((p) => ({ path: p, generated: true })),
  packages: [{ name: 'tsx', kind: 'devDependency' }],
  scripts: [
    { name: 'env:sync', expectedValue: 'tsx scripts/sync-env.ts' },
    { name: 'check:deprecated', expectedValue: 'tsx scripts/check-deprecated.ts' },
    { name: 'type-check', expectedValue: 'tsc --noEmit' },
    { name: 'validate' },
  ],
  injections: [],
  apply: setupValidationScripts,
};
