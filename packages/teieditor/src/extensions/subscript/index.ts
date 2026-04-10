import type { TextFormatType } from 'lexical';
import { TextFormatExtension } from '../text-format-extension.js';

class SubscriptExtension extends TextFormatExtension {
  readonly name = 'subscript';
  protected readonly formatType: TextFormatType = 'subscript';
  protected readonly defaults = {};
}

export const Subscript = new SubscriptExtension();
