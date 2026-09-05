import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PackageManager } from '../core/package-manager';
import { hasAnchors, stripAnchors, unwrapCall, unwrapJsx } from './anchors';
import { listFiles, matchFiles } from './glob';
import {
  type Answers,
  isFeatureOn,
  OVERLAYS_DIR,
  type PackageManagerSpec,
  type StarterManifest,
  type UnwrapCall,
  type UnwrapJsx,
  type Variant,
} from './manifest';
import { isCommandCarrier, rewritePackageManagerCommands, runCommand } from './package-manager';

export interface FeatureOverlay {
  name: string;
  /** Options the owning feature conditions on; removals from siblings on the same option do not touch its files. */
  options: string[];
}

export interface FeatureRemoval {
  feature: string;
  options: string[];
  patterns: string[];
}

export interface CompositionPlan {
  answers: Answers;
  packageManager: PackageManager;
  pmSpec: PackageManagerSpec;
  featuresOn: string[];
  featuresOff: string[];
  /** Applied before removals: they replace base files. */
  pmOverlays: string[];
  /** Applied after removals: they add or replace files for the chosen variants. */
  featureOverlays: FeatureOverlay[];
  /** Every pattern, for reporting; `always.remove` and package-manager removals first. */
  removePatterns: string[];
  /** Patterns that apply unconditionally (starter-only files, other package managers' files). */
  unconditionalRemovals: string[];
  /** Patterns owned by features, kept separate so overlay files can be exempted per option. */
  featureRemovals: FeatureRemoval[];
  anchorsOff: Set<string>;
  unwrapJsx: UnwrapJsx[];
  unwrapCall: UnwrapCall[];
  packages: string[];
  devPackages: string[];
  scripts: string[];
  env: string[];
  packageJsonKeys: string[];
}

const uniq = <T>(items: T[]): T[] => [...new Set(items)];

export const planComposition = (
  manifest: StarterManifest,
  answers: Answers,
  packageManager: PackageManager,
): CompositionPlan => {
  const pmSpec = manifest.packageManagers[packageManager];
  if (!pmSpec) {
    throw new Error(
      `This starter does not support ${packageManager}; valid: ${Object.keys(manifest.packageManagers).join(', ')}`,
    );
  }

  const featuresOn: string[] = [];
  const featuresOff: string[] = [];
  const active: Variant[] = [];
  const featureOverlays: FeatureOverlay[] = [];
  const featureRemovals: FeatureRemoval[] = [];
  for (const [id, feature] of Object.entries(manifest.features)) {
    const on = isFeatureOn(manifest, feature, answers);
    (on ? featuresOn : featuresOff).push(id);
    const variant = on ? feature.on : feature.off;
    if (!variant) continue;
    active.push(variant);
    const options = Object.keys(feature.when);
    if (variant.overlay && !featureOverlays.some((o) => o.name === variant.overlay)) {
      featureOverlays.push({ name: variant.overlay, options });
    }
    if (variant.remove?.length)
      featureRemovals.push({ feature: id, options, patterns: variant.remove });
  }
  const unconditionalRemovals = uniq([...manifest.always.remove, ...(pmSpec.remove ?? [])]);

  return {
    answers,
    packageManager,
    pmSpec,
    featuresOn,
    featuresOff,
    pmOverlays: pmSpec.overlay ? [pmSpec.overlay] : [],
    featureOverlays,
    removePatterns: uniq([...unconditionalRemovals, ...featureRemovals.flatMap((r) => r.patterns)]),
    unconditionalRemovals,
    featureRemovals,
    anchorsOff: new Set(active.flatMap((v) => v.anchors ?? [])),
    unwrapJsx: active.flatMap((v) => v.unwrapJsx ?? []),
    unwrapCall: active.flatMap((v) => v.unwrapCall ?? []),
    packages: uniq(active.flatMap((v) => v.packages ?? [])),
    devPackages: uniq(active.flatMap((v) => v.devPackages ?? [])),
    scripts: uniq(active.flatMap((v) => v.scripts ?? [])),
    env: uniq(active.flatMap((v) => v.env ?? [])),
    packageJsonKeys: uniq(active.flatMap((v) => v.packageJsonKeys ?? [])),
  };
};

export interface CompositionReport {
  removed: string[];
  overlaid: string[];
  anchored: string[];
  unwrapped: string[];
}

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.yml',
  '.yaml',
  '.md',
  '.sh',
  '.example',
  '.mdx',
]);

const isTextFile = (file: string): boolean =>
  TEXT_EXTENSIONS.has(path.extname(file)) || file.startsWith('.husky/') || file === 'Dockerfile';

const copyOverlay = async (
  overlaysRoot: string,
  projectPath: string,
  overlay: string,
): Promise<string[]> => {
  const source = path.join(overlaysRoot, overlay);
  const files = await listFiles(source, new Set());
  if (files.length === 0) {
    throw new Error(`Overlay "${overlay}" is missing or empty at ${OVERLAYS_DIR}/${overlay}`);
  }
  for (const file of files) {
    const target = path.join(projectPath, file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(source, file), target, { force: true });
  }
  return files;
};

/** Remove directories left empty by file deletions, bottom-up. Never removes `root`. */
export const pruneEmptyDirs = async (root: string, dir = root): Promise<void> => {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      await pruneEmptyDirs(root, path.join(dir, entry.name));
    }
  }
  if (dir !== root) {
    const remaining = await readdir(dir);
    if (remaining.length === 0) await rmdir(dir);
  }
};

const deleteKeyPath = (obj: Record<string, unknown>, keyPath: string): void => {
  const parts = keyPath.split('.');
  let cursor: Record<string, unknown> | undefined = obj;
  for (const part of parts.slice(0, -1)) {
    const next = cursor?.[part];
    if (typeof next !== 'object' || next === null) return;
    cursor = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (cursor && last in cursor) delete cursor[last];
  // Drop the parent when it became empty (e.g. `config: {}`).
  if (parts.length > 1) {
    const parentPath = parts.slice(0, -1).join('.');
    const parent = parts.slice(0, -1).reduce<unknown>((acc, p) => (acc as any)?.[p], obj);
    if (parent && typeof parent === 'object' && Object.keys(parent).length === 0) {
      deleteKeyPath(obj, parentPath);
    }
  }
};

const editPackageJson = async (
  projectPath: string,
  plan: CompositionPlan,
  manifest: StarterManifest,
) => {
  const file = path.join(projectPath, 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf-8'));

  for (const name of plan.packages) delete pkg.dependencies?.[name];
  for (const name of plan.devPackages) delete pkg.devDependencies?.[name];
  for (const name of plan.scripts) delete pkg.scripts?.[name];
  for (const key of plan.packageJsonKeys) deleteKeyPath(pkg, key);

  const validate = manifest.validateScript;
  if (validate && pkg.scripts?.[validate.name]) {
    const steps = validate.steps.filter((step) => pkg.scripts[step]);
    pkg.scripts[validate.name] = steps
      .map((step) => runCommand(plan.packageManager, step))
      .join(' && ');
  }
  if (pkg.scripts) {
    for (const [name, value] of Object.entries(pkg.scripts)) {
      if (typeof value === 'string') {
        pkg.scripts[name] = rewritePackageManagerCommands(value, plan.packageManager);
      }
    }
  }

  if (plan.pmSpec.packageManager) pkg.packageManager = plan.pmSpec.packageManager;
  else delete pkg.packageManager;
  if (pkg.engines) {
    for (const pm of Object.keys(manifest.packageManagers)) delete pkg.engines[pm];
    Object.assign(pkg.engines, plan.pmSpec.engines ?? {});
  }

  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
};

const editEnvExample = async (projectPath: string, keys: string[]) => {
  const file = path.join(projectPath, '.env.example');
  let content: string;
  try {
    content = await readFile(file, 'utf-8');
  } catch {
    return;
  }
  for (const key of keys) {
    content = content.replace(new RegExp(`^${key}=.*\\n?`, 'gm'), '');
  }
  await writeFile(file, content.replace(/\n{3,}/g, '\n\n'), 'utf-8');
};

/**
 * Apply a plan to a freshly cloned starter, in this order: package-manager
 * overlay, removals, feature overlays, anchors and unwraps, package.json and
 * env edits, package-manager command rewrites. Overlays copied by an earlier
 * phase are subject to every later phase, which is what lets an overlay file
 * carry anchors for other features.
 */
export const applyComposition = async (
  projectPath: string,
  manifest: StarterManifest,
  plan: CompositionPlan,
): Promise<CompositionReport> => {
  const report: CompositionReport = { removed: [], overlaid: [], anchored: [], unwrapped: [] };

  // Overlays live inside the clone under `.next-maker/`, which `always.remove`
  // deletes. Stage a copy first so feature overlays can be applied after the
  // removal phase (removals must not delete files an overlay just added).
  const overlaysSource = path.join(projectPath, OVERLAYS_DIR);
  const staging = await mkdtemp(path.join(tmpdir(), 'next-maker-overlays-'));
  try {
    if (await exists(overlaysSource)) await cp(overlaysSource, staging, { recursive: true });

    for (const overlay of plan.pmOverlays) {
      report.overlaid.push(...(await copyOverlay(staging, projectPath, overlay)));
    }

    const before = await listFiles(projectPath);
    const toRemove = new Set(plan.removePatterns.flatMap((pattern) => matchFiles(before, pattern)));
    for (const file of toRemove) {
      await rm(path.join(projectPath, file), { force: true });
      report.removed.push(file);
    }

    // Overlay files are subject to the same removals as base files (an
    // overlay that ships tests loses them when tests are off), except for
    // removals owned by a sibling of the overlay's own option: the Zustand
    // overlay replaces what the Redux removal deleted and must survive it.
    for (const overlay of plan.featureOverlays) {
      const added = await copyOverlay(staging, projectPath, overlay.name);
      const applicable = [
        ...plan.unconditionalRemovals,
        ...plan.featureRemovals
          .filter((r) => !r.options.some((o) => overlay.options.includes(o)))
          .flatMap((r) => r.patterns),
      ];
      const addedThenRemoved = new Set(applicable.flatMap((pattern) => matchFiles(added, pattern)));
      for (const file of addedThenRemoved) {
        await rm(path.join(projectPath, file), { force: true });
        report.removed.push(file);
      }
      report.overlaid.push(...added.filter((file) => !addedThenRemoved.has(file)));
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  await pruneEmptyDirs(projectPath);

  const files = await listFiles(projectPath);
  for (const file of files) {
    if (!isTextFile(file)) continue;
    const abs = path.join(projectPath, file);
    const content = await readFile(abs, 'utf-8');
    if (!hasAnchors(content)) continue;
    await writeFile(abs, stripAnchors(content, { off: plan.anchorsOff }), 'utf-8');
    report.anchored.push(file);
  }
  for (const { file, tag } of plan.unwrapJsx) {
    const abs = path.join(projectPath, file);
    if (!(await exists(abs))) continue;
    const content = await readFile(abs, 'utf-8');
    const next = unwrapJsx(content, tag);
    if (next !== content) {
      await writeFile(abs, next, 'utf-8');
      report.unwrapped.push(`${file}:<${tag}>`);
    }
  }
  for (const { file, name } of plan.unwrapCall) {
    const abs = path.join(projectPath, file);
    if (!(await exists(abs))) continue;
    const content = await readFile(abs, 'utf-8');
    const next = unwrapCall(content, name);
    if (next !== content) {
      await writeFile(abs, next, 'utf-8');
      report.unwrapped.push(`${file}:${name}()`);
    }
  }

  await editPackageJson(projectPath, plan, manifest);
  await editEnvExample(projectPath, plan.env);

  if (plan.packageManager !== 'pnpm') {
    for (const file of await listFiles(projectPath)) {
      if (!isCommandCarrier(file) || file === 'package.json') continue;
      const abs = path.join(projectPath, file);
      const content = await readFile(abs, 'utf-8');
      const next = rewritePackageManagerCommands(content, plan.packageManager);
      if (next !== content) await writeFile(abs, next, 'utf-8');
    }
  }

  return report;
};

const exists = async (file: string): Promise<boolean> => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};
