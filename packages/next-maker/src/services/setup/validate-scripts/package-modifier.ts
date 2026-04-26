import type { PackageManager } from '../../../core/package-manager';

/**
 * Pure modifiers for the package.json `scripts` block — separated from the
 * service so they can be unit-tested without touching the filesystem.
 */

export interface PackageJsonShape {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

const SCRIPT_RUNNER_PREFIX: Record<PackageManager, string> = {
  npm: 'npm run',
  yarn: 'yarn',
  pnpm: 'pnpm',
  bun: 'bun run',
};

const buildValidateChain = (manager: PackageManager): string => {
  const prefix = SCRIPT_RUNNER_PREFIX[manager];
  return ['ci:check', 'type-check', 'check:deprecated', 'test', 'build']
    .map((name) => `${prefix} ${name}`)
    .join(' && ');
};

/**
 * Add the validation scripts (env:sync, check:deprecated, validate) and the
 * matching tsx/typescript dev-deps, never overwriting a user-defined entry.
 *
 * Returns a *new* package.json object — callers pass it through `updateJson`
 * which already understands "function returns the new value".
 */
export const addValidationScripts = (
  pkg: PackageJsonShape,
  manager: PackageManager,
): PackageJsonShape => {
  const scripts = { ...(pkg.scripts ?? {}) };
  const devDeps = { ...(pkg.devDependencies ?? {}) };

  if (!scripts['env:sync']) {
    scripts['env:sync'] = 'tsx scripts/sync-env.ts';
  }
  if (!scripts['check:deprecated']) {
    scripts['check:deprecated'] = 'tsx scripts/check-deprecated.ts';
  }
  if (!scripts['type-check']) {
    scripts['type-check'] = 'tsc --noEmit';
  }
  if (!scripts.validate) {
    scripts.validate = buildValidateChain(manager);
  }

  if (!devDeps.tsx && !pkg.dependencies?.hasOwnProperty('tsx')) {
    devDeps.tsx = '*';
  }

  return { ...pkg, scripts, devDependencies: devDeps };
};
