import fs from 'node:fs/promises';
import path from 'node:path';
import { PACKAGES } from '../../../config/packages';
import { PROJECT_PATHS } from '../../../config/paths';
import { deleteDirectory, deleteFile, updateJson } from '../../../core/files';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

const TEST_DEVDEPS = [
  PACKAGES.VITEST,
  PACKAGES.JSDOM,
  PACKAGES.VITE_PLUGIN_REACT,
  PACKAGES.TESTING_LIBRARY_DOM,
  PACKAGES.TESTING_LIBRARY_JEST_DOM,
  PACKAGES.TESTING_LIBRARY_REACT,
  PACKAGES.TESTING_LIBRARY_USER_EVENT,
];

/**
 * Delete every `*.test.ts(x)` / `*.spec.ts(x)` file and `__test-utils__`
 * directory under `root`. Exported for the WS asset copier and for tests.
 */
export const removeColocatedTests = async (root: string): Promise<void> => {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__test-utils__' || entry.name === '__tests__') {
        await deleteDirectory(full);
        continue;
      }
      await removeColocatedTests(full);
    } else if (entry.isFile() && /\.(test|spec)\.tsx?$/.test(entry.name)) {
      await deleteFile(full);
    }
  }
};

export const cleanupTests = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (answers.tests) return;

  await deleteFile(path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG));
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.TEST_DIR));
  // Tests are co-located across src/ (http, ws, config, store, features).
  // Without vitest installed every one of them fails `tsc`, so remove them
  // all rather than maintaining a list that drifts from the starter.
  await removeColocatedTests(path.join(projectPath, PROJECT_PATHS.SRC));

  await updateJson(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON), (pkg) => {
    if (pkg.devDependencies) {
      for (const dep of TEST_DEVDEPS) delete pkg.devDependencies[dep];
    }
    if (pkg.scripts) {
      delete pkg.scripts.test;
      delete pkg.scripts['test:watch'];
      delete pkg.scripts['test:coverage'];
      // Drop the `test` step from the validate chain.
      // Negative lookahead guards against matching `test:watch` / `test:coverage`.
      if (typeof pkg.scripts.validate === 'string') {
        pkg.scripts.validate = pkg.scripts.validate
          .replace(/\s*&&\s*yarn\s+test(?![:\w])/, '')
          .replace(/\byarn\s+test(?![:\w])\s*&&\s*/, '');
      }
    }
    return pkg;
  });
};
