import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { DragHandlePlugin } from './drag-handle-plugin.js';

export interface DragHandleConfig extends ExtensionConfig {
  /** CSS class for the drag handle element. */
  handleClass: string;
}

class DragHandleExtension extends BaseExtension<DragHandleConfig> {
  readonly name = 'dragHandle';
  protected readonly defaults: DragHandleConfig = {
    handleClass: 'tei-drag-handle',
  };

  getPlugins(): Array<ComponentType> {
    return [DragHandlePlugin];
  }
}

export const DragHandle = new DragHandleExtension();
