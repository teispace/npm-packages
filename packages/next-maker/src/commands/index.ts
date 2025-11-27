import { Command } from 'commander';
import { registerAppCommand } from './app';
import { registerFeatureCommand } from './feature';

export const registerCommands = (program: Command) => {
  registerAppCommand(program);
  registerFeatureCommand(program);
};
