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
  files: [
    {
      path: 'src/lib/utils/http',
      generated: true,
      isDir: true,
      containsUserContent: true,
      removeHint:
        'holds the http client + any service modules you wired through it — review before deleting',
    },
    {
      // Tracked separately so `doctor` reports it by name when missing —
      // shared/ is the foundation both clients import from, and silent
      // drift here breaks every request. Re-running setup restores it.
      path: 'src/lib/utils/http/shared',
      generated: true,
      isDir: true,
    },
    {
      // Server-only HTTP entry. Pairs with universal index.ts but is a
      // separate barrel so next/headers stays out of the client bundle.
      path: 'src/lib/utils/http/server.ts',
      generated: true,
    },
    {
      // Build-time regression gate. The 'use client' sentinel proves the
      // universal entry doesn't drag next/headers into the client bundle.
      // Doctor names this explicitly: silent deletion is a real risk
      // because the name suggests it's safe to drop.
      path: 'src/lib/utils/http/__bundle-sentinel__',
      generated: true,
      isDir: true,
    },
    {
      path: 'src/lib/config/api-url.ts',
      generated: true,
    },
  ],
  // No deps listed: axios is conditionally installed; the manifest can't
  // know which client variant is active without re-running detection.
  packages: [],
  scripts: [],
  injections: [],
  apply: setupHttpClient,
};
