import { $patchStyleText } from '@lexical/selection';
import { $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

export interface FontSizeConfig extends ExtensionConfig {
  /** Available font sizes in px. */
  sizes: string[];
  /** Default font size. */
  defaultSize: string;
}

class FontSizeExtension extends BaseExtension<FontSizeConfig> {
  readonly name = 'fontSize';
  protected readonly defaults: FontSizeConfig = {
    sizes: [
      '12px',
      '14px',
      '16px',
      '18px',
      '20px',
      '24px',
      '28px',
      '32px',
      '36px',
      '48px',
      '64px',
      '72px',
    ],
    defaultSize: '16px',
  };

  getKeyBindings(): Record<string, (editor: LexicalEditor) => boolean> {
    return {
      'Mod+Shift+=': (editor) => {
        applyFontSizeDelta(editor, 2);
        return true;
      },
      'Mod+Shift+-': (editor) => {
        applyFontSizeDelta(editor, -2);
        return true;
      },
    };
  }
}

function applyFontSizeDelta(editor: LexicalEditor, delta: number): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    $patchStyleText(selection, {
      'font-size': (currentValue) => {
        const current = parseInt(currentValue || '16', 10);
        const next = Math.max(8, Math.min(120, current + delta));
        return `${next}px`;
      },
    });
  });
}

export const FontSize = new FontSizeExtension();

/** Helper to set a specific font size from toolbar. */
export function setFontSize(editor: LexicalEditor, size: string): void {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      $patchStyleText(selection, { 'font-size': size });
    }
  });
}
