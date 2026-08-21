import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError } from '../config';
import { checkManifest, MANIFESTS } from '../manifests';
import type { FeatureCheckResult, FeatureFinding } from '../manifests/types';

interface DoctorCommandOptions {
  fix?: boolean;
  feature?: string;
  json?: boolean;
}

const formatFinding = (f: FeatureFinding): string => {
  switch (f.kind) {
    case 'missingFile':
      return `missing file: ${f.file}`;
    case 'missingPackage':
      return `missing ${f.depKind === 'dependency' ? 'dep' : 'devDep'}: ${f.name}`;
    case 'missingScript':
      return `missing script: ${f.name}`;
    case 'mismatchedScript':
      return `script "${f.name}" expected ${pc.dim(f.expected)} but got ${pc.dim(f.actual)}`;
    case 'missingInjection':
      return `missing block in ${f.file}: ${f.description}`;
  }
};

const summary = (
  results: FeatureCheckResult[],
): {
  installedCount: number;
  driftedCount: number;
  cleanCount: number;
  driftedResults: FeatureCheckResult[];
} => {
  const installed = results.filter((r) => r.installed);
  const drifted = installed.filter((r) => r.drift.length > 0);
  return {
    installedCount: installed.length,
    driftedCount: drifted.length,
    cleanCount: installed.length - drifted.length,
    driftedResults: drifted,
  };
};

type FixStatus = 'fixed' | 'stillDrifted' | 'noApply';

export interface FixOutcome {
  id: string;
  name: string;
  status: FixStatus;
  /** Drift that survived the fix (empty only when `status` is `fixed`). */
  remaining: FeatureFinding[];
  /** Set when `apply` threw. */
  error?: string;
}

const OUTCOME_MARK: Record<FixStatus, string> = {
  fixed: pc.green('✓'),
  stillDrifted: pc.red('✗'),
  noApply: pc.yellow('⚠️'),
};

const OUTCOME_LABEL: Record<FixStatus, string> = {
  fixed: pc.green('FIXED'),
  stillDrifted: pc.red('STILL DRIFTED'),
  noApply: pc.yellow('NO AUTOMATIC FIX AVAILABLE'),
};

/**
 * Run each drifted manifest's repair path, then RE-CHECK it.
 *
 * The re-check is the whole point: a service can silently decline to do
 * anything (that was the old `--fix` bug — every setup service opens with a
 * first-run guard, so `apply` printed a failure the command swallowed and
 * doctor still exited 0). Recomputing drift afterwards means the report
 * describes what is true on disk, not what we hoped `apply` did.
 *
 * Exported for tests.
 */
export const applyFixes = async (
  drifted: FeatureCheckResult[],
  projectPath: string,
): Promise<FixOutcome[]> => {
  const outcomes: FixOutcome[] = [];

  for (const result of drifted) {
    const { manifest, drift } = result;

    if (!manifest.apply) {
      outcomes.push({
        id: manifest.id,
        name: manifest.name,
        status: 'noApply',
        remaining: drift,
      });
      continue;
    }

    let error: string | undefined;
    try {
      // Pass the computed drift so the manifest takes its repair path
      // instead of its first-run installer.
      await manifest.apply(projectPath, drift);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    const after = await checkManifest(manifest, projectPath);
    outcomes.push({
      id: manifest.id,
      name: manifest.name,
      status: after.drift.length === 0 && !error ? 'fixed' : 'stillDrifted',
      remaining: after.drift,
      error,
    });
  }

  return outcomes;
};

export const registerDoctorCommand = (program: Command) => {
  program
    .command('doctor')
    .description('Diagnose drift between the project and known feature manifests')
    .option('--fix', 'Re-apply manifests that report drift (idempotent)')
    .option('--feature <id>', 'Only check this manifest id (e.g. redux, security-headers)')
    .option('--json', 'Print machine-readable JSON instead of the human report')
    .action(async (options: DoctorCommandOptions) => {
      try {
        const projectPath = process.cwd();

        const targets = options.feature
          ? MANIFESTS.filter((m) => m.id === options.feature)
          : MANIFESTS;

        if (options.feature && targets.length === 0) {
          throw new Error(
            `Unknown feature "${options.feature}". Valid: ${MANIFESTS.map((m) => m.id).join(', ')}.`,
          );
        }

        const results: FeatureCheckResult[] = [];
        for (const manifest of targets) {
          results.push(await checkManifest(manifest, projectPath));
        }

        if (options.json) {
          log(
            JSON.stringify(
              results.map((r) => ({
                id: r.manifest.id,
                name: r.manifest.name,
                installed: r.installed,
                drift: r.drift,
              })),
              null,
              2,
            ),
          );
          process.exit(results.some((r) => r.drift.length > 0) ? 1 : 0);
        }

        log(pc.cyan('\n🩺 Project Doctor\n'));

        for (const result of results) {
          const { manifest, installed, drift } = result;
          if (!installed) {
            log(`  ${pc.dim('—')} ${pc.dim(manifest.name)} ${pc.dim('(not installed)')}`);
            continue;
          }
          if (drift.length === 0) {
            log(`  ${pc.green('✓')} ${manifest.name}`);
            continue;
          }
          log(
            `  ${pc.yellow('!')} ${pc.bold(manifest.name)} ${pc.dim(`(${drift.length} issue${drift.length === 1 ? '' : 's'})`)}`,
          );
          for (const f of drift) {
            log(`      ${pc.yellow('•')} ${formatFinding(f)}`);
          }
        }

        const stats = summary(results);
        log('');
        log(
          pc.dim(
            `${stats.cleanCount} clean, ${stats.driftedCount} drifted, ${results.length - stats.installedCount} not installed`,
          ),
        );

        if (stats.driftedCount === 0) {
          log(pc.green('\n✓ No drift detected.\n'));
          process.exit(0);
        }

        if (!options.fix) {
          log(pc.dim('\nRun with --fix to re-apply drifted features.\n'));
          process.exit(1);
        }

        log(pc.cyan('\n🔧 Applying fixes...\n'));
        const outcomes = await applyFixes(stats.driftedResults, projectPath);

        log('');
        for (const outcome of outcomes) {
          log(`  ${OUTCOME_MARK[outcome.status]} ${outcome.name} ${OUTCOME_LABEL[outcome.status]}`);
          for (const f of outcome.remaining) {
            log(`      ${pc.yellow('•')} ${formatFinding(f)}`);
          }
          if (outcome.error) {
            log(`      ${pc.red('•')} ${outcome.error}`);
          }
        }

        const fixed = outcomes.filter((o) => o.status === 'fixed').length;
        const unresolved = outcomes.length - fixed;

        log('');
        log(pc.dim(`${fixed} fixed, ${unresolved} still drifted`));

        if (unresolved > 0) {
          // Never claim success while drift survives — the documented
          // `doctor --json` CI usage relies on the exit code.
          log(pc.yellow('\n! Doctor could not fix everything.\n'));
          process.exit(1);
        }

        log(pc.green('\n✓ All drift fixed.\n'));
        process.exit(0);
      } catch (error) {
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
};
