import fs from 'node:fs/promises';
import path from 'node:path';
import degit from 'degit';
import type { Ora } from 'ora';
import { PROJECT_PATHS } from '../../../config/paths';
import { copyFile, deleteDirectory } from '../../../core/files';

export const fetchAssets = async (tempDir: string, spinner: Ora): Promise<void> => {
  spinner.text = 'Downloading assets from starter repository...';
  const emitter = degit('teispace/nextjs-starter', {
    cache: false,
    force: true,
    verbose: false,
  });
  await emitter.clone(tempDir);
};

/**
 * Copy the entire WS subtree + the connection-state slice. The subtree is
 * package-managed code (not a user-edit surface) so it's always overwritten.
 *
 * `keepTests=false` strips `*.test.ts(x)` files and the `__test-utils__/`
 * helper directory so projects without vitest don't carry dead test files.
 * The strip is applied AFTER the recursive copy because cherry-picking files
 * with `fs.cp` filters is awkward and slow on this small a tree.
 */
export const copyWsFiles = async (
  projectPath: string,
  tempDir: string,
  options: { keepTests: boolean },
): Promise<void> => {
  // src/lib/utils/ws/ — entire subtree
  const wsTarget = path.join(projectPath, PROJECT_PATHS.WS_UTILS);
  await fs.cp(path.join(tempDir, PROJECT_PATHS.WS_UTILS), wsTarget, {
    recursive: true,
    force: true,
  });

  // src/store/slices/ws.slice.ts
  const sliceTarget = path.join(projectPath, PROJECT_PATHS.WS_SLICE_FILE);
  await copyFile(path.join(tempDir, PROJECT_PATHS.WS_SLICE_FILE), sliceTarget);

  if (!options.keepTests) {
    await stripWsTestArtifacts(wsTarget);
  }
};

/**
 * Walk the copied ws/ tree and remove `*.test.ts`, `*.test.tsx`, and the
 * `__test-utils__/` directory. Used when the project doesn't have vitest —
 * orphan test files generate IDE noise and never run.
 */
export const stripWsTestArtifacts = async (wsRoot: string): Promise<void> => {
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__test-utils__') {
          await deleteDirectory(full);
          continue;
        }
        await walk(full);
      } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
        await fs.unlink(full);
      }
    }
  };
  await walk(wsRoot);
};
