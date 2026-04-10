import { AutoLinkNode, LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import { createCommand, type LexicalCommand } from 'lexical';
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

/**
 * Command dispatched by Ctrl+K or toolbar link button.
 * The registry link-editor component listens for this to show the floating editor.
 * If no UI is mounted, this is a no-op.
 */
export const TOGGLE_LINK_EDITOR_COMMAND: LexicalCommand<void> = createCommand(
  'TOGGLE_LINK_EDITOR_COMMAND',
);

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
        // Dispatch command — the registry link-editor component handles the UI
        editor.dispatchCommand(TOGGLE_LINK_EDITOR_COMMAND, undefined);
        return true;
      },
    };
  }
}

export const Link = new LinkExtension();
export { $toggleLink } from '@lexical/link';
