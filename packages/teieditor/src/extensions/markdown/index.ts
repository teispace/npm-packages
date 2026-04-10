import type { ComponentType } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { MarkdownShortcutsPlugin } from './markdown-shortcuts-plugin.js';

export interface MarkdownConfig extends ExtensionConfig {
  /** Enable live markdown shortcuts (# → heading, etc.). Default: true. */
  shortcuts: boolean;
}

class MarkdownExtension extends BaseExtension<MarkdownConfig> {
  readonly name = 'markdown';
  protected readonly defaults: MarkdownConfig = { shortcuts: true };

  getPlugins(): Array<ComponentType> {
    if (!this.config.shortcuts) return [];
    return [MarkdownShortcutsPlugin];
  }
}

export const Markdown = new MarkdownExtension();
export { htmlToMarkdown, markdownToHtml } from './serialization.js';
