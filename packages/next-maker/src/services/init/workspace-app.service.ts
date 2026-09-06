import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileExists } from '../../core/files';

/**
 * Adding an app to an existing pnpm workspace.
 *
 * `next-maker workspace` shapes the apps it creates: the package-manager pin,
 * the lockfile, the npm config, git hooks, CI and Docker belong to the root,
 * and shared dependency ranges live in the root catalog. An app created later
 * with `init` has to end up looking the same, or it drifts from its siblings
 * the first time anyone bumps a dependency.
 */
export interface WorkspaceContext {
  /** Directory holding `pnpm-workspace.yaml`. */
  root: string;
  /** Ranges the root catalog already declares. */
  catalog: Record<string, string>;
}

/** Options a workspace root owns, so an app inside one must not carry them. */
export const ROOT_OWNED_OPTIONS: Record<string, unknown> = {
  hooks: false,
  commitizen: false,
  ci: false,
  docker: false,
  githubTemplates: false,
  communityFiles: [],
};

/** Files an app inside a workspace must not have of its own. */
const APP_LOCAL_FILES = ['pnpm-workspace.yaml', 'pnpm-lock.yaml', '.npmrc', '.nvmrc'];

/**
 * Read the `catalog:` block of a `pnpm-workspace.yaml`. Only the flat form
 * this CLI writes (`  'name': 'range'`) is understood; anything else is left
 * alone, which costs an app its catalog references but never corrupts a root.
 */
export const parseCatalog = (yaml: string): Record<string, string> => {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === 'catalog:');
  if (start === -1) return {};
  const catalog: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (!/^\s+\S/.test(line)) break; // dedented: the block ended
    const match = line.match(/^\s+'?([^':]+)'?\s*:\s*'?([^']+?)'?\s*$/);
    if (match) catalog[match[1]] = match[2];
  }
  return catalog;
};

/**
 * Walk up from `dir` for the workspace that would contain a project created
 * there. Returns null when there is none, which is the ordinary case.
 */
export const findWorkspace = async (dir: string): Promise<WorkspaceContext | null> => {
  let current = path.resolve(dir);
  for (;;) {
    const file = path.join(current, 'pnpm-workspace.yaml');
    if (fileExists(file)) {
      try {
        return { root: current, catalog: parseCatalog(await readFile(file, 'utf-8')) };
      } catch {
        return null;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
};

/** Point a package.json's dependencies at the catalog entries that match. */
export const useCatalog = (
  pkg: Record<string, unknown>,
  catalog: Record<string, string>,
): { pkg: Record<string, unknown>; count: number } => {
  const out = structuredClone(pkg);
  let count = 0;
  for (const section of ['dependencies', 'devDependencies'] as const) {
    const deps = out[section] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (catalog[name] === deps[name]) {
        deps[name] = 'catalog:';
        count++;
      }
    }
  }
  return { pkg: out, count };
};

export interface WorkspaceAppReport {
  removed: string[];
  catalogued: number;
}

/**
 * Strip the root's concerns from a freshly composed app and move its shared
 * ranges onto the catalog.
 */
export const adoptIntoWorkspace = async (
  appPath: string,
  workspace: WorkspaceContext,
): Promise<WorkspaceAppReport> => {
  const removed: string[] = [];
  for (const file of APP_LOCAL_FILES) {
    const target = path.join(appPath, file);
    if (!fileExists(target)) continue;
    await rm(target, { force: true });
    removed.push(file);
  }

  const pkgPath = path.join(appPath, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as Record<string, unknown>;
  pkg.packageManager = undefined;
  pkg.engines = undefined;
  const { pkg: catalogued, count } = useCatalog(pkg, workspace.catalog);
  await writeFile(
    pkgPath,
    `${JSON.stringify(
      Object.fromEntries(Object.entries(catalogued).filter(([, v]) => v !== undefined)),
      null,
      2,
    )}\n`,
  );
  return { removed, catalogued: count };
};
