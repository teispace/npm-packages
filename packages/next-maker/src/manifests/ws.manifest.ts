import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setupWs } from '../services/setup/ws';
import type { FeatureManifest } from './types';

/**
 * Detect by dual signal: `socket.io-client` in dependencies AND
 * `src/lib/utils/ws/` on disk. Either alone is a half-state and gets
 * reported as not-installed, so setup/doctor/remove all see the same
 * binary signal.
 *
 * This duplicates the logic that `detectProjectSetup` carries for ws to
 * keep the manifest standalone — it doesn't have to wait for the
 * detection-extension PR to land before being merged.
 */
const detectWs = async (projectPath: string): Promise<boolean> => {
  try {
    const pkg = JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!deps['socket.io-client']) return false;
    await access(path.join(projectPath, 'src/lib/utils/ws'));
    return true;
  } catch {
    return false;
  }
};

export const wsManifest: FeatureManifest = {
  id: 'ws',
  name: 'WebSocket Client',
  description: 'socket.io-client + lazy WS singleton + Redux slice + hooks',
  detect: detectWs,
  files: [
    {
      path: 'src/lib/utils/ws',
      generated: true,
      isDir: true,
      containsUserContent: true,
      removeHint: 'holds the ws client + any feature event maps you added — review before deleting',
    },
    {
      // Tracked separately so doctor names it when missing; the slice lives
      // outside ws/ (in src/store/slices/) and is easy to miss in a manual cleanup.
      path: 'src/store/slices/ws.slice.ts',
      generated: true,
    },
  ],
  packages: [{ name: 'socket.io-client', kind: 'dependency' }],
  scripts: [],
  injections: [
    {
      file: 'src/store/rootReducer.ts',
      description: 'wsReducer registration in rootReducer',
      // Match the reducer entry in combineReducers — `ws: wsReducer` (not
      // wrapped in persistReducer; connection state is ephemeral by design).
      presence: /ws:\s*wsReducer\b/,
      // No removePattern: stripping a reducer from combineReducers cleanly
      // requires AST work the manifest reverser doesn't have. Surfaces as
      // manual cleanup so the user can confirm.
    },
    {
      file: 'src/providers/StoreProvider.tsx',
      description: 'attachWsBridge mount in StoreProvider',
      presence: /attachWsBridge\(wsClient,\s*store\.dispatch\)/,
      // Same rationale — stripBridgeMount handles this in the setup-service
      // path; manifest reverser surfaces it for manual review when invoked.
    },
  ],
  apply: setupWs,
};
