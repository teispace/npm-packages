import { Command } from 'commander';
import pc from 'picocolors';
import { log } from '../config';

export const registerFeatureCommand = (program: Command) => {
  program
    .command('feature [name]')
    .description('Generate a new feature module')
    .action(async () => {
      log(pc.yellow('Feature generation will be available soon!'));
    });
};
