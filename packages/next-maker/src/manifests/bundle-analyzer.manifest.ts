import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists, readFile } from '../core/files';
import { setupBundleAnalyzer } from '../services/setup/bundle-analyzer';
import type { FeatureManifest } from './types';

export const bundleAnalyzerManifest: FeatureManifest = {
  id: 'bundle-analyzer',
  name: 'Bundle Analyzer',
  description: '@next/bundle-analyzer wrapped around the default export',
  detect: async (projectPath) => {
    const target = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
    if (!fileExists(target)) return false;
    return /@next\/bundle-analyzer/.test(await readFile(target));
  },
  files: [],
  packages: [{ name: '@next/bundle-analyzer', kind: 'devDependency' }],
  scripts: [{ name: 'analyze', expectedValue: 'ANALYZE=true next build' }],
  injections: [
    {
      file: PROJECT_PATHS.NEXT_CONFIG,
      description: 'withBundleAnalyzer import + wrapping',
      presence: /@next\/bundle-analyzer/,
      // No safe removePattern — undoing the `bundleAnalyzer(...)` wrap requires
      // unwrapping the export. Reported as manual cleanup for now.
    },
  ],
  apply: setupBundleAnalyzer,
};
