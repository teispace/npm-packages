import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists } from '../../../core/files';

export type WsSetupStatus = { isSetup: boolean; reason?: string };

/**
 * Reports `isSetup: true` when the ws directory is already on disk —
 * matches the dual-signal check `detectProjectSetup` uses, but doesn't
 * require the dep to be resolved (the setup service installs the dep
 * itself, so we don't want to gate on it).
 */
export const checkIsAlreadySetup = async (projectPath: string): Promise<WsSetupStatus> => {
  const wsDir = path.join(projectPath, PROJECT_PATHS.WS_UTILS);
  if (fileExists(wsDir)) {
    return { isSetup: true, reason: 'src/lib/utils/ws/ already exists' };
  }
  return { isSetup: false };
};

/**
 * WS layer depends on Redux: the bridge dispatches into `wsReducer`, and
 * `src/store/rootReducer.ts` is the file we register the reducer in. Fail
 * loud before any files are copied so the user can run `setup --redux` first.
 */
export const validateProjectStructure = async (projectPath: string): Promise<void> => {
  const missing: string[] = [];

  const required = [
    { rel: 'src/lib', label: 'src/lib' },
    { rel: 'src/store', label: 'src/store (Redux Toolkit not installed?)' },
    { rel: PROJECT_PATHS.ROOT_REDUCER, label: 'src/store/rootReducer.ts (Redux not initialised?)' },
    {
      rel: PROJECT_PATHS.STORE_PROVIDER,
      label: 'src/providers/StoreProvider.tsx (Redux not initialised?)',
    },
  ];

  for (const { rel, label } of required) {
    if (!fileExists(path.join(projectPath, rel))) {
      missing.push(`- ${label}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `WebSocket setup requires Redux Toolkit. Missing:\n${missing.join('\n')}\n\nRun \`next-maker setup --redux\` first.`,
    );
  }
};
