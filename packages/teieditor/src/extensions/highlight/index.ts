import type { TextFormatType } from 'lexical';
import { TextFormatExtension } from '../text-format-extension.js';

class HighlightExtension extends TextFormatExtension {
  readonly name = 'highlight';
  protected readonly formatType: TextFormatType = 'highlight';
  protected readonly defaults = { shortcut: 'Mod+Shift+H' };
}

export const Highlight = new HighlightExtension();
