/**
 * Shared primitives for the `doctor --fix` repair paths.
 *
 * Every setup service opens with a first-run guard ("i18n is already set up",
 * "vitest.config.ts exists", …) that overlaps the manifest's `detect()`. That
 * guard is correct for `setup`, but fatal for a repair: doctor only computes
 * drift for features that ARE installed, so the guard would always fire and
 * `--fix` would do nothing. The repair paths therefore bypass the guards and
 * work straight off the computed `FeatureFinding[]` — repairing only what was
 * actually reported missing, which also makes them naturally idempotent.
 *
 * These helpers cover the parts of a footprint that are pure data (packages,
 * scripts). Files and code blocks need feature-specific knowledge, so each
 * service supplies its own restorer.
 */

import path from 'node:path';
import { PROJECT_PATHS } from '../../config/paths';
import { cloneStarter } from '../../config/starter';
import { deleteDirectory, fileExists, updateJson } from '../../core/files';
import {
  detectPackageManager,
  installDevPackages,
  installPackages,
} from '../../core/package-manager';
import type { DepKind, FeatureFinding } from '../../manifests/types';

/** Package names the drift reports as absent from package.json, by dep kind. */
export const missingPackageNames = (drift: FeatureFinding[], kind: DepKind): string[] =>
  drift
    .filter((f) => f.kind === 'missingPackage' && f.depKind === kind)
    .map((f) => (f as Extract<FeatureFinding, { kind: 'missingPackage' }>).name);

/** Relative paths the drift reports as missing files. */
export const missingFilePaths = (drift: FeatureFinding[]): string[] =>
  drift.filter((f) => f.kind === 'missingFile').map((f) => f.file);

/** True when `relativePath` (or any path under it) is reported missing. */
export const isFileMissing = (drift: FeatureFinding[], relativePath: string): boolean =>
  missingFilePaths(drift).some((p) => p === relativePath || p.startsWith(`${relativePath}/`));

/** Files the drift reports as missing a code block. */
export const missingInjectionFiles = (drift: FeatureFinding[]): string[] =>
  drift.filter((f) => f.kind === 'missingInjection').map((f) => f.file);

/** True when any code block is reported missing (optionally, in one file). */
export const hasMissingInjection = (drift: FeatureFinding[], file?: string): boolean =>
  drift.some((f) => f.kind === 'missingInjection' && (file === undefined || f.file === file));

/**
 * Install every package the drift reports as missing from package.json.
 * Returns the names it installed (empty when there was nothing to do).
 */
export const repairPackages = async (
  projectPath: string,
  drift: FeatureFinding[],
): Promise<string[]> => {
  const deps = missingPackageNames(drift, 'dependency');
  const devDeps = missingPackageNames(drift, 'devDependency');
  if (deps.length === 0 && devDeps.length === 0) return [];

  const manager = await detectPackageManager(projectPath);
  if (deps.length > 0) await installPackages(projectPath, manager, deps);
  if (devDeps.length > 0) await installDevPackages(projectPath, manager, devDeps);
  return [...deps, ...devDeps];
};

/**
 * Restore package.json scripts the drift reports as missing or mismatched.
 *
 * A `missingScript` finding without an `expected` value can't be repaired —
 * the manifest never declared what the script should contain — so it is left
 * alone and doctor's post-fix re-check will honestly still report it.
 *
 * A `mismatchedScript` IS reset to the manifest's expected value: the whole
 * point of declaring `expectedValue` is that the CLI owns that script.
 */
export const repairScripts = async (
  projectPath: string,
  drift: FeatureFinding[],
): Promise<string[]> => {
  const restore = new Map<string, string>();
  for (const finding of drift) {
    if (finding.kind === 'missingScript' && finding.expected) {
      restore.set(finding.name, finding.expected);
    } else if (finding.kind === 'mismatchedScript') {
      restore.set(finding.name, finding.expected);
    }
  }
  if (restore.size === 0) return [];

  const pkgPath = path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON);
  if (!fileExists(pkgPath)) return [];

  await updateJson<{ scripts?: Record<string, string> }>(pkgPath, (pkg) => {
    const scripts = { ...(pkg.scripts ?? {}) };
    for (const [name, value] of restore) {
      scripts[name] = value;
    }
    return { ...pkg, scripts };
  });

  return [...restore.keys()];
};

/**
 * Clone the starter into a scratch directory, hand it to `run`, then always
 * clean up. Repairs use this to re-copy individual files that went missing
 * without re-running a service's full install flow.
 */
export const withStarterAssets = async <T>(
  tempDir: string,
  run: (tempDir: string) => Promise<T>,
): Promise<T> => {
  await cloneStarter(tempDir);
  try {
    return await run(tempDir);
  } finally {
    await deleteDirectory(tempDir);
  }
};
