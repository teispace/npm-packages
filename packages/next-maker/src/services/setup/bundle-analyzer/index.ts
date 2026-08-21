import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, readFile, updateJson, writeFile } from '../../../core/files';
import { installDevPackage } from '../../../core/package-manager';
import { ANALYZE_SCRIPT, hasBundleAnalyzer, injectBundleAnalyzer } from './transform';

export {
  ANALYZE_SCRIPT,
  hasBundleAnalyzer,
  injectBundleAnalyzer,
} from './transform';

export const setupBundleAnalyzer = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Adding @next/bundle-analyzer...');
  try {
    const nextConfigPath = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
    if (!fileExists(nextConfigPath)) {
      throw new Error(`${PROJECT_PATHS.NEXT_CONFIG} not found.`);
    }

    const content = await readFile(nextConfigPath);
    if (hasBundleAnalyzer(content)) {
      spinner.fail('@next/bundle-analyzer is already configured.');
      return;
    }

    // 1. Add the import + wrap the default export.
    await writeFile(nextConfigPath, injectBundleAnalyzer(content));

    // 2. Add the `analyze` script to package.json.
    await updateJson(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON), (pkg) => {
      pkg.scripts = pkg.scripts ?? {};
      if (!pkg.scripts.analyze) {
        pkg.scripts.analyze = ANALYZE_SCRIPT;
      }
      return pkg;
    });

    spinner.text = 'Installing @next/bundle-analyzer...';
    await installDevPackage(projectPath, '@next/bundle-analyzer');

    spinner.succeed(pc.green('@next/bundle-analyzer configured.'));
  } catch (error) {
    spinner.fail('Failed to add @next/bundle-analyzer.');
    throw error;
  }
};
