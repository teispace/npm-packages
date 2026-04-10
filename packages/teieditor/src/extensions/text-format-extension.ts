import { FORMAT_TEXT_COMMAND, type LexicalEditor, type TextFormatType } from 'lexical';
import { BaseExtension } from '../core/extension.js';
import type { ExtensionConfig } from '../core/types.js';

export interface TextFormatConfig extends ExtensionConfig {
  /** Keyboard shortcut, e.g. "Mod+B". Mod = Ctrl on Win, Cmd on Mac. */
  shortcut?: string;
}

/**
 * Shared base for simple text-format extensions (bold, italic, etc.).
 * Each subclass only needs to specify the name and Lexical format type.
 */
export abstract class TextFormatExtension extends BaseExtension<TextFormatConfig> {
  protected abstract readonly formatType: TextFormatType;
  protected readonly defaults: TextFormatConfig = {};

  getKeyBindings(): Record<string, (editor: LexicalEditor) => boolean> {
    const shortcut = this.config.shortcut;
    if (!shortcut) return {};
    return {
      [shortcut]: (editor) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, this.formatType);
        return true;
      },
    };
  }
}
