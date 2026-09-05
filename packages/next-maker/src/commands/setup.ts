import type { Command } from 'commander';
import Enquirer from 'enquirer';
import pc from 'picocolors';
import { parseSetFlags, resolveAnswers } from '../composition';
import { mergeTrees } from '../composition/merge';
import { checkoutStarter, readProjectRecord, writeProjectRecord } from '../composition/project';
import { composeReference, identityForProject } from '../composition/reference';
import { log, logError } from '../config';
import { installDependencies } from '../core/package-manager';
import { printMergeReport } from './upgrade';

const { prompt } = Enquirer;

interface SetupCommandOptions {
  set?: string[];
  yes?: boolean;
  dryRun?: boolean;
  install?: boolean;
  starterPath?: string;
}

const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

/**
 * Change starter options on an existing project. The starter is composed
 * twice, with the old and the new answers, and the project is three-way
 * merged between the two: files a feature adds appear, files it owns
 * disappear, and anchored lines in shared files (a reducer registration,
 * a provider import) are merged in place. Only lines the project itself
 * changed can conflict.
 */
export const registerSetupCommand = (program: Command) => {
  program
    .command('setup')
    .description('Turn starter features on or off in an existing project (e.g. --set ws=true)')
    .option(
      '--set <key=value>',
      'Option to change (repeatable), e.g. --set i18n=false --set state=zustand',
      collect,
    )
    .option('-y, --yes', 'Skip the confirmation prompt')
    .option('--dry-run', 'Print the plan without writing')
    .option('--no-install', 'Skip dependency installation after the change')
    .option('--starter-path <dir>', 'Use a local starter checkout')
    .action(async (options: SetupCommandOptions) => {
      const projectPath = process.cwd();
      const disposers: (() => Promise<void>)[] = [];
      try {
        const record = await readProjectRecord(projectPath);
        const overrides = parseSetFlags(options.set);
        if (Object.keys(overrides).length === 0) {
          throw new Error(
            'Nothing to change. Pass at least one --set key=value (run `next-maker options` to list them).',
          );
        }
        const checkout = await checkoutStarter(record, { starterPath: options.starterPath });
        disposers.push(checkout.dispose);
        const { answers, forced, unknown } = resolveAnswers(checkout.manifest, {
          ...record.answers,
          ...overrides,
        });
        for (const name of unknown) log(pc.yellow(`  ! unknown option "${name}" ignored`));
        for (const f of forced) log(pc.yellow(`  ! ${f.reason}; ${f.option} turned off`));
        const changed = Object.keys(answers).filter(
          (k) => JSON.stringify(answers[k]) !== JSON.stringify(record.answers[k]),
        );
        log(pc.cyan('\n🔧 Setup\n'));
        if (changed.length === 0) {
          log(pc.dim('No option changes; the project already has these values.\n'));
          return;
        }
        for (const k of changed)
          log(
            `  ${pc.dim(k.padEnd(18))} ${String(record.answers[k])} ${pc.dim('→')} ${String(answers[k])}`,
          );
        log('');

        const identity = await identityForProject(projectPath, record);
        const base = await composeReference(
          checkout.source,
          record.answers,
          identity,
          record.packageManager,
          projectPath,
        );
        disposers.push(base.dispose);
        const theirs = await composeReference(
          checkout.source,
          answers,
          identity,
          record.packageManager,
          projectPath,
        );
        disposers.push(theirs.dispose);

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
        await writeProjectRecord(projectPath, { ...record, answers });
        if (options.install !== false) {
          log(pc.dim(`\nInstalling with ${record.packageManager}...`));
          await installDependencies(projectPath, record.packageManager);
        }
        log(pc.green('\n✓ Applied.'));
        if (report.conflicts.length)
          log(pc.yellow('  Resolve the conflicts above, then run `next-maker doctor --compile`.'));
        log('');
      } catch (error) {
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      } finally {
        for (const dispose of disposers) await dispose();
      }
    });
};
