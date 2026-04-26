import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists, readFile, writeFile } from '../core/files';
import { detectPackageManager, uninstallPackages } from '../core/package-manager';
import type {
  FeatureCheckResult,
  FeatureFinding,
  FeatureManifest,
  PackageRequirement,
} from './types';

interface PackageJsonShape {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

const readPackageJson = async (projectPath: string): Promise<PackageJsonShape | null> => {
  const pkgPath = path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON);
  if (!fileExists(pkgPath)) return null;
  return JSON.parse(await readFile(pkgPath));
};

const writePackageJson = async (projectPath: string, pkg: PackageJsonShape): Promise<void> => {
  const pkgPath = path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON);
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
};

const depsFor = (pkg: PackageJsonShape, kind: PackageRequirement['kind']): Record<string, string> =>
  (kind === 'dependency' ? pkg.dependencies : pkg.devDependencies) ?? {};

/**
 * Compute drift: walk every piece of the manifest's footprint and report
 * what's missing or mismatched. Returns an empty array when the feature is
 * present and complete.
 */
export const checkManifest = async (
  manifest: FeatureManifest,
  projectPath: string,
): Promise<FeatureCheckResult> => {
  const installed = await manifest.detect(projectPath);
  const drift: FeatureFinding[] = [];

  if (!installed) {
    return { manifest, installed: false, drift: [] };
  }

  for (const file of manifest.files) {
    const required = file.required !== false;
    if (!required) continue;
    if (!fileExists(path.join(projectPath, file.path))) {
      drift.push({ kind: 'missingFile', file: file.path });
    }
  }

  const pkg = await readPackageJson(projectPath);
  if (pkg) {
    for (const dep of manifest.packages) {
      const map = depsFor(pkg, dep.kind);
      if (!map[dep.name]) {
        drift.push({ kind: 'missingPackage', name: dep.name, depKind: dep.kind });
      }
    }

    const scripts = pkg.scripts ?? {};
    for (const script of manifest.scripts) {
      const actual = scripts[script.name];
      if (!actual) {
        drift.push({ kind: 'missingScript', name: script.name });
      } else if (script.expectedValue && actual !== script.expectedValue) {
        drift.push({
          kind: 'mismatchedScript',
          name: script.name,
          expected: script.expectedValue,
          actual,
        });
      }
    }
  }

  for (const injection of manifest.injections) {
    const filePath = path.join(projectPath, injection.file);
    if (!fileExists(filePath)) {
      drift.push({
        kind: 'missingInjection',
        file: injection.file,
        description: injection.description,
      });
      continue;
    }
    const content = await readFile(filePath);
    if (!injection.presence.test(content)) {
      drift.push({
        kind: 'missingInjection',
        file: injection.file,
        description: injection.description,
      });
    }
  }

  return { manifest, installed, drift };
};

export interface RemoveSummary {
  filesRemoved: string[];
  packagesUninstalled: string[];
  scriptsRemoved: string[];
  blocksStripped: Array<{ file: string; description: string }>;
  /** Manual-cleanup items the runner couldn't safely remove. */
  manualCleanup: Array<{ file: string; description: string }>;
}

/**
 * Generic reverse: walk the footprint and undo what we can confidently undo.
 *
 * - Files marked `generated: true` are deleted.
 * - Files marked `generated: false` are left alone (user-owned).
 * - Packages are uninstalled.
 * - Scripts are removed from package.json.
 * - Code blocks with a `removePattern` are stripped; without one, they end
 *   up in `manualCleanup` so the caller can prompt the user.
 *
 * The `dryRun` flag computes the summary without touching anything.
 */
export const reverseManifest = async (
  manifest: FeatureManifest,
  projectPath: string,
  options: { dryRun?: boolean } = {},
): Promise<RemoveSummary> => {
  const dryRun = options.dryRun ?? false;
  const summary: RemoveSummary = {
    filesRemoved: [],
    packagesUninstalled: [],
    scriptsRemoved: [],
    blocksStripped: [],
    manualCleanup: [],
  };

  // 1. Strip code blocks first — they reference files/packages we may delete next.
  for (const injection of manifest.injections) {
    const filePath = path.join(projectPath, injection.file);
    if (!fileExists(filePath)) continue;
    if (!injection.removePattern) {
      summary.manualCleanup.push({ file: injection.file, description: injection.description });
      continue;
    }
    const content = await readFile(filePath);
    if (!injection.presence.test(content)) continue;
    const stripped = content.replace(injection.removePattern, '');
    if (stripped !== content) {
      if (!dryRun) await writeFile(filePath, stripped);
      summary.blocksStripped.push({ file: injection.file, description: injection.description });
    } else {
      summary.manualCleanup.push({ file: injection.file, description: injection.description });
    }
  }

  // 2. Remove files we generated.
  const { rm } = await import('node:fs/promises');
  for (const file of manifest.files) {
    if (!file.generated) continue;
    const target = path.join(projectPath, file.path);
    if (!fileExists(target)) continue;
    if (!dryRun) {
      await rm(target, { recursive: true, force: true });
    }
    summary.filesRemoved.push(file.path);
  }

  // 3. Update package.json: scripts + deps.
  const pkg = await readPackageJson(projectPath);
  if (pkg) {
    let touched = false;
    if (pkg.scripts) {
      for (const script of manifest.scripts) {
        if (pkg.scripts[script.name]) {
          if (!dryRun) delete pkg.scripts[script.name];
          summary.scriptsRemoved.push(script.name);
          touched = true;
        }
      }
    }

    for (const dep of manifest.packages) {
      const map = depsFor(pkg, dep.kind);
      if (map[dep.name]) {
        summary.packagesUninstalled.push(dep.name);
      }
    }

    if (touched && !dryRun) {
      await writePackageJson(projectPath, pkg);
    }
  }

  // 4. Run the package manager uninstall (skipped on dry-run).
  if (!dryRun && summary.packagesUninstalled.length > 0) {
    const manager = await detectPackageManager(projectPath);
    await uninstallPackages(projectPath, manager, summary.packagesUninstalled);
  }

  return summary;
};
