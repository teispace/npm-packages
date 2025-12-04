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
  // npm requires 'run' keyword, but yarn/pnpm/bun don't
  const command = manager === 'npm' ? `${manager} run ${script}` : `${manager} ${script}`;
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

export const detectPackageManager = async (cwd: string): Promise<PackageManager> => {
  const { existsSync } = await import('node:fs');
  const path = await import('node:path');

  // Check for lock files
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  if (existsSync(path.join(cwd, 'package-lock.json'))) return 'npm';

  // Fallback to environment variable
  return getPackageManager();
};

export const installPackages = async (
  cwd: string,
  manager: PackageManager,
  packages: string[],
): Promise<void> => {
  if (packages.length === 0) return;

  const installCommand = getInstallCommand(manager);
  const command = `${installCommand} ${packages.join(' ')}`;

  try {
    await execAsync(command, { cwd });
  } catch (error) {
    throw new Error(`Failed to install packages with ${manager}: ${error}`);
  }
};

const getInstallCommand = (manager: PackageManager): string => {
  switch (manager) {
    case 'npm':
      return 'npm install';
    case 'yarn':
      return 'yarn add';
    case 'pnpm':
      return 'pnpm add';
    case 'bun':
      return 'bun add';
    default:
      return 'npm install';
  }
};

export const installPackage = async (cwd: string, packageName: string): Promise<void> => {
  const manager = await detectPackageManager(cwd);
  await installPackages(cwd, manager, [packageName]);
};

export const uninstallPackages = async (
  cwd: string,
  manager: PackageManager,
  packages: string[],
): Promise<void> => {
  if (packages.length === 0) return;

  const uninstallCommand = getUninstallCommand(manager);
  const command = `${uninstallCommand} ${packages.join(' ')}`;

  try {
    await execAsync(command, { cwd });
  } catch (error) {
    throw new Error(`Failed to uninstall packages with ${manager}: ${error}`);
  }
};

const getUninstallCommand = (manager: PackageManager): string => {
  switch (manager) {
    case 'npm':
      return 'npm uninstall';
    case 'yarn':
      return 'yarn remove';
    case 'pnpm':
      return 'pnpm remove';
    case 'bun':
      return 'bun remove';
    default:
      return 'npm uninstall';
  }
};

export const uninstallPackage = async (cwd: string, packageName: string): Promise<void> => {
  const manager = await detectPackageManager(cwd);
  await uninstallPackages(cwd, manager, [packageName]);
};
