import type { Klass, LexicalNode } from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { HorizontalRuleNode, HorizontalRulePlugin } from './plugin.js';

class HorizontalRuleExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'horizontalRule';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [HorizontalRuleNode];
  }

  getPlugins(): Array<ComponentType> {
    return [HorizontalRulePlugin];
  }
}

export const HorizontalRule = new HorizontalRuleExtension();
