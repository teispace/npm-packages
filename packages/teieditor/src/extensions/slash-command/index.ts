import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { defaultSlashCommands } from './default-commands.js';
import { SlashCommandPlugin, type SlashCommandPluginProps } from './slash-command-plugin.js';
import type { SlashCommandItem } from './types.js';

export interface SlashCommandConfig extends ExtensionConfig {
  /** Commands available in the slash menu. */
  commands: SlashCommandItem[];
  /** Custom render function for the menu UI. Registry components provide this. */
  menuRenderFn?: SlashCommandPluginProps['menuRenderFn'];
}

class SlashCommandExtension extends BaseExtension<SlashCommandConfig> {
  readonly name = 'slashCommand';
  protected readonly defaults: SlashCommandConfig = {
    commands: defaultSlashCommands,
  };

  getPlugins(): Array<ComponentType> {
    const { commands, menuRenderFn } = this.config;
    const Plugin = () => SlashCommandPlugin({ commands, menuRenderFn });
    Plugin.displayName = 'SlashCommandPluginWrapper';
    return [Plugin];
  }
}

export const SlashCommand = new SlashCommandExtension();
export { defaultSlashCommands } from './default-commands.js';
export type { SlashCommandPluginProps } from './slash-command-plugin.js';
export { SlashCommandOption } from './slash-command-plugin.js';
export type { SlashCommandItem } from './types.js';
