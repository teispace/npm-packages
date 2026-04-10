import { CodeHighlightNode, CodeNode } from '@lexical/code';
import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import { $getNodeByKey, COMMAND_PRIORITY_LOW, createCommand, type LexicalCommand } from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { CodeHighlightPlugin } from './code-highlight-plugin.js';

/** Command to change a code block's language. */
export const CHANGE_CODE_LANGUAGE_COMMAND: LexicalCommand<{
  nodeKey: string;
  language: string;
}> = createCommand('CHANGE_CODE_LANGUAGE_COMMAND');

export interface CodeBlockConfig extends ExtensionConfig {
  /** Default language for new code blocks. */
  defaultLanguage: string;
}

class CodeBlockExtension extends BaseExtension<CodeBlockConfig> {
  readonly name = 'codeBlock';
  protected readonly defaults: CodeBlockConfig = {
    defaultLanguage: 'javascript',
  };

  getNodes(): Array<Klass<LexicalNode>> {
    return [CodeNode, CodeHighlightNode];
  }

  getPlugins(): Array<ComponentType> {
    return [CodeHighlightPlugin];
  }

  onRegister(editor: LexicalEditor): (() => void) | void {
    return editor.registerCommand(
      CHANGE_CODE_LANGUAGE_COMMAND,
      ({ nodeKey, language }) => {
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if (node instanceof CodeNode) {
            node.setLanguage(language);
          }
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const CodeBlock = new CodeBlockExtension();
