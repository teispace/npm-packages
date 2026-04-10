import type { Klass, LexicalNode } from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { MentionNode } from './mention-node.js';
import { MentionPlugin, type MentionSuggestion } from './mention-plugin.js';

export interface MentionConfig extends ExtensionConfig {
  /** Trigger character. Default: '@'. */
  trigger: string;
  /** Fetch suggestions. Required. */
  onSearch: (query: string) => Promise<MentionSuggestion[]> | MentionSuggestion[];
}

const defaultSearch = (): MentionSuggestion[] => [];

class MentionExtension extends BaseExtension<MentionConfig> {
  readonly name = 'mention';
  protected readonly defaults: MentionConfig = {
    trigger: '@',
    onSearch: defaultSearch,
  };

  getNodes(): Array<Klass<LexicalNode>> {
    return [MentionNode];
  }

  getPlugins(): Array<ComponentType> {
    const { trigger, onSearch } = this.config;
    const Plugin = () => MentionPlugin({ trigger, onSearch });
    Plugin.displayName = 'MentionPluginWrapper';
    return [Plugin];
  }
}

export const Mention = new MentionExtension();
export { $createMentionNode, $isMentionNode, MentionNode } from './mention-node.js';
export type { MentionSuggestion } from './mention-plugin.js';
