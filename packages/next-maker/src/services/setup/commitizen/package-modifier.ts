import { PACKAGES } from '../../../config/packages';

/**
 * Pure JSON modifier for Commitizen retrofit. Kept separate from the service
 * so it can be unit-tested with no filesystem.
 */

export interface PackageJsonShape {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  config?: Record<string, unknown> & {
    commitizen?: { path: string };
  };
  [key: string]: unknown;
}

export const addCommitizen = (pkg: PackageJsonShape): PackageJsonShape => {
  const scripts = { ...(pkg.scripts ?? {}) };
  const devDeps = { ...(pkg.devDependencies ?? {}) };

  if (!scripts.commit) {
    scripts.commit = 'cz';
  }
  if (!devDeps[PACKAGES.COMMITIZEN]) {
    devDeps[PACKAGES.COMMITIZEN] = '*';
  }
  if (!devDeps[PACKAGES.CZ_CONVENTIONAL_CHANGELOG]) {
    devDeps[PACKAGES.CZ_CONVENTIONAL_CHANGELOG] = '*';
  }

  return { ...pkg, scripts, devDependencies: devDeps };
};

export const missingCommitizenDeps = (pkg: PackageJsonShape): string[] => {
  const devDeps = pkg.devDependencies ?? {};
  const missing: string[] = [];
  if (!devDeps[PACKAGES.COMMITIZEN]) missing.push(PACKAGES.COMMITIZEN);
  if (!devDeps[PACKAGES.CZ_CONVENTIONAL_CHANGELOG])
    missing.push(PACKAGES.CZ_CONVENTIONAL_CHANGELOG);
  return missing;
};
