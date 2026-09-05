import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cloneStarter, resolveStarterSource, type StarterSource } from '../config/starter';
import { fileExists } from '../core/files';
import type { PackageManager } from '../core/package-manager';
import { hasAnchors, unwrapCall, unwrapJsx } from './anchors';
import { listFiles, matchFiles } from './glob';
import {
  type Answers,
  type Feature,
  isFeatureOn,
  loadStarterManifest,
  OVERLAYS_DIR,
  type StarterManifest,
  type Variant,
} from './manifest';

/** Written into every generated project so later commands know what was chosen. */
export const PROJECT_RECORD_FILE = '.next-maker.json';

export interface ProjectRecord {
  cli: string;
  starter: { name: string; version: string; source: string };
  packageManager: PackageManager;
  answers: Answers;
  /** Identity fields used to compose reference trees for `setup` and `upgrade`. */
  identity?: {
    projectName: string;
    description: string;
    author: string;
    version: string;
    email: string;
    gitRemote: string;
    readme: boolean;
  };
}

export const writeProjectRecord = async (
  projectPath: string,
  record: ProjectRecord,
): Promise<void> => {
  await writeFile(
    path.join(projectPath, PROJECT_RECORD_FILE),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf-8',
  );
};

export const readProjectRecord = async (projectPath: string): Promise<ProjectRecord> => {
  const file = path.join(projectPath, PROJECT_RECORD_FILE);
  if (!fileExists(file)) {
    throw new Error(
      `No ${PROJECT_RECORD_FILE} in ${projectPath}. Only projects created with next-maker 5+ can be reconfigured; run \`next-maker init\` for a new project.`,
    );
  }
  return JSON.parse(await readFile(file, 'utf-8')) as ProjectRecord;
};

export interface StarterCheckout {
  dir: string;
  source: StarterSource;
  manifest: StarterManifest;
  files: string[];
  dispose: () => Promise<void>;
}

/**
 * A pristine copy of the starter this project was generated from: a local
 * path recorded at init when it still exists, otherwise the tag this CLI
 * is pinned to.
 */
export const checkoutStarter = async (
  record: ProjectRecord,
  options: { starterPath?: string } = {},
): Promise<StarterCheckout> => {
  const recordedLocal =
    record.starter.source.startsWith('/') && fileExists(record.starter.source)
      ? record.starter.source
      : undefined;
  const source = resolveStarterSource({ starterPath: options.starterPath ?? recordedLocal });
  const dir = await mkdtemp(path.join(tmpdir(), 'next-maker-starter-'));
  await cloneStarter(dir, { source });
  const manifest = await loadStarterManifest(dir);
  const files = await listFiles(dir);
  return { dir, source, manifest, files, dispose: () => rm(dir, { recursive: true, force: true }) };
};

export interface AnchoredSnippet {
  file: string;
  lines: string[];
}

export interface FeatureFootprint {
  id: string;
  feature: Feature;
  /** Files the feature owns, as they exist in the pristine starter. */
  files: string[];
  /** Overlay files the feature's `on` variant contributes, relative to the project. */
  overlayFiles: string[];
  packages: string[];
  devPackages: string[];
  scripts: string[];
  env: string[];
  /** Code in shared files that the starter marks with this feature's anchors. */
  snippets: AnchoredSnippet[];
}

const variantOf = (feature: Feature, key: 'on' | 'off'): Variant => feature[key] ?? {};

const anchorIdsOf = (feature: Feature): string[] => [
  ...(feature.off?.anchors ?? []),
  ...(feature.on?.anchors ?? []),
];

const snippetsFor = async (
  checkout: StarterCheckout,
  ids: string[],
): Promise<AnchoredSnippet[]> => {
  if (ids.length === 0) return [];
  const out: AnchoredSnippet[] = [];
  const re = new RegExp(
    `@next-maker:(?:${ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?::(start|end))?`,
  );
  for (const file of checkout.files) {
    if (file.startsWith('.next-maker/')) continue;
    let content: string;
    try {
      content = await readFile(path.join(checkout.dir, file), 'utf-8');
    } catch {
      continue;
    }
    if (!hasAnchors(content)) continue;
    const lines = content.split('\n');
    const picked: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      if (m[1] === 'start') {
        let j = i + 1;
        while (j < lines.length && !/@next-maker:[\w-]+:end/.test(lines[j]))
          picked.push(lines[j++]);
        i = j;
      } else if (m[1] === 'end') {
      } else if (/^\s*(\{\s*\/\*|\/\*|\/\/|#)/.test(lines[i])) {
        if (lines[i + 1] !== undefined) picked.push(lines[++i]);
      } else {
        picked.push(lines[i].replace(/\s*(\{\s*\/\*|\/\*|\/\/|#).*$/, ''));
      }
    }
    if (picked.length) out.push({ file, lines: picked });
  }
  return out;
};

/** What a feature contributes, computed from the pristine starter. */
export const featureFootprint = async (
  checkout: StarterCheckout,
  id: string,
): Promise<FeatureFootprint> => {
  const feature = checkout.manifest.features[id];
  if (!feature) {
    throw new Error(
      `Unknown feature "${id}". Valid: ${Object.keys(checkout.manifest.features).join(', ')}.`,
    );
  }
  const off = variantOf(feature, 'off');
  const on = variantOf(feature, 'on');
  const always = new Set(
    checkout.manifest.always.remove.flatMap((p) => matchFiles(checkout.files, p)),
  );
  const files = [...new Set((off.remove ?? []).flatMap((p) => matchFiles(checkout.files, p)))]
    .filter((f) => !always.has(f))
    .sort();
  const overlayFiles = on.overlay
    ? (await listFiles(path.join(checkout.dir, OVERLAYS_DIR, on.overlay), new Set())).sort()
    : [];
  return {
    id,
    feature,
    files,
    overlayFiles,
    packages: off.packages ?? [],
    devPackages: off.devPackages ?? [],
    scripts: off.scripts ?? [],
    env: off.env ?? [],
    snippets: await snippetsFor(checkout, anchorIdsOf(feature)),
  };
};

export type Finding =
  | { kind: 'missingFile'; file: string }
  | { kind: 'missingPackage'; name: string; dev: boolean }
  | { kind: 'missingScript'; name: string };

export interface FeatureCheck {
  id: string;
  on: boolean;
  drift: Finding[];
}

const isTestFile = (file: string): boolean =>
  /\.(test|spec)\.tsx?$/.test(file) || file.startsWith('test/') || file.includes('__test-utils__');

/** Compare the project against the footprint of every feature its record says is on. */
export const checkProject = async (
  projectPath: string,
  record: ProjectRecord,
  checkout: StarterCheckout,
): Promise<FeatureCheck[]> => {
  const pkg = JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf-8'));
  const testsOn = record.answers.tests !== false;
  const results: FeatureCheck[] = [];
  // Files owned by a feature that is off are not expected, even when another
  // (on) feature's globs also match them, e.g. the tests feature owns every
  // `*.test.ts` but the WebSocket tests leave with the WebSocket feature.
  const offPatterns = Object.values(checkout.manifest.features)
    .filter((f) => !isFeatureOn(checkout.manifest, f, record.answers))
    .flatMap((f) => f.off?.remove ?? []);
  const ownedByOffFeature = new Set(offPatterns.flatMap((p) => matchFiles(checkout.files, p)));
  for (const [id, feature] of Object.entries(checkout.manifest.features)) {
    const on = isFeatureOn(checkout.manifest, feature, record.answers);
    if (!on) {
      results.push({ id, on, drift: [] });
      continue;
    }
    const footprint = await featureFootprint(checkout, id);
    const drift: Finding[] = [];
    for (const file of [...footprint.files, ...footprint.overlayFiles]) {
      if (!testsOn && isTestFile(file)) continue;
      if (ownedByOffFeature.has(file)) continue;
      if (!fileExists(path.join(projectPath, file))) drift.push({ kind: 'missingFile', file });
    }
    for (const name of footprint.packages) {
      if (!pkg.dependencies?.[name]) drift.push({ kind: 'missingPackage', name, dev: false });
    }
    for (const name of footprint.devPackages) {
      if (!pkg.devDependencies?.[name]) drift.push({ kind: 'missingPackage', name, dev: true });
    }
    for (const name of footprint.scripts) {
      if (!pkg.scripts?.[name]) drift.push({ kind: 'missingScript', name });
    }
    results.push({ id, on, drift });
  }
  return results;
};

export interface ReconfigurePlan {
  before: Answers;
  after: Answers;
  turningOn: FeatureFootprint[];
  turningOff: FeatureFootprint[];
  /** Files copied from the starter (new features and their overlays). */
  copy: string[];
  /** Files deleted (features turned off). */
  remove: string[];
  addPackages: Record<string, string>;
  addDevPackages: Record<string, string>;
  removePackages: string[];
  addScripts: Record<string, string>;
  removeScripts: string[];
  unwrapJsx: { file: string; tag: string }[];
  unwrapCall: { file: string; name: string }[];
  /** Anchored code the user must add (on) or delete (off) by hand. */
  manual: { feature: string; direction: 'add' | 'delete'; snippets: AnchoredSnippet[] }[];
}

/**
 * The delta between two answer sets. Anchored code cannot be re-injected
 * into a generated project (its anchors were stripped at init), so those
 * edits are reported as manual steps with the exact lines from the starter.
 */
export const planReconfigure = async (
  projectPath: string,
  record: ProjectRecord,
  checkout: StarterCheckout,
  after: Answers,
): Promise<ReconfigurePlan> => {
  const before = record.answers;
  const starterPkg = JSON.parse(await readFile(path.join(checkout.dir, 'package.json'), 'utf-8'));
  const turningOn: FeatureFootprint[] = [];
  const turningOff: FeatureFootprint[] = [];
  for (const [id, feature] of Object.entries(checkout.manifest.features)) {
    const was = isFeatureOn(checkout.manifest, feature, before);
    const will = isFeatureOn(checkout.manifest, feature, after);
    if (was === will) continue;
    (will ? turningOn : turningOff).push(await featureFootprint(checkout, id));
  }
  const testsOn = after.tests !== false;
  const plan: ReconfigurePlan = {
    before,
    after,
    turningOn,
    turningOff,
    copy: [],
    remove: [],
    addPackages: {},
    addDevPackages: {},
    removePackages: [],
    addScripts: {},
    removeScripts: [],
    unwrapJsx: [],
    unwrapCall: [],
    manual: [],
  };
  for (const f of turningOff) {
    for (const file of [...f.files, ...f.overlayFiles]) {
      if (fileExists(path.join(projectPath, file))) plan.remove.push(file);
    }
    plan.removePackages.push(...f.packages, ...f.devPackages);
    plan.removeScripts.push(...f.scripts);
    plan.unwrapJsx.push(...(f.feature.off?.unwrapJsx ?? []));
    plan.unwrapCall.push(...(f.feature.off?.unwrapCall ?? []));
    if (f.snippets.length)
      plan.manual.push({ feature: f.id, direction: 'delete', snippets: f.snippets });
  }
  for (const f of turningOn) {
    for (const file of [...f.files, ...f.overlayFiles]) {
      if (!testsOn && isTestFile(file)) continue;
      if (!fileExists(path.join(projectPath, file)) || f.overlayFiles.includes(file))
        plan.copy.push(file);
    }
    for (const name of f.packages)
      plan.addPackages[name] = starterPkg.dependencies?.[name] ?? 'latest';
    for (const name of f.devPackages)
      plan.addDevPackages[name] = starterPkg.devDependencies?.[name] ?? 'latest';
    for (const name of f.scripts)
      if (starterPkg.scripts?.[name]) plan.addScripts[name] = starterPkg.scripts[name];
    if (f.snippets.length)
      plan.manual.push({ feature: f.id, direction: 'add', snippets: f.snippets });
  }
  plan.copy = [...new Set(plan.copy)].sort();
  plan.remove = [...new Set(plan.remove)].sort();
  return plan;
};

export const applyReconfigure = async (
  projectPath: string,
  checkout: StarterCheckout,
  plan: ReconfigurePlan,
  record: ProjectRecord,
): Promise<void> => {
  for (const file of plan.remove) await rm(path.join(projectPath, file), { force: true });
  for (const file of plan.copy) {
    const fromOverlay = plan.turningOn.find((f) => f.overlayFiles.includes(file));
    const source = fromOverlay?.feature.on?.overlay
      ? path.join(checkout.dir, OVERLAYS_DIR, fromOverlay.feature.on.overlay, file)
      : path.join(checkout.dir, file);
    const target = path.join(projectPath, file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { force: true });
  }
  for (const { file, tag } of plan.unwrapJsx) {
    const abs = path.join(projectPath, file);
    if (!fileExists(abs)) continue;
    const content = await readFile(abs, 'utf-8');
    const next = unwrapJsx(content, tag);
    if (next !== content) await writeFile(abs, next, 'utf-8');
  }
  for (const { file, name } of plan.unwrapCall) {
    const abs = path.join(projectPath, file);
    if (!fileExists(abs)) continue;
    const content = await readFile(abs, 'utf-8');
    const next = unwrapCall(content, name);
    if (next !== content) await writeFile(abs, next, 'utf-8');
  }
  const pkgFile = path.join(projectPath, 'package.json');
  const pkg = JSON.parse(await readFile(pkgFile, 'utf-8'));
  pkg.dependencies ??= {};
  pkg.devDependencies ??= {};
  pkg.scripts ??= {};
  for (const name of plan.removePackages) {
    delete pkg.dependencies[name];
    delete pkg.devDependencies[name];
  }
  for (const name of plan.removeScripts) delete pkg.scripts[name];
  Object.assign(pkg.dependencies, plan.addPackages);
  Object.assign(pkg.devDependencies, plan.addDevPackages);
  Object.assign(pkg.scripts, plan.addScripts);
  pkg.dependencies = sortKeys(pkg.dependencies);
  pkg.devDependencies = sortKeys(pkg.devDependencies);
  await writeFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
  await writeProjectRecord(projectPath, { ...record, answers: plan.after });
};

const sortKeys = (obj: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
