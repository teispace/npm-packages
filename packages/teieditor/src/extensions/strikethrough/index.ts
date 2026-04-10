import type { TextFormatType } from 'lexical';
import { TextFormatExtension } from '../text-format-extension.js';

class StrikethroughExtension extends TextFormatExtension {
  readonly name = 'strikethrough';
  protected readonly formatType: TextFormatType = 'strikethrough';
  protected readonly defaults = { shortcut: 'Mod+Shift+S' };
}

export const Strikethrough = new StrikethroughExtension();
