import type { TextFormatType } from 'lexical';
import { TextFormatExtension } from '../text-format-extension.js';

class ItalicExtension extends TextFormatExtension {
  readonly name = 'italic';
  protected readonly formatType: TextFormatType = 'italic';
  protected readonly defaults = { shortcut: 'Mod+I' };
}

export const Italic = new ItalicExtension();
