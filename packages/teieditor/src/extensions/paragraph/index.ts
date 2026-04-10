import { type Klass, type LexicalNode, ParagraphNode } from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

class ParagraphExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'paragraph';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [ParagraphNode];
  }
}

export const Paragraph = new ParagraphExtension();
