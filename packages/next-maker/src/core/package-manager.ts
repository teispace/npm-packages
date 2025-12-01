import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export const installDependencies = async (cwd: string, manager: PackageManager): Promise<void> => {
  const command = `${manager} install`;
  try {
    await execAsync(command, { cwd });
  } catch (error) {
    throw new Error(`Failed to install dependencies with ${manager}: ${error}`);
  }
};

export const runScript = async (
  cwd: string,
  manager: PackageManager,
  script: string,
): Promise<void> => {
  const command = `${manager} run ${script}`;
  try {
    await execAsync(command, { cwd });
  } catch (error) {
    // We don't want to fail the whole setup if linting fails, just warn
    console.warn(`Warning: Failed to run script '${script}': ${error}`);
  }
};

export const getPackageManager = (): PackageManager => {
  const userAgent = process.env.npm_config_user_agent;
  if (userAgent) {
    if (userAgent.startsWith('yarn')) return 'yarn';
    if (userAgent.startsWith('pnpm')) return 'pnpm';
    if (userAgent.startsWith('bun')) return 'bun';
  }
  return 'npm';
};
