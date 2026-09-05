import type { Command } from 'commander';
import Enquirer from 'enquirer';
import pc from 'picocolors';
import pkg from '../../package.json' with { type: 'json' };
import { type MergeReport, mergeTrees } from '../composition/merge';
import { readProjectRecord, writeProjectRecord } from '../composition/project';
import {
  composeReference,
  identityForProject,
  sourceFromArg,
  sourceFromRecord,
} from '../composition/reference';
import { log, logError } from '../config';
import { resolveStarterSource, STARTER_REF } from '../config/starter';
import { installDependencies } from '../core/package-manager';

const { prompt } = Enquirer;

interface UpgradeCommandOptions {
  to?: string;
  from?: string;
  starterPath?: string;
  yes?: boolean;
  dryRun?: boolean;
  install?: boolean;
}

const MARK: Record<string, string> = {
  added: pc.green('+'),
  updated: pc.cyan('↑'),
  merged: pc.cyan('⇄'),
  deleted: pc.red('-'),
  conflict: pc.red('✗'),
  kept: pc.yellow('·'),
  skipped: pc.dim('·'),
};

export const printMergeReport = (report: MergeReport): void => {
  const shown = report.entries.filter((e) => e.outcome !== 'unchanged');
  if (shown.length === 0) {
    log(pc.dim('  no file changes'));
    return;
  }
  for (const e of shown) {
    log(
      `  ${MARK[e.outcome] ?? ' '} ${e.outcome.padEnd(8)} ${e.file}${e.note ? pc.dim(`  (${e.note})`) : ''}`,
    );
  }
  const counts = shown.reduce<Record<string, number>>(
    (acc, e) => ({ ...acc, [e.outcome]: (acc[e.outcome] ?? 0) + 1 }),
    {},
  );
  log('');
  log(
    pc.dim(
      `  ${Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')}`,
    ),
  );
  if (report.conflicts.length) {
    log('');
    log(pc.red(`  ${report.conflicts.length} file(s) need attention; look for <<<<<<< markers:`));
    for (const f of report.conflicts) log(pc.red(`    ${f}`));
  }
};

/**
 * Move a project to a newer starter: compose the starter it came from and
 * the target starter with the same answers, then three-way merge the
 * project against them. Only lines the project never changed move; both-
 * sides changes are merged, and true conflicts get markers.
 */
export const registerUpgradeCommand = (program: Command) => {
  program
    .command('upgrade')
    .description(`Merge starter changes into this project (default target: ${STARTER_REF})`)
    .option('--to <ref|dir>', 'Starter tag or local checkout to upgrade to')
    .option(
      '--from <ref|dir>',
      'Starter the project was generated from (default: recorded at init)',
    )
    .option('--starter-path <dir>', 'Alias for --to with a local checkout')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .option('--dry-run', 'Report what would change without writing')
    .option('--no-install', 'Skip dependency installation afterwards')
    .action(async (options: UpgradeCommandOptions) => {
      const projectPath = process.cwd();
      const disposers: (() => Promise<void>)[] = [];
      try {
        const record = await readProjectRecord(projectPath);
        const identity = await identityForProject(projectPath, record);
        const from = options.from ? sourceFromArg(options.from) : sourceFromRecord(record);
        const to = options.to
          ? sourceFromArg(options.to)
          : resolveStarterSource({ starterPath: options.starterPath, ref: STARTER_REF });
        if (from.location === to.location) {
          log(pc.dim(`Already on ${to.location}; nothing to upgrade.`));
          return;
        }

        log(pc.cyan('\n⬆ Upgrade\n'));
        log(`  ${pc.dim('from')} ${from.location}`);
        log(`  ${pc.dim('to  ')} ${to.location}\n`);

        const base = await composeReference(
          from,
          record.answers,
          identity,
          record.packageManager,
          projectPath,
        );
        disposers.push(base.dispose);
        const theirs = await composeReference(
          to,
          record.answers,
          identity,
          record.packageManager,
          projectPath,
        );
        disposers.push(theirs.dispose);
        for (const f of theirs.scaffold.forced)
          log(pc.yellow(`  ! ${f.reason}; ${f.option} turned off`));
        for (const name of theirs.scaffold.unknown)
          log(pc.yellow(`  ! option "${name}" no longer exists in the new starter`));

        const preview = await mergeTrees(
          { base: base.dir, theirs: theirs.dir, ours: projectPath },
          { dryRun: true },
        );
        printMergeReport(preview);
        if (options.dryRun) {
          log(pc.dim('\nDry run: nothing was written.\n'));
          return;
        }
        if (!options.yes) {
          const { confirm } = await prompt<{ confirm: boolean }>({
            type: 'confirm',
            name: 'confirm',
            message: 'Apply these changes?',
            initial: false,
          });
          if (!confirm) {
            log(pc.yellow('Aborted.\n'));
            return;
          }
        }
        const report = await mergeTrees({ base: base.dir, theirs: theirs.dir, ours: projectPath });
        await writeProjectRecord(projectPath, {
          ...record,
          cli: pkg.version,
          starter: { ...theirs.scaffold.manifest.starter, source: to.location },
          answers: theirs.scaffold.answers,
          identity: record.identity ?? {
            projectName: identity.projectName,
            description: identity.description,
            author: identity.author,
            version: identity.version,
            email: identity.email,
            gitRemote: identity.gitRemote,
            readme: identity.readme,
          },
        });
        if (options.install !== false) {
          log(pc.dim(`\nInstalling with ${record.packageManager}...`));
          await installDependencies(projectPath, record.packageManager);
        }
        log(pc.green(`\n✓ Upgraded to ${theirs.scaffold.manifest.starter.version}.`));
        if (report.conflicts.length)
          log(pc.yellow('  Resolve the conflicts above, then run `next-maker doctor --compile`.'));
        else log(pc.dim('  Run `next-maker doctor --compile` to confirm.'));
        log('');
      } catch (error) {
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      } finally {
        for (const dispose of disposers) await dispose();
      }
    });
};
