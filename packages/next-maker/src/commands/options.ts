import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { checkoutStarter, readProjectRecord } from '../composition/project';
import { log, logError } from '../config';
import { fileExists } from '../core/files';

/** List the starter's options with their current values (in a project) or defaults. */
export const registerOptionsCommand = (program: Command) => {
  program
    .command('options')
    .description("List the starter's options and this project's current values")
    .option('--starter-path <dir>', 'Read the manifest from a local starter checkout')
    .action(async (options: { starterPath?: string }) => {
      let dispose: (() => Promise<void>) | undefined;
      try {
        const projectPath = process.cwd();
        const inProject = fileExists(path.join(projectPath, '.next-maker.json'));
        const record = inProject
          ? await readProjectRecord(projectPath)
          : {
              cli: '',
              starter: { name: '', version: '', source: '' },
              packageManager: 'pnpm' as const,
              answers: {},
            };
        const checkout = await checkoutStarter(record, { starterPath: options.starterPath });
        dispose = checkout.dispose;
        log(pc.cyan(`\n${checkout.manifest.starter.name} ${checkout.manifest.starter.version}\n`));
        for (const [name, spec] of Object.entries(checkout.manifest.options)) {
          const current = inProject ? record.answers[name] : spec.default;
          const values = spec.type === 'boolean' ? 'true | false' : (spec.values ?? []).join(' | ');
          log(
            `  ${pc.bold(name.padEnd(18))} ${String(Array.isArray(current) ? current.join(',') || 'none' : current).padEnd(10)} ${pc.dim(values)}`,
          );
          if (spec.label) log(`  ${''.padEnd(18)} ${pc.dim(spec.label)}`);
        }
        log('');
        log(
          pc.dim(
            inProject
              ? 'Change with: next-maker setup --set <option>=<value>'
              : 'Use with: next-maker init --set <option>=<value>',
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
