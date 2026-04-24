import type { Command } from 'commander';
import { registerAppCommand } from './app';
import { registerComponentCommand } from './component';
import { registerFeatureCommand } from './feature';
import { registerHookCommand } from './hook';
import { registerLocaleCommand } from './locale';
import { registerPageCommand } from './page';
import { registerServiceCommand } from './service';
import { registerSetupCommand } from './setup';
import { registerSliceCommand } from './slice';
import { registerTestCommand } from './test';

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
  registerTestCommand(program);
};
