import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { WordCountPlugin } from './word-count-plugin.js';

export interface WordCountConfig extends ExtensionConfig {
  /** Show character count alongside word count. Default: true. */
  showCharacters: boolean;
}

class WordCountExtension extends BaseExtension<WordCountConfig> {
  readonly name = 'wordCount';
  protected readonly defaults: WordCountConfig = { showCharacters: true };

  getPlugins(): Array<ComponentType> {
    const cfg = this.config;
    const Plugin = () => WordCountPlugin({ showCharacters: cfg.showCharacters });
    Plugin.displayName = 'WordCountPluginWrapper';
    return [Plugin];
  }
}

export const WordCount = new WordCountExtension();
