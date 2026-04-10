import { QuoteNode } from '@lexical/rich-text';
import type { Klass, LexicalNode } from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

class BlockquoteExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'blockquote';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [QuoteNode];
  }
}

export const Blockquote = new BlockquoteExtension();
