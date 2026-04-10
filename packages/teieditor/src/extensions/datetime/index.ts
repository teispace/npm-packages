import type { LexicalEditor } from 'lexical';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

export interface DateTimeConfig extends ExtensionConfig {
  /** Date format. Default: 'YYYY-MM-DD'. */
  format: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'locale';
}

export const INSERT_DATETIME_COMMAND: LexicalCommand<'date' | 'time' | 'datetime'> =
  createCommand('INSERT_DATETIME_COMMAND');

function formatDate(type: 'date' | 'time' | 'datetime', fmt: DateTimeConfig['format']): string {
  const now = new Date();
  if (type === 'time') return now.toLocaleTimeString();
  if (type === 'datetime') return now.toLocaleString();
  if (fmt === 'locale') return now.toLocaleDateString();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  if (fmt === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
  if (fmt === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
  return `${y}-${m}-${d}`;
}

class DateTimeExtension extends BaseExtension<DateTimeConfig> {
  readonly name = 'datetime';
  protected readonly defaults: DateTimeConfig = { format: 'YYYY-MM-DD' };

  onRegister(editor: LexicalEditor): (() => void) | void {
    return editor.registerCommand(
      INSERT_DATETIME_COMMAND,
      (type) => {
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const text = formatDate(type, this.config.format);
          sel.insertNodes([$createTextNode(text)]);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const DateTime = new DateTimeExtension();
