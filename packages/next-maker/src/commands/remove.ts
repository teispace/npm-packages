import type { Command } from 'commander';
import Enquirer from 'enquirer';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { checkManifest, getManifest, MANIFESTS, reverseManifest } from '../manifests';
import type { RemoveSummary } from '../manifests/runner';

const { prompt } = Enquirer;

interface RemoveCommandOptions {
  yes?: boolean;
  dryRun?: boolean;
}

const formatSummary = (summary: RemoveSummary): string[] => {
  const lines: string[] = [];
  for (const file of summary.filesRemoved) {
    lines.push(`  ${pc.red('-')} delete: ${file}`);
  }
  for (const block of summary.blocksStripped) {
    lines.push(`  ${pc.red('-')} strip block: ${block.description} ${pc.dim(`(${block.file})`)}`);
  }
  for (const script of summary.scriptsRemoved) {
    lines.push(`  ${pc.red('-')} remove script: ${script}`);
  }
  for (const dep of summary.packagesUninstalled) {
    lines.push(`  ${pc.red('-')} uninstall: ${dep}`);
  }
  for (const item of summary.manualCleanup) {
    lines.push(
      `  ${pc.yellow('?')} manual cleanup: ${item.description} ${pc.dim(`(${item.file})`)}`,
    );
  }
  return lines;
};

const isEmpty = (s: RemoveSummary): boolean =>
  s.filesRemoved.length === 0 &&
  s.blocksStripped.length === 0 &&
  s.scriptsRemoved.length === 0 &&
  s.packagesUninstalled.length === 0 &&
  s.manualCleanup.length === 0;

export const registerRemoveCommand = (program: Command) => {
  program
    .command('remove <feature>')
    .alias('uninstall')
    .description('Reverse a feature install (uses the feature manifest)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Show what would change without writing')
    .action(async (feature: string, options: RemoveCommandOptions) => {
      try {
        const projectPath = process.cwd();

        const manifest = getManifest(feature);
        if (!manifest) {
          throw new Error(
            `Unknown feature "${feature}". Valid: ${MANIFESTS.map((m) => m.id).join(', ')}.`,
          );
        }

        log(pc.cyan(`\n🗑  Remove ${manifest.name}\n`));

        const detection = await checkManifest(manifest, projectPath);
        if (!detection.installed) {
          log(pc.dim(`${manifest.name} is not installed — nothing to remove.`));
          return;
        }

        spinner.start('Computing changes...');
        const planned = await reverseManifest(manifest, projectPath, { dryRun: true });
        spinner.succeed('Computed plan');

        if (isEmpty(planned)) {
          log(pc.yellow('\n⚠️  Manifest had no removable artifacts. Nothing to do.\n'));
          return;
        }

        log(pc.bold('\nPlanned changes:\n'));
        for (const line of formatSummary(planned)) log(line);
        log('');

        if (options.dryRun) {
          log(pc.dim('--dry-run set — exiting without writing.\n'));
          return;
        }

        if (!options.yes) {
          const { confirm } = await prompt<{ confirm: boolean }>({
            type: 'confirm',
            name: 'confirm',
            message: `Apply the changes above to remove ${manifest.name}?`,
            initial: false,
          });
          if (!confirm) {
            log(pc.yellow('\nAborted.\n'));
            return;
          }
        }

        spinner.start(`Removing ${manifest.name}...`);
        const applied = manifest.remove
          ? (await manifest.remove(projectPath), planned)
          : await reverseManifest(manifest, projectPath);
        spinner.succeed(`${manifest.name} removed`);

        log(pc.green(`\n✓ ${manifest.name} removed.`));
        if (applied.manualCleanup.length > 0) {
          log(pc.yellow('\n⚠️  Manual cleanup still required:'));
          for (const item of applied.manualCleanup) {
            log(`  - ${item.description} (${item.file})`);
          }
        }
        log('');
      } catch (error) {
        spinner.fail('Remove failed');
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
};
