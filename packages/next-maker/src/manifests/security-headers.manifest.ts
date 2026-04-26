import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists, readFile } from '../core/files';
import { hasSecurityHeaders, setupSecurityHeaders } from '../services/setup/security-headers';
import type { FeatureManifest } from './types';

export const securityHeadersManifest: FeatureManifest = {
  id: 'security-headers',
  name: 'Security Headers',
  description: 'Hardened HTTP headers in next.config.ts',
  detect: async (projectPath) => {
    const target = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
    if (!fileExists(target)) return false;
    return hasSecurityHeaders(await readFile(target));
  },
  files: [],
  packages: [],
  scripts: [],
  injections: [
    {
      file: PROJECT_PATHS.NEXT_CONFIG,
      description: 'headers() function in next.config.ts',
      presence: /^\s+headers\s*:/m,
      removePattern: /\s+headers:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\n\s{0,2}\},/m,
    },
  ],
  apply: setupSecurityHeaders,
};
