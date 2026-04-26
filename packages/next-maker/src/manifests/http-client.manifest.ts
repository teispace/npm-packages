import { setupHttpClient } from '../services/setup/http-client';
import type { FeatureManifest } from './types';

export const httpClientManifest: FeatureManifest = {
  id: 'http-client',
  name: 'HTTP Client',
  description: 'Axios and/or Fetch client utilities',
  detect: async (projectPath) => {
    const { detectProjectSetup } = await import('../detection');
    return (await detectProjectSetup(projectPath)).httpClient !== 'none';
  },
  files: [{ path: 'src/lib/utils/http', generated: true, isDir: true }],
  // No deps listed: axios is conditionally installed; the manifest can't
  // know which client variant is active without re-running detection.
  packages: [],
  scripts: [],
  injections: [],
  apply: setupHttpClient,
};
