import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import type { EmojiItem } from './emoji-data.js';
import { EmojiPlugin } from './emoji-plugin.js';

export interface EmojiConfig extends ExtensionConfig {
  /** Additional emoji items. */
  extraEmojis: EmojiItem[];
}

class EmojiExtension extends BaseExtension<EmojiConfig> {
  readonly name = 'emoji';
  protected readonly defaults: EmojiConfig = { extraEmojis: [] };

  getPlugins(): Array<ComponentType> {
    const extra = this.config.extraEmojis;
    const Plugin = () => EmojiPlugin({ extraEmojis: extra });
    Plugin.displayName = 'EmojiPluginWrapper';
    return [Plugin];
  }
}

export const Emoji = new EmojiExtension();
export type { EmojiItem } from './emoji-data.js';
export { EMOJI_LIST } from './emoji-data.js';
