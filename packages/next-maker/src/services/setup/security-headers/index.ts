import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, readFile, writeFile } from '../../../core/files';
import { hasSecurityHeaders, injectSecurityHeaders } from './headers';

export { hasSecurityHeaders, injectSecurityHeaders, SECURITY_HEADERS } from './headers';

export const setupSecurityHeaders = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Adding security headers to next.config.ts...');
  try {
    const nextConfigPath = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
    if (!fileExists(nextConfigPath)) {
      throw new Error(`${PROJECT_PATHS.NEXT_CONFIG} not found.`);
    }

    const content = await readFile(nextConfigPath);
    if (hasSecurityHeaders(content)) {
      spinner.succeed('Security headers already configured.');
      return;
    }

    const updated = injectSecurityHeaders(content);
    await writeFile(nextConfigPath, updated);

    spinner.succeed(pc.green('Security headers added.'));
  } catch (error) {
    spinner.fail('Failed to add security headers.');
    throw error;
  }
};
