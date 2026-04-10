import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { defaultSlashCommands } from './default-commands.js';
import { SlashCommandPlugin } from './slash-command-plugin.js';
import type { SlashCommandItem } from './types.js';

export interface SlashCommandConfig extends ExtensionConfig {
  /** Commands available in the slash menu. */
  commands: SlashCommandItem[];
}

class SlashCommandExtension extends BaseExtension<SlashCommandConfig> {
  readonly name = 'slashCommand';
  protected readonly defaults: SlashCommandConfig = {
    commands: defaultSlashCommands,
  };

  getPlugins(): Array<ComponentType> {
    const commands = this.config.commands;
    // Wrap to pass commands prop
    const Plugin = () => SlashCommandPlugin({ commands });
    Plugin.displayName = 'SlashCommandPluginWrapper';
    return [Plugin];
  }
}

export const SlashCommand = new SlashCommandExtension();
export { defaultSlashCommands } from './default-commands.js';
export type { SlashCommandItem } from './types.js';
