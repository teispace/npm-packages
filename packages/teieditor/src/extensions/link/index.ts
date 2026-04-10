import { $toggleLink, AutoLinkNode, LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { AutoLinkPlugin } from './auto-link-plugin.js';

export interface LinkConfig extends ExtensionConfig {
  /** Enable auto-link detection for URLs and emails. Default: true. */
  autoLink: boolean;
  /** Custom URL validation. Default: basic http/https/mailto check. */
  validateUrl?: (url: string) => boolean;
}

function defaultValidateUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url);
}

class LinkExtension extends BaseExtension<LinkConfig> {
  readonly name = 'link';
  protected readonly defaults: LinkConfig = {
    autoLink: true,
  };

  getNodes(): Array<Klass<LexicalNode>> {
    const nodes: Array<Klass<LexicalNode>> = [LinkNode];
    if (this.config.autoLink) {
      nodes.push(AutoLinkNode);
    }
    return nodes;
  }

  getPlugins(): Array<ComponentType> {
    const validateUrl = this.config.validateUrl ?? defaultValidateUrl;
    const plugins: ComponentType[] = [() => LinkPlugin({ validateUrl })];
    if (this.config.autoLink) {
      plugins.push(AutoLinkPlugin);
    }
    return plugins;
  }

  getKeyBindings(): Record<string, (editor: LexicalEditor) => boolean> {
    return {
      'Mod+K': (editor) => {
        // Toggle link — if text is selected, prompt will be handled by UI
        // For now, dispatch a custom event the toolbar can listen to
        const url = typeof window !== 'undefined' ? window.prompt('Enter URL:') : null;
        if (url) {
          editor.update(() => {
            $toggleLink(url);
          });
        }
        return true;
      },
    };
  }
}

export const Link = new LinkExtension();
export { $toggleLink } from '@lexical/link';
