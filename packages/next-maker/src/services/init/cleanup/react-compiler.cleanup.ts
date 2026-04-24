import path from 'node:path';
import { PACKAGES } from '../../../config/packages';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists, readFile, updateJson, writeFile } from '../../../core/files';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

export const cleanupReactCompiler = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  if (answers.reactCompiler) return;

  const nextConfigPath = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
  if (fileExists(nextConfigPath)) {
    let content = await readFile(nextConfigPath);
    content = content.replace(/^\s*reactCompiler:\s*true,?\n/m, '');
    await writeFile(nextConfigPath, content);
  }

  await updateJson(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON), (pkg) => {
    if (pkg.devDependencies) {
      delete pkg.devDependencies[PACKAGES.REACT_COMPILER_BABEL];
    }
    return pkg;
  });
};
