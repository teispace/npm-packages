import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import {
  $createParagraphNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import { $getOrCreateRangeSelection } from '../../core/insert.js';
import type { ExtensionConfig } from '../../core/types.js';
import { EmbedCommandPlugin } from './embed-command-plugin.js';
import { $createEmbedNode, EmbedNode } from './embed-node.js';

export interface EmbedConfig extends ExtensionConfig {
  /** Additional embed type detectors. */
  customDetectors?: Array<(url: string) => string | null>;
}

export const INSERT_EMBED_COMMAND: LexicalCommand<string> = createCommand('INSERT_EMBED_COMMAND');

class EmbedExtension extends BaseExtension<EmbedConfig> {
  readonly name = 'embed';
  protected readonly defaults: EmbedConfig = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [EmbedNode];
  }

  getPlugins(): Array<ComponentType> {
    return [EmbedCommandPlugin];
  }

  onRegister(editor: LexicalEditor): (() => void) | undefined {
    return editor.registerCommand(
      INSERT_EMBED_COMMAND,
      (url) => {
        editor.update(() => {
          const selection = $getOrCreateRangeSelection();
          if (!selection) return;
          const node = $createEmbedNode(url);
          selection.insertNodes([node]);
          const paragraph = $createParagraphNode();
          node.insertAfter(paragraph);
          paragraph.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const Embed = new EmbedExtension();
export { $createEmbedNode, $isEmbedNode, EmbedNode, type EmbedType } from './embed-node.js';
