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

export const cleanupTests = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (answers.tests) return;

  await deleteFile(path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG));
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.TEST_DIR));
  // Counter.test.tsx may still exist when i18n is enabled but tests are off.
  await deleteFile(path.join(projectPath, 'src/features/counter/components/Counter.test.tsx'));

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
