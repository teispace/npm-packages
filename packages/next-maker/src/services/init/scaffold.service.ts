import pkg from '../../../package.json' with { type: 'json' };
import {
  type Answers,
  applyComposition,
  type CompositionPlan,
  type CompositionReport,
  loadStarterManifest,
  planComposition,
  resolveAnswers,
  type StarterManifest,
} from '../../composition';
import { cloneStarter, type StarterSource } from '../../config/starter';
import type { PackageManager } from '../../core/package-manager';
import type { ProjectIdentity } from '../../prompts/create-app.prompt';
import { configurePackageJson } from './config.service';
import {
  personaliseDockerEnv,
  personaliseTemplates,
  writeProjectReadme,
  writeProjectRecord,
} from './finalize.service';

export interface ScaffoldPlanInput {
  projectPath: string;
  source: StarterSource;
  /** Option answers; missing ones take the manifest defaults. */
  supplied: Record<string, unknown>;
  packageManager?: PackageManager;
}

export interface ScaffoldPlan {
  manifest: StarterManifest;
  answers: Answers;
  forced: { option: string; value: unknown; reason: string }[];
  unknown: string[];
  packageManager: PackageManager;
  plan: CompositionPlan;
}

/** Fetch the starter into `projectPath` and compute the composition plan. */
export const fetchAndPlan = async (input: ScaffoldPlanInput): Promise<ScaffoldPlan> => {
  await cloneStarter(input.projectPath, { source: input.source });
  const manifest = await loadStarterManifest(input.projectPath);
  return replan(manifest, input.supplied, input.packageManager);
};

/** Recompute a plan from a (possibly updated) answer set. */
export const replan = (
  manifest: StarterManifest,
  supplied: Record<string, unknown>,
  packageManager?: PackageManager,
): ScaffoldPlan => {
  const { answers, forced, unknown } = resolveAnswers(manifest, supplied);
  const pm = (answers.packageManager as PackageManager) ?? packageManager ?? 'pnpm';
  return {
    manifest,
    answers,
    forced,
    unknown,
    packageManager: pm,
    plan: planComposition(manifest, answers, pm),
  };
};

/** Apply the plan and stamp identity, README, and the project record. */
export const composeProject = async (
  projectPath: string,
  identity: ProjectIdentity,
  scaffold: ScaffoldPlan,
  source: StarterSource,
): Promise<CompositionReport> => {
  const { manifest, answers, packageManager, plan } = scaffold;
  const report = await applyComposition(projectPath, manifest, plan);
  await configurePackageJson(projectPath, identity);
  await personaliseTemplates(projectPath, identity);
  await personaliseDockerEnv(projectPath, identity);
  await writeProjectReadme(projectPath, identity, manifest, answers, packageManager);
  await writeProjectRecord(projectPath, {
    cli: pkg.version,
    starter: {
      name: manifest.starter.name,
      version: manifest.starter.version,
      source: source.location,
    },
    packageManager,
    answers,
  });
  return report;
};
