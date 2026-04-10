import {
  type ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  INDENT_CONTENT_COMMAND,
  type LexicalEditor,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

export interface AlignmentConfig extends ExtensionConfig {
  /** Allowed alignments. Default: all. */
  alignments: ElementFormatType[];
}

class AlignmentExtension extends BaseExtension<AlignmentConfig> {
  readonly name = 'alignment';
  protected readonly defaults: AlignmentConfig = {
    alignments: ['left', 'center', 'right', 'justify'],
  };

  getKeyBindings(): Record<string, (editor: LexicalEditor) => boolean> {
    return {
      'Mod+Shift+L': (editor) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left');
        return true;
      },
      'Mod+Shift+E': (editor) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center');
        return true;
      },
      'Mod+Shift+R': (editor) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right');
        return true;
      },
      'Mod+Shift+J': (editor) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify');
        return true;
      },
      Tab: (editor) => {
        editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
        return true;
      },
      'Shift+Tab': (editor) => {
        editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
        return true;
      },
    };
  }
}

export const Alignment = new AlignmentExtension();

// Re-export for toolbar usage
export { FORMAT_ELEMENT_COMMAND, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical';
