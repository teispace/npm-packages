import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { MaxLengthPlugin } from './max-length-plugin.js';

export interface MaxLengthConfig extends ExtensionConfig {
  /** Maximum character count. Default: Infinity (no limit). */
  maxLength: number;
}

class MaxLengthExtension extends BaseExtension<MaxLengthConfig> {
  readonly name = 'maxLength';
  protected readonly defaults: MaxLengthConfig = { maxLength: Number.POSITIVE_INFINITY };

  getPlugins(): Array<ComponentType> {
    const max = this.config.maxLength;
    if (!Number.isFinite(max)) return [];
    const Plugin = () => MaxLengthPlugin({ maxLength: max });
    Plugin.displayName = 'MaxLengthPluginWrapper';
    return [Plugin];
  }
}

export const MaxLength = new MaxLengthExtension();
