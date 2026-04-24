import path from 'node:path';
import { PACKAGES } from '../../../config/packages';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists, readFile, updateJson, writeFile } from '../../../core/files';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

export const cleanupBundleAnalyzer = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  if (answers.bundleAnalyzer) return;

  const nextConfigPath = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
  if (fileExists(nextConfigPath)) {
    let content = await readFile(nextConfigPath);
    content = content.replace(
      /import\s+withBundleAnalyzer\s+from\s+'@next\/bundle-analyzer';\n/,
      '',
    );
    content = content.replace(
      /const\s+bundleAnalyzer\s*=\s*withBundleAnalyzer\(\{[\s\S]*?\}\);\n+/,
      '',
    );
    // Unwrap any `bundleAnalyzer(...)` call inside `export default`.
    content = content.replace(/bundleAnalyzer\(([^)]*)\)/, '$1');
    await writeFile(nextConfigPath, content);
  }

  await updateJson(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON), (pkg) => {
    if (pkg.devDependencies) {
      delete pkg.devDependencies[PACKAGES.NEXT_BUNDLE_ANALYZER];
    }
    if (pkg.scripts) {
      delete pkg.scripts.analyze;
    }
    return pkg;
  });
};
