import type { TextFormatType } from 'lexical';
import { TextFormatExtension } from '../text-format-extension.js';

class InlineCodeExtension extends TextFormatExtension {
  readonly name = 'code';
  protected readonly formatType: TextFormatType = 'code';
  protected readonly defaults = { shortcut: 'Mod+E' };
}

export const InlineCode = new InlineCodeExtension();
