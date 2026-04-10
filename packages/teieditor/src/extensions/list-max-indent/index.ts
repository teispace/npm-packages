import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { ListMaxIndentPlugin } from './list-max-indent-plugin.js';

export interface ListMaxIndentConfig extends ExtensionConfig {
  /** Maximum nesting level for lists. Default: 7. */
  maxDepth: number;
}

class ListMaxIndentExtension extends BaseExtension<ListMaxIndentConfig> {
  readonly name = 'listMaxIndent';
  protected readonly defaults: ListMaxIndentConfig = { maxDepth: 7 };

  getPlugins(): Array<ComponentType> {
    const depth = this.config.maxDepth;
    const Plugin = () => ListMaxIndentPlugin({ maxDepth: depth });
    Plugin.displayName = 'ListMaxIndentPluginWrapper';
    return [Plugin];
  }
}

export const ListMaxIndent = new ListMaxIndentExtension();
