import type { Command } from 'commander';
import Enquirer from 'enquirer';
import pc from 'picocolors';
import { parseSetFlags, resolveAnswers } from '../composition';
import {
  applyReconfigure,
  checkoutStarter,
  planReconfigure,
  type ReconfigurePlan,
  readProjectRecord,
} from '../composition/project';
import { log, logError } from '../config';
import { detectPackageManager, installDependencies } from '../core/package-manager';

const { prompt } = Enquirer;

interface SetupCommandOptions {
  set?: string[];
  yes?: boolean;
  dryRun?: boolean;
  install?: boolean;
  starterPath?: string;
}

const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

export const printReconfigurePlan = (plan: ReconfigurePlan): void => {
  const changed = Object.keys(plan.after).filter(
    (k) => JSON.stringify(plan.after[k]) !== JSON.stringify(plan.before[k]),
  );
  log(pc.bold('Options'));
  for (const k of changed)
    log(
      `  ${pc.dim(k.padEnd(20))} ${String(plan.before[k])} ${pc.dim('→')} ${String(plan.after[k])}`,
    );
  if (plan.turningOn.length)
    log(`  ${pc.green('on ')} ${plan.turningOn.map((f) => f.id).join(', ')}`);
  if (plan.turningOff.length)
    log(`  ${pc.red('off')} ${plan.turningOff.map((f) => f.id).join(', ')}`);
  log('');
  if (plan.copy.length) {
    log(pc.bold('Files copied from the starter'));
    for (const f of plan.copy) log(`  ${pc.green('+')} ${f}`);
  }
  if (plan.remove.length) {
    log(pc.bold('Files removed'));
    for (const f of plan.remove) log(`  ${pc.red('-')} ${f}`);
  }
  const pkgs = [...Object.keys(plan.addPackages), ...Object.keys(plan.addDevPackages)];
  if (pkgs.length) log(`${pc.bold('Packages added')}\n  ${pkgs.join(', ')}`);
  if (plan.removePackages.length)
    log(`${pc.bold('Packages removed')}\n  ${plan.removePackages.join(', ')}`);
  if (Object.keys(plan.addScripts).length)
    log(`${pc.bold('Scripts added')}\n  ${Object.keys(plan.addScripts).join(', ')}`);
  if (plan.removeScripts.length)
    log(`${pc.bold('Scripts removed')}\n  ${plan.removeScripts.join(', ')}`);
  if (plan.unwrapJsx.length || plan.unwrapCall.length) {
    log(pc.bold('Wrappers removed'));
    for (const u of plan.unwrapJsx) log(`  ${pc.red('-')} <${u.tag}> in ${u.file}`);
    for (const u of plan.unwrapCall) log(`  ${pc.red('-')} ${u.name}() in ${u.file}`);
  }
  if (plan.manual.length) {
    log('');
    log(pc.yellow(pc.bold('Manual steps')));
    log(
      pc.dim(
        '  Shared files were composed at init; the starter marks these lines for the feature:',
      ),
    );
    for (const m of plan.manual) {
      log(
        `  ${m.direction === 'add' ? pc.green('add') : pc.red('delete')} for ${pc.bold(m.feature)}`,
      );
      for (const s of m.snippets) {
        log(`    ${pc.dim(s.file)}`);
        for (const line of s.lines) log(`      ${line}`);
      }
    }
  }
  log('');
};

/**
 * Change starter options on an existing project: turn features on or off by
 * re-deriving their footprint from a pristine starter checkout. File and
 * package changes are applied; anchored edits in shared files are listed.
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
      let dispose: (() => Promise<void>) | undefined;
      try {
        const record = await readProjectRecord(projectPath);
        const overrides = parseSetFlags(options.set);
        if (Object.keys(overrides).length === 0) {
          throw new Error(
            'Nothing to change. Pass at least one --set key=value (run `next-maker options` to list them).',
          );
        }
        const checkout = await checkoutStarter(record, { starterPath: options.starterPath });
        dispose = checkout.dispose;

        const { answers, forced, unknown } = resolveAnswers(checkout.manifest, {
          ...record.answers,
          ...overrides,
        });
        for (const name of unknown) log(pc.yellow(`  ! unknown option "${name}" ignored`));
        for (const f of forced) log(pc.yellow(`  ! ${f.reason}; ${f.option} turned off`));

        const plan = await planReconfigure(projectPath, record, checkout, answers);
        log(pc.cyan('\n🔧 Setup\n'));
        printReconfigurePlan(plan);
        if (plan.turningOn.length === 0 && plan.turningOff.length === 0) {
          log(pc.dim('No feature changes; the options already have these values.\n'));
          return;
        }
        if (options.dryRun) {
          log(pc.dim('Dry run: nothing was written.\n'));
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
        await applyReconfigure(projectPath, checkout, plan, record);
        if (options.install !== false) {
          const pm = record.packageManager ?? (await detectPackageManager(projectPath));
          log(pc.dim(`Installing with ${pm}...`));
          await installDependencies(projectPath, pm);
        }
        log(pc.green('\n✓ Applied.'));
        if (plan.manual.length)
          log(
            pc.yellow(
              '  Finish the manual steps listed above, then run `next-maker doctor --compile`.',
            ),
          );
        log('');
      } catch (error) {
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      } finally {
        await dispose?.();
      }
    });
};
