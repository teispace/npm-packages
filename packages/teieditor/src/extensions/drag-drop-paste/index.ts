import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { DragDropPastePlugin } from './drag-drop-paste-plugin.js';

export interface DragDropPasteConfig extends ExtensionConfig {
  /** Upload handler for dropped/pasted files. Returns URL. */
  onUpload?: (file: File) => Promise<string>;
}

class DragDropPasteExtension extends BaseExtension<DragDropPasteConfig> {
  readonly name = 'dragDropPaste';
  protected readonly defaults: DragDropPasteConfig = {};

  getPlugins(): Array<ComponentType> {
    const upload = this.config.onUpload;
    const Plugin = () => DragDropPastePlugin({ onUpload: upload });
    Plugin.displayName = 'DragDropPastePluginWrapper';
    return [Plugin];
  }
}

export const DragDropPaste = new DragDropPasteExtension();
