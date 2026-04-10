import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { PlaceholderPlugin } from './placeholder-plugin.js';

export interface PlaceholderConfig extends ExtensionConfig {
  /** Placeholder text map by block type. */
  placeholders: Record<string, string>;
}

const DEFAULT_PLACEHOLDERS: Record<string, string> = {
  root: 'Start writing, or type "/" for commands...',
  paragraph: "Type '/' for commands...",
  heading: 'Heading',
  quote: 'Enter a quote...',
  code: 'Write code...',
};

class PlaceholderExtension extends BaseExtension<PlaceholderConfig> {
  readonly name = 'placeholder';
  protected readonly defaults: PlaceholderConfig = {
    placeholders: DEFAULT_PLACEHOLDERS,
  };

  getPlugins(): Array<ComponentType> {
    const placeholders = this.config.placeholders;
    const Plugin = () => PlaceholderPlugin({ placeholders });
    Plugin.displayName = 'PlaceholderPluginWrapper';
    return [Plugin];
  }
}

export const Placeholder = new PlaceholderExtension();
