import type { TextFormatType } from 'lexical';
import { TextFormatExtension } from '../text-format-extension.js';

class SuperscriptExtension extends TextFormatExtension {
  readonly name = 'superscript';
  protected readonly formatType: TextFormatType = 'superscript';
  protected readonly defaults = {};
}

export const Superscript = new SuperscriptExtension();
