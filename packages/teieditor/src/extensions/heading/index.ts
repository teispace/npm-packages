import { HeadingNode, type HeadingTagType } from '@lexical/rich-text';
import type { Klass, LexicalNode } from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

export interface HeadingConfig extends ExtensionConfig {
  /** Allowed heading levels. Defaults to all (h1–h6). */
  levels: HeadingTagType[];
}

class HeadingExtension extends BaseExtension<HeadingConfig> {
  readonly name = 'heading';
  protected readonly defaults: HeadingConfig = {
    levels: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  };

  getNodes(): Array<Klass<LexicalNode>> {
    return [HeadingNode];
  }
}

export const Heading = new HeadingExtension();
