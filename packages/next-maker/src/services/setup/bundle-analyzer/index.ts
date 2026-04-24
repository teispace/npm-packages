import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, readFile, updateJson, writeFile } from '../../../core/files';
import { installDevPackage } from '../../../core/package-manager';

export const setupBundleAnalyzer = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Adding @next/bundle-analyzer...');
  try {
    const nextConfigPath = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
    if (!fileExists(nextConfigPath)) {
      throw new Error(`${PROJECT_PATHS.NEXT_CONFIG} not found.`);
    }

    let content = await readFile(nextConfigPath);
    if (content.includes('@next/bundle-analyzer')) {
      spinner.fail('@next/bundle-analyzer is already configured.');
      return;
    }

    // 1. Add import at the top.
    content = `import withBundleAnalyzer from '@next/bundle-analyzer';\n${content}`;

    // 2. Insert the `const bundleAnalyzer = withBundleAnalyzer(...)` declaration
    //    just before `export default ...`.
    const exportDefaultRe = /export default (.*?);/;
    const match = content.match(exportDefaultRe);
    if (!match) {
      throw new Error('Could not locate `export default` in next.config.ts.');
    }
    const existingExport = match[1];
    const replacement = `const bundleAnalyzer = withBundleAnalyzer({\n  enabled: process.env.ANALYZE === 'true',\n});\n\nexport default bundleAnalyzer(${existingExport});`;
    content = content.replace(exportDefaultRe, replacement);
    await writeFile(nextConfigPath, content);

    // 3. Add the `analyze` script to package.json.
    await updateJson(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON), (pkg) => {
      pkg.scripts = pkg.scripts ?? {};
      if (!pkg.scripts.analyze) {
        pkg.scripts.analyze = 'ANALYZE=true next build';
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
