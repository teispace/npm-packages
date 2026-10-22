import { effect } from '@lexical/extension';
import { HistoryExtension } from '@lexical/history';
import { REDO_COMMAND, UNDO_COMMAND } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import { redo, undo } from '../../icons/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    undo: [];
    redo: [];
  }
}

export interface HistoryOptions {
  /** Typing within this many ms merges into one undo step. Default 300. */
  delay: number;
  /** Most undo steps kept; `null` for no limit. Default 300. */
  maxDepth: number | null;
}

const history = (editor: TeiEditor) => editor.extension(HistoryExtension)?.output;

/** Undo and redo: ⌘Z, ⌘⇧Z and ⌃Y. */
export const History = defineTeiExtension({
  name: '@teispace/teieditor/history',
  config: { delay: 300, maxDepth: 300 } as HistoryOptions,
  dependencies: [HistoryExtension],
  commands: {
    undo: {
      run: ({ lexical }) => lexical.dispatchCommand(UNDO_COMMAND, undefined),
      can: ({ editor }) => history(editor)?.canUndo.peek() ?? false,
    },
    redo: {
      run: ({ lexical }) => lexical.dispatchCommand(REDO_COMMAND, undefined),
      can: ({ editor }) => history(editor)?.canRedo.peek() ?? false,
    },
  },
  keymap: {
    undo: { key: 'Mod-z', command: 'undo', description: 'Undo' },
    redo: { key: ['Mod-Shift-z', 'Ctrl-y'], command: 'redo', description: 'Redo' },
  },
  icons: { undo, redo },
  messages: { 'history.undo': 'Undo', 'history.redo': 'Redo' },
  items: [
    {
      id: 'undo',
      label: 'history.undo',
      icon: 'undo',
      in: ['toolbar'],
      group: 'history',
      order: 0,
      shortcut: 'undo',
      command: 'undo',
    },
    {
      id: 'redo',
      label: 'history.redo',
      icon: 'redo',
      in: ['toolbar'],
      group: 'history',
      order: 1,
      shortcut: 'redo',
      command: 'redo',
    },
  ],
  // Our options drive Lexical's history signals, live.
  register: ({ editor, options }) => {
    const output = history(editor);
    if (!output) return;
    return effect(() => {
      output.delay.value = options.delay;
      output.maxDepth.value = options.maxDepth;
    });
  },
});
