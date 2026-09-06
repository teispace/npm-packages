import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import Enquirer from 'enquirer';
import pc from 'picocolors';
import { parseSetFlags, resolveAnswers } from '../composition';
import { unwrapCall, unwrapJsx } from '../composition/anchors';
import { listFiles, matchFiles } from '../composition/glob';
import { OVERLAYS_DIR } from '../composition/manifest';
import { mergeTrees } from '../composition/merge';
import { checkoutStarter, readProjectRecord, writeProjectRecord } from '../composition/project';
import { composeReference, identityForProject } from '../composition/reference';
import { log, logError } from '../config';
import { formatTouched, formatWithBiome } from '../core/format';
import { installDependencies } from '../core/package-manager';
import type { ScaffoldPlan } from '../services/init/scaffold.service';
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

/**
 * Run the JSX and call unwraps owned by a changed option against the
 * project's files. Composition applies them to a pristine starter; the same
 * edit has to reach the project, or the merge sees the starter dropping
 * lines the project has since built on.
 */
const applyOwnedUnwraps = async (
  projectPath: string,
  plan: ScaffoldPlan['plan'],
  changedOptions: Set<string>,
): Promise<string[]> => {
  const touched = (options: string[]) => options.some((o) => changedOptions.has(o));
  const edited: string[] = [];
  const edits: [string, (content: string) => string][] = [
    ...plan.unwrapJsx
      .filter((u) => touched(u.options))
      .map((u): [string, (c: string) => string] => [
        u.file,
        (content) => unwrapJsx(content, u.tag),
      ]),
    ...plan.unwrapCall
      .filter((u) => touched(u.options))
      .map((u): [string, (c: string) => string] => [
        u.file,
        (content) => unwrapCall(content, u.name),
      ]),
  ];
  for (const [file, edit] of edits) {
    const target = path.join(projectPath, file);
    let content: string;
    try {
      content = await readFile(target, 'utf-8');
    } catch {
      continue;
    }
    const next = edit(content);
    if (next === content) continue;
    await writeFile(target, next);
    if (!edited.includes(file)) edited.push(file);
  }
  return edited;
};

/**
 * Files that belong to a variant of an option the user just changed: the
 * files its overlay ships, and the paths the other variant's removals claim
 * (including ones a generator wrote there). They are swapped or dropped
 * whole rather than merged line by line.
 */
const variantPaths = async (
  starterDir: string,
  projectPath: string,
  scaffolds: ScaffoldPlan[],
  changedOptions: Set<string>,
): Promise<Set<string>> => {
  const touched = (options: string[]) => options.some((o) => changedOptions.has(o));
  const files = new Set<string>();

  for (const { plan } of scaffolds) {
    for (const overlay of plan.featureOverlays) {
      if (!touched(overlay.options)) continue;
      for (const file of await listFiles(
        path.join(starterDir, OVERLAYS_DIR, overlay.name),
        new Set(),
      ))
        files.add(file);
    }
  }

  const patterns = scaffolds.flatMap(({ plan }) =>
    plan.featureRemovals.filter((r) => touched(r.options)).flatMap((r) => r.patterns),
  );
  if (patterns.length) {
    const projectFiles = await listFiles(projectPath);
    for (const pattern of patterns)
      for (const file of matchFiles(projectFiles, pattern)) files.add(file);
  }
  return files;
};

/**
 * Code the user owns can outlive the library it was written against — a
 * generated Redux slice in a feature directory the manifest knows nothing
 * about. Name those files instead of leaving a project that will not
 * compile with no explanation.
 */
const importsOfRemovedPackages = async (
  projectPath: string,
  plan: ScaffoldPlan['plan'],
): Promise<{ file: string; packages: string[] }[]> => {
  const removed = [...plan.packages, ...plan.devPackages];
  if (removed.length === 0) return [];
  const sources = (await listFiles(projectPath)).filter((f) =>
    /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f),
  );
  const found: { file: string; packages: string[] }[] = [];
  for (const file of sources) {
    let content: string;
    try {
      content = await readFile(path.join(projectPath, file), 'utf-8');
    } catch {
      continue;
    }
    const hits = removed.filter((name) =>
      new RegExp(`from ['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/[^'"]*)?['"]`).test(
        content,
      ),
    );
    if (hits.length) found.push({ file, packages: hits });
  }
  return found;
};

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

        const changedOptions = new Set(changed);
        const variant = await variantPaths(
          checkout.dir,
          projectPath,
          [base.scaffold, theirs.scaffold],
          changedOptions,
        );
        const mergeOptions = { variant: (file: string) => variant.has(file) };

        // Apply the unwraps this change owns to the project *and* to the tree
        // the merge treats as the common ancestor. The starter's version of
        // `RootProvider` knows nothing about a provider the project added
        // inside the wrapper being removed; once both sides carry the same
        // edit, the only base-to-starter difference left in the file is what
        // the starter genuinely changed, and the project's provider survives.
        const unwrapped = await applyOwnedUnwraps(
          projectPath,
          theirs.scaffold.plan,
          changedOptions,
        );
        const unwrappedBase = await applyOwnedUnwraps(
          base.dir,
          theirs.scaffold.plan,
          changedOptions,
        );
        if (unwrappedBase.length) await formatWithBiome(base.dir, unwrappedBase, projectPath, true);
        for (const file of unwrapped) log(pc.dim(`  unwrapped in place: ${file}`));

        const preview = await mergeTrees(
          { base: base.dir, theirs: theirs.dir, ours: projectPath },
          { ...mergeOptions, dryRun: true },
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
        const startedAt = Date.now();
        const report = await mergeTrees(
          { base: base.dir, theirs: theirs.dir, ours: projectPath },
          mergeOptions,
        );
        await formatTouched(projectPath, startedAt);
        await writeProjectRecord(projectPath, { ...record, answers });
        if (options.install !== false) {
          log(pc.dim(`\nInstalling with ${record.packageManager}...`));
          await installDependencies(projectPath, record.packageManager);
        }
        const swapped = report.entries.filter(
          (e) => e.outcome === 'replaced' || (e.outcome === 'deleted' && e.note),
        ).length;
        if (swapped > 0) {
          log('');
          log(
            pc.dim(
              `  ${swapped} file(s) came from the variant you switched; run \`next-maker doctor --compile\` to catch code of your own that no longer builds.`,
            ),
          );
        }

        const orphans = await importsOfRemovedPackages(projectPath, theirs.scaffold.plan);
        if (orphans.length) {
          log('');
          log(pc.yellow('  Still importing packages this change removed; port them by hand:'));
          for (const { file, packages } of orphans)
            log(pc.yellow(`    ${file} — ${packages.join(', ')}`));
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
