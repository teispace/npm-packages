import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { TocPlugin } from './toc-plugin.js';

export interface TocConfig extends ExtensionConfig {
  /** Minimum heading level to include. Default: 1 (h1). */
  minLevel: number;
  /** Maximum heading level to include. Default: 3 (h3). */
  maxLevel: number;
}

class TocExtension extends BaseExtension<TocConfig> {
  readonly name = 'toc';
  protected readonly defaults: TocConfig = { minLevel: 1, maxLevel: 3 };

  getPlugins(): Array<ComponentType> {
    return [TocPlugin];
  }
}

export const Toc = new TocExtension();
export { TocPlugin, useToc } from './toc-plugin.js';
