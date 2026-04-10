import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

export interface HistoryConfig extends ExtensionConfig {
  /** Delay in ms before a new history entry is created. Default: 300. */
  delay: number;
}

class HistoryExtension extends BaseExtension<HistoryConfig> {
  readonly name = 'history';
  protected readonly defaults: HistoryConfig = { delay: 300 };

  getPlugins(): Array<ComponentType> {
    return [HistoryPlugin];
  }
}

export const History = new HistoryExtension();
