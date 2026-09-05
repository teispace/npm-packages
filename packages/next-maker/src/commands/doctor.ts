import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { runCommand } from '../composition/package-manager';
import {
  applyReconfigure,
  checkoutStarter,
  checkProject,
  type Finding,
  planReconfigure,
  readProjectRecord,
} from '../composition/project';
import { log, logError } from '../config';

interface DoctorCommandOptions {
  fix?: boolean;
  json?: boolean;
  compile?: boolean;
  starterPath?: string;
}

const describe = (f: Finding): string => {
  switch (f.kind) {
    case 'missingFile':
      return `missing file: ${f.file}`;
    case 'missingPackage':
      return `missing ${f.dev ? 'devDependency' : 'dependency'}: ${f.name}`;
    case 'missingScript':
      return `missing script: ${f.name}`;
  }
};

/**
 * Compare the project against the footprint of every feature it was
 * generated with, using a pristine checkout of the starter. `--fix` copies
 * missing files and restores packages and scripts; `--compile` runs the
 * project's own type-check afterwards, which is the only honest signal that
 * the pieces still fit together.
 */
export const registerDoctorCommand = (program: Command) => {
  program
    .command('doctor')
    .description(
      'Diagnose drift between the project and the starter features it was generated with',
    )
    .option('--fix', 'Restore missing files, packages, and scripts from the starter')
    .option('--compile', 'Run the project type-check as part of the diagnosis')
    .option('--json', 'Print machine-readable JSON')
    .option('--starter-path <dir>', 'Compare against a local starter checkout')
    .action(async (options: DoctorCommandOptions) => {
      const projectPath = process.cwd();
      let dispose: (() => Promise<void>) | undefined;
      try {
        const record = await readProjectRecord(projectPath);
        const checkout = await checkoutStarter(record, { starterPath: options.starterPath });
        dispose = checkout.dispose;

        let results = await checkProject(projectPath, record, checkout);
        let fixed = 0;
        if (options.fix && results.some((r) => r.drift.length)) {
          // Re-applying the current answers restores every missing footprint
          // file from the pristine starter without touching user code.
          const plan = await planReconfigure(
            projectPath,
            { ...record, answers: {} },
            checkout,
            record.answers,
          );
          const missing = new Set(
            results.flatMap((r) =>
              r.drift
                .filter((d) => d.kind === 'missingFile')
                .map((d) => (d as { file: string }).file),
            ),
          );
          plan.copy = plan.copy.filter((file) => missing.has(file));
          plan.remove = [];
          plan.unwrapJsx = [];
          plan.unwrapCall = [];
          plan.removePackages = [];
          plan.removeScripts = [];
          plan.manual = [];
          const wanted = new Set(
            results.flatMap((r) =>
              r.drift
                .filter((d) => d.kind === 'missingPackage')
                .map((d) => (d as { name: string }).name),
            ),
          );
          for (const name of Object.keys(plan.addPackages))
            if (!wanted.has(name)) delete plan.addPackages[name];
          for (const name of Object.keys(plan.addDevPackages))
            if (!wanted.has(name)) delete plan.addDevPackages[name];
          const wantedScripts = new Set(
            results.flatMap((r) =>
              r.drift
                .filter((d) => d.kind === 'missingScript')
                .map((d) => (d as { name: string }).name),
            ),
          );
          for (const name of Object.keys(plan.addScripts))
            if (!wantedScripts.has(name)) delete plan.addScripts[name];
          await applyReconfigure(projectPath, checkout, plan, record);
          fixed =
            plan.copy.length +
            Object.keys(plan.addPackages).length +
            Object.keys(plan.addDevPackages).length +
            Object.keys(plan.addScripts).length;
          results = await checkProject(projectPath, record, checkout);
        }

        let compile: { ok: boolean; output: string } | undefined;
        if (options.compile) {
          const [cmd, ...args] = runCommand(record.packageManager, 'type-check').split(' ');
          const run = spawnSync(cmd, args, { cwd: projectPath, encoding: 'utf-8' });
          compile = { ok: run.status === 0, output: `${run.stdout}${run.stderr}`.trim() };
        }

        const drifted = results.filter((r) => r.on && r.drift.length);
        if (options.json) {
          log(JSON.stringify({ starter: record.starter, results, fixed, compile }, null, 2));
          process.exit(drifted.length || compile?.ok === false ? 1 : 0);
        }

        log(pc.cyan('\n🩺 Project Doctor\n'));
        log(
          pc.dim(
            `  ${record.starter.name} ${record.starter.version} · ${checkout.source.location}\n`,
          ),
        );
        for (const r of results) {
          if (!r.on) {
            log(`  ${pc.dim('—')} ${pc.dim(r.id)} ${pc.dim('(off)')}`);
            continue;
          }
          if (r.drift.length === 0) {
            log(`  ${pc.green('✓')} ${r.id}`);
            continue;
          }
          log(
            `  ${pc.yellow('!')} ${pc.bold(r.id)} ${pc.dim(`(${r.drift.length} issue${r.drift.length === 1 ? '' : 's'})`)}`,
          );
          for (const f of r.drift) log(`      ${pc.yellow('•')} ${describe(f)}`);
        }
        if (fixed) log(pc.green(`\n  restored ${fixed} item(s) from the starter`));
        if (compile) {
          log('');
          log(compile.ok ? pc.green('  ✓ type-check passed') : pc.red('  ✗ type-check failed'));
          if (!compile.ok) log(pc.dim(compile.output.split('\n').slice(-30).join('\n')));
        }
        log('');
        if (drifted.length === 0 && compile?.ok !== false) {
          log(pc.green('✓ No drift detected.\n'));
          process.exit(0);
        }
        if (drifted.length && !options.fix)
          log(pc.dim('Run with --fix to restore missing pieces from the starter.\n'));
        process.exit(1);
      } catch (error) {
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      } finally {
        await dispose?.();
      }
    });
};
