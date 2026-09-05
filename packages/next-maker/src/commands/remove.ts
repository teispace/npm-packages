import type { Command } from 'commander';
import pc from 'picocolors';
import { logError } from '../config';

/**
 * `remove <feature>` is `setup --set <feature>=false` for boolean options.
 * Kept as a command for discoverability; choice options (state, http) are
 * changed with `setup --set`.
 */
export const registerRemoveCommand = (program: Command) => {
  program
    .command('remove <feature>')
    .alias('uninstall')
    .description('Turn a boolean starter feature off (shorthand for `setup --set <feature>=false`)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .option('--dry-run', 'Print the plan without writing')
    .option('--no-install', 'Skip dependency installation after the change')
    .action(
      async (feature: string, options: { yes?: boolean; dryRun?: boolean; install?: boolean }) => {
        try {
          const args = ['setup', '--set', `${feature}=false`];
          if (options.yes) args.push('--yes');
          if (options.dryRun) args.push('--dry-run');
          if (options.install === false) args.push('--no-install');
          await program.parseAsync([process.argv[0], process.argv[1], ...args]);
        } catch (error) {
          logError(`${error instanceof Error ? error.message : error}`);
          process.exit(1);
        }
      },
    )
    .addHelpText('after', `\n${pc.dim('Example: next-maker remove ws')}\n`);
};
