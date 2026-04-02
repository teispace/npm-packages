import { Command } from 'commander';
import { registerAppCommand } from './app';
import { registerFeatureCommand } from './feature';
import { registerSliceCommand } from './slice';
import { registerServiceCommand } from './service';
import { registerSetupCommand } from './setup';
import { registerPageCommand } from './page';
import { registerComponentCommand } from './component';
import { registerLocaleCommand } from './locale';
import { registerHookCommand } from './hook';

export const registerCommands = (program: Command) => {
  registerAppCommand(program);
  registerSetupCommand(program);
  registerFeatureCommand(program);
  registerSliceCommand(program);
  registerServiceCommand(program);
  registerPageCommand(program);
  registerComponentCommand(program);
  registerLocaleCommand(program);
  registerHookCommand(program);
};
