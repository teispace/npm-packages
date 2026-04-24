import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, readFile, writeFile } from '../../../core/files';
import { installDevPackage } from '../../../core/package-manager';

export const setupReactCompiler = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Enabling React Compiler...');
  try {
    const nextConfigPath = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
    if (!fileExists(nextConfigPath)) {
      throw new Error(`${PROJECT_PATHS.NEXT_CONFIG} not found.`);
    }

    let content = await readFile(nextConfigPath);
    if (content.includes('reactCompiler:')) {
      spinner.fail('React Compiler is already configured in next.config.ts.');
      return;
    }

    // Inject `reactCompiler: true` inside `const nextConfig: NextConfig = { ... };`
    const configBlock = /(const\s+nextConfig\s*:\s*NextConfig\s*=\s*\{)/;
    if (!configBlock.test(content)) {
      throw new Error('Could not locate `const nextConfig: NextConfig = {` in next.config.ts.');
    }
    content = content.replace(configBlock, '$1\n  reactCompiler: true,');
    await writeFile(nextConfigPath, content);

    spinner.text = 'Installing babel-plugin-react-compiler...';
    await installDevPackage(projectPath, 'babel-plugin-react-compiler');

    spinner.succeed(pc.green('React Compiler enabled.'));
  } catch (error) {
    spinner.fail('Failed to enable React Compiler.');
    throw error;
  }
};
