import type { TextFormatType } from 'lexical';
import { TextFormatExtension } from '../text-format-extension.js';

class BoldExtension extends TextFormatExtension {
  readonly name = 'bold';
  protected readonly formatType: TextFormatType = 'bold';
  protected readonly defaults = { shortcut: 'Mod+B' };
}

export const Bold = new BoldExtension();
