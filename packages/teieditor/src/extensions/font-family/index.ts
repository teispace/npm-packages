import { $patchStyleText } from '@lexical/selection';
import { $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

export interface FontFamilyConfig extends ExtensionConfig {
  /** Available font families. */
  families: Array<{ label: string; value: string }>;
}

class FontFamilyExtension extends BaseExtension<FontFamilyConfig> {
  readonly name = 'fontFamily';
  protected readonly defaults: FontFamilyConfig = {
    families: [
      { label: 'Default', value: '' },
      { label: 'Arial', value: 'Arial, sans-serif' },
      { label: 'Courier New', value: '"Courier New", monospace' },
      { label: 'Georgia', value: 'Georgia, serif' },
      { label: 'Times New Roman', value: '"Times New Roman", serif' },
      { label: 'Verdana', value: 'Verdana, sans-serif' },
      { label: 'Roboto', value: 'Roboto, sans-serif' },
      { label: 'Inter', value: 'Inter, sans-serif' },
    ],
  };
}

export const FontFamily = new FontFamilyExtension();

/** Helper to set font family from toolbar. */
export function setFontFamily(editor: LexicalEditor, fontFamily: string): void {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      $patchStyleText(selection, { 'font-family': fontFamily || null });
    }
  });
}
