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
        for (const result of stats.driftedResults) {
          if (!result.manifest.apply) {
            log(pc.yellow(`  ⚠️  ${result.manifest.name} has no apply() — skipping.`));
            continue;
          }
          try {
            await result.manifest.apply(projectPath);
          } catch (error) {
            logError(`Failed to fix ${result.manifest.name}: ${error}`);
          }
        }

        log(pc.green('\n✓ Doctor finished.\n'));
      } catch (error) {
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
};
