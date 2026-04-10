import type { TextFormatType } from 'lexical';
import { TextFormatExtension } from '../text-format-extension.js';

class UnderlineExtension extends TextFormatExtension {
  readonly name = 'underline';
  protected readonly formatType: TextFormatType = 'underline';
  protected readonly defaults = { shortcut: 'Mod+U' };
}

export const Underline = new UnderlineExtension();
