import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Run a package-manager command with argv passed as an array (no shell). Like
 * `git.ts`, this is the security-critical detail: package names flow in from
 * generators/manifests, and a name containing shell metacharacters would, under
 * a string `exec`, be interpreted by the shell. `execFile` never spawns a shell,
 * so every argument is inert data.
 */
const run = (bin: string, args: string[], cwd: string) => execFileAsync(bin, args, { cwd });

export const installDependencies = async (cwd: string, manager: PackageManager): Promise<void> => {
  try {
    await run(manager, ['install'], cwd);
  } catch (error) {
    throw new Error(`Failed to install dependencies with ${manager}: ${error}`, { cause: error });
  }
};

export const runScript = async (
  cwd: string,
  manager: PackageManager,
  script: string,
): Promise<void> => {
  // npm requires the 'run' keyword, but yarn/pnpm/bun don't.
  const args = manager === 'npm' ? ['run', script] : [script];
  try {
    await run(manager, args, cwd);
  } catch (error) {
    // We don't want to fail the whole setup if linting fails, just warn.
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

  try {
    await run(manager, [...getInstallArgs(manager), ...packages], cwd);
  } catch (error) {
    throw new Error(`Failed to install packages with ${manager}: ${error}`, { cause: error });
  }
};

/** The subcommand argv that adds a dependency, per manager. */
const getInstallArgs = (manager: PackageManager): string[] => {
  switch (manager) {
    case 'npm':
      return ['install'];
    case 'yarn':
      return ['add'];
    case 'pnpm':
      return ['add'];
    case 'bun':
      return ['add'];
    default:
      return ['install'];
  }
};

export const installPackage = async (cwd: string, packageName: string): Promise<void> => {
  const manager = await detectPackageManager(cwd);
  await installPackages(cwd, manager, [packageName]);
};

const getDevFlag = (manager: PackageManager): string => {
  switch (manager) {
    case 'npm':
      return '--save-dev';
    case 'yarn':
    case 'pnpm':
    case 'bun':
      return '-D';
    default:
      return '--save-dev';
  }
};

export const installDevPackages = async (
  cwd: string,
  manager: PackageManager,
  packages: string[],
): Promise<void> => {
  if (packages.length === 0) return;
  try {
    await run(manager, [...getInstallArgs(manager), getDevFlag(manager), ...packages], cwd);
  } catch (error) {
    throw new Error(`Failed to install dev packages with ${manager}: ${error}`, { cause: error });
  }
};

export const installDevPackage = async (cwd: string, packageName: string): Promise<void> => {
  const manager = await detectPackageManager(cwd);
  await installDevPackages(cwd, manager, [packageName]);
};

export const uninstallPackages = async (
  cwd: string,
  manager: PackageManager,
  packages: string[],
): Promise<void> => {
  if (packages.length === 0) return;

  try {
    await run(manager, [...getUninstallArgs(manager), ...packages], cwd);
  } catch (error) {
    throw new Error(`Failed to uninstall packages with ${manager}: ${error}`, { cause: error });
  }
};

/** The subcommand argv that removes a dependency, per manager. */
const getUninstallArgs = (manager: PackageManager): string[] => {
  switch (manager) {
    case 'npm':
      return ['uninstall'];
    case 'yarn':
      return ['remove'];
    case 'pnpm':
      return ['remove'];
    case 'bun':
      return ['remove'];
    default:
      return ['uninstall'];
  }
};

export const uninstallPackage = async (cwd: string, packageName: string): Promise<void> => {
  const manager = await detectPackageManager(cwd);
  await uninstallPackages(cwd, manager, [packageName]);
};
