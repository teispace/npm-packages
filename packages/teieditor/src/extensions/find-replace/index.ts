import type { LexicalEditor } from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { FindReplacePlugin } from './find-replace-plugin.js';

export interface FindReplaceConfig extends ExtensionConfig {
  /** Keyboard shortcut to open. Default: Mod+F. */
  shortcut: string;
}

class FindReplaceExtension extends BaseExtension<FindReplaceConfig> {
  readonly name = 'findReplace';
  protected readonly defaults: FindReplaceConfig = { shortcut: 'Mod+F' };

  getPlugins(): Array<ComponentType> {
    return [FindReplacePlugin];
  }

  getKeyBindings(): Record<string, (editor: LexicalEditor) => boolean> {
    return {
      [this.config.shortcut]: () => {
        // The plugin handles the UI toggle via a custom event
        window.dispatchEvent(new CustomEvent('tei-find-replace-toggle'));
        return true;
      },
    };
  }
}

export const FindReplace = new FindReplaceExtension();
