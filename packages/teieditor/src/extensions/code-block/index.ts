import { CodeHighlightNode, CodeNode } from '@lexical/code';
import type { Klass, LexicalNode } from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { CodeHighlightPlugin } from './code-highlight-plugin.js';

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
}

export const CodeBlock = new CodeBlockExtension();
