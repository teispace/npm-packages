import { Command } from 'commander';
import { registerAppCommand } from './app';
import { registerFeatureCommand } from './feature';
import { registerSliceCommand } from './slice';
import { registerServiceCommand } from './service';

export const registerCommands = (program: Command) => {
  registerAppCommand(program);
  registerFeatureCommand(program);
  registerSliceCommand(program);
  registerServiceCommand(program);
};
