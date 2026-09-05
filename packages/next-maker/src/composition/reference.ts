import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveStarterSource, type StarterSource } from '../config/starter';
import { fileExists } from '../core/files';
import type { PackageManager } from '../core/package-manager';
import { defaultIdentity, type ProjectIdentity } from '../prompts/create-app.prompt';
import { composeProject, fetchAndPlan, type ScaffoldPlan } from '../services/init/scaffold.service';
import type { Answers } from './manifest';
import type { ProjectRecord } from './project';

const execFileAsync = promisify(execFile);

export interface ReferenceTree {
  dir: string;
  scaffold: ScaffoldPlan;
  dispose: () => Promise<void>;
}

/** The identity to compose reference trees with: the record's, else read from package.json. */
export const identityForProject = async (
  projectPath: string,
  record: ProjectRecord,
): Promise<ProjectIdentity> => {
  if (record.identity)
    return defaultIdentity(record.identity.projectName, { ...record.identity, copyEnv: false });
  const pkg = JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf-8'));
  return defaultIdentity(path.basename(projectPath), {
    projectName: pkg.name ?? path.basename(projectPath),
    description: pkg.description,
    author: typeof pkg.author === 'string' ? pkg.author : undefined,
    version: pkg.version,
    readme: fileExists(path.join(projectPath, 'README.md')),
    copyEnv: false,
  });
};

/** The starter source a record was generated from, as something `cloneStarter` accepts. */
export const sourceFromRecord = (record: ProjectRecord): StarterSource => {
  const location = record.starter.source;
  if (location.startsWith('/') || location.startsWith('.')) {
    if (!fileExists(location)) {
      throw new Error(
        `The starter this project was generated from is a local path that no longer exists (${location}). Pass --from <ref|dir>.`,
      );
    }
    return { kind: 'local', location: path.resolve(location) };
  }
  return { kind: 'remote', location };
};

export const sourceFromArg = (value: string): StarterSource => {
  if (value.startsWith('/') || value.startsWith('.') || fileExists(value))
    return { kind: 'local', location: path.resolve(value) };
  return resolveStarterSource({
    ref: value.includes('#') ? value.split('#')[1] : value,
    starterPath: undefined,
  });
};

/**
 * Compose the starter at `source` with the given answers into a temporary
 * directory, formatted with the project's own Biome when available so
 * whitespace never shows up as a difference against the project.
 */
export const composeReference = async (
  source: StarterSource,
  answers: Answers,
  identity: ProjectIdentity,
  packageManager: PackageManager,
  formatWithBiomeFrom?: string,
): Promise<ReferenceTree> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'next-maker-ref-'));
  const target = path.join(dir, identity.projectName);
  try {
    const scaffold = await fetchAndPlan({
      projectPath: target,
      source,
      supplied: answers,
      packageManager,
    });
    await composeProject(target, identity, scaffold, source);
    const biome = formatWithBiomeFrom
      ? path.join(formatWithBiomeFrom, 'node_modules', '.bin', 'biome')
      : undefined;
    if (biome && fileExists(biome)) {
      try {
        await execFileAsync(biome, ['check', '--write', '--no-errors-on-unmatched', '.'], {
          cwd: target,
          maxBuffer: 64 * 1024 * 1024,
        });
      } catch {
        // Lint errors are irrelevant here; formatting is what matters and it was applied.
      }
    }
    return { dir: target, scaffold, dispose: () => rm(dir, { recursive: true, force: true }) };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
};
