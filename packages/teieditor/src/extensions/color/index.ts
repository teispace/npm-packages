import { $patchStyleText } from '@lexical/selection';
import { $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

export interface ColorConfig extends ExtensionConfig {
  /** Preset color palette for the picker. */
  colors: string[];
}

const DEFAULT_COLORS = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#b7b7b7',
  '#cccccc',
  '#d9d9d9',
  '#efefef',
  '#f3f3f3',
  '#ffffff',
  '#980000',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#4a86e8',
  '#0000ff',
  '#9900ff',
  '#ff00ff',
  '#e6b8af',
  '#f4cccc',
  '#fce5cd',
  '#fff2cc',
  '#d9ead3',
  '#d0e0e3',
  '#c9daf8',
  '#cfe2f3',
  '#d9d2e9',
  '#ead1dc',
  '#dd7e6b',
  '#ea9999',
  '#f9cb9c',
  '#ffe599',
  '#b6d7a8',
  '#a2c4c9',
  '#a4c2f4',
  '#9fc5e8',
  '#b4a7d6',
  '#d5a6bd',
  '#cc4125',
  '#e06666',
  '#f6b26b',
  '#ffd966',
  '#93c47d',
  '#76a5af',
  '#6d9eeb',
  '#6fa8dc',
  '#8e7cc3',
  '#c27ba0',
];

class ColorExtension extends BaseExtension<ColorConfig> {
  readonly name = 'color';
  protected readonly defaults: ColorConfig = {
    colors: DEFAULT_COLORS,
  };
}

export const Color = new ColorExtension();

/** Set text (foreground) color. */
export function setTextColor(editor: LexicalEditor, color: string): void {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      $patchStyleText(selection, { color: color || null });
    }
  });
}

/** Set background (highlight) color. */
export function setBackgroundColor(editor: LexicalEditor, color: string): void {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      $patchStyleText(selection, { 'background-color': color || null });
    }
  });
}
