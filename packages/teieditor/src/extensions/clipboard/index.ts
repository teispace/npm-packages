import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  COPY_COMMAND,
  CUT_COMMAND,
  type LexicalEditor,
  PASTE_COMMAND,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiKeyBinding } from '../../core/types.js';
import { copy, cut, paste, pastePlain } from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    cut: [];
    copy: [];
    /** Paste what the clipboard holds, as ⌘V does. Asks the browser to read it. */
    paste: [];
    /** Paste the clipboard's text only, as ⌘⇧V does. */
    pastePlain: [];
  }
}

export interface ClipboardOptions {
  /**
   * Read the clipboard for Paste and Paste as plain text: `null` when it
   * cannot (the browser said no). Default: the Clipboard API. Swap it for a
   * desktop shell's own clipboard, say.
   */
  read: (plain: boolean) => Promise<DataTransfer | null>;
}

/** Types a paste understands: what the Clipboard API hands a page. */
const TEXT_TYPES = new Set(['text/html', 'text/plain']);

/** The clipboard through the Clipboard API, as a paste event would carry it. */
export async function readClipboard(plain: boolean): Promise<DataTransfer | null> {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard || typeof DataTransfer !== 'function') return null;
  const data = new DataTransfer();
  try {
    if (plain || typeof clipboard.read !== 'function') {
      data.setData('text/plain', await clipboard.readText());
      return data;
    }
    for (const item of await clipboard.read()) {
      for (const type of item.types) {
        const blob = await item.getType(type);
        if (TEXT_TYPES.has(type)) data.setData(type, await blob.text());
        else if (type.startsWith('image/')) {
          data.items.add(new File([blob], `pasted.${type.slice(6)}`, { type }));
        }
      }
    }
  } catch {
    // Refused (no permission, or the user dismissed the browser's prompt).
    return null;
  }
  return data;
}

/** Paste `data` through the editor's own paste handling: links offer embeds, images upload. */
function pasteData(lexical: LexicalEditor, data: DataTransfer): void {
  const event = new ClipboardEvent('paste', { clipboardData: data, cancelable: true });
  // Safari leaves out `clipboardData` from the constructor.
  if (event.clipboardData !== data) Object.defineProperty(event, 'clipboardData', { value: data });
  lexical.dispatchCommand(PASTE_COMMAND, event);
}

const $hasContent = () => {
  const selection = $getSelection();
  return (
    ($isRangeSelection(selection) && !selection.isCollapsed()) ||
    ($isNodeSelection(selection) && selection.getNodes().length > 0)
  );
};

/** A key the browser handles: the binding passes it on (`false`), and only names it. */
const hint = (key: string, description: string): TeiKeyBinding => ({
  key,
  command: () => false,
  description,
});

const $canPaste = (editor: TeiEditor) => editor.isEditable && $getSelection() !== null;

/**
 * Cut, Copy, Paste and Paste as plain text as commands and menu items, for
 * the context menu (and any button of your own). The keys are the
 * browser's own; these are for when there is no key to press.
 */
export const Clipboard = defineTeiExtension({
  name: '@teispace/teieditor/clipboard',
  dependencies: [RichText],
  config: { read: readClipboard } as ClipboardOptions,
  commands: {
    // Lexical writes the clipboard itself when there is no event to write to.
    cut: {
      run: ({ lexical }) => lexical.dispatchCommand(CUT_COMMAND, null),
      can: ({ editor }) => editor.isEditable && $hasContent(),
    },
    copy: {
      run: ({ lexical }) => lexical.dispatchCommand(COPY_COMMAND, null),
      can: () => $hasContent(),
    },
    paste: {
      run: ({ editor, lexical, options }) => {
        void options.read(false).then((data) => {
          if (data) pasteData(lexical, data);
          else editor.announce(editor.t('clipboard.blocked'));
        });
        return true;
      },
      can: ({ editor }) => $canPaste(editor),
    },
    pastePlain: {
      run: ({ editor, lexical, options }) => {
        void options.read(true).then((data) => {
          if (data) pasteData(lexical, data);
          else editor.announce(editor.t('clipboard.blocked'));
        });
        return true;
      },
      can: ({ editor }) => $canPaste(editor),
    },
  },
  // The browser's own keys: named so menus show them, left to the browser.
  keymap: {
    cut: hint('Mod-x', 'Cut'),
    copy: hint('Mod-c', 'Copy'),
    paste: hint('Mod-v', 'Paste'),
    pastePlain: hint('Mod-Shift-v', 'Paste as plain text'),
  },
  icons: { cut, copy, paste, pastePlain },
  messages: {
    'clipboard.cut': 'Cut',
    'clipboard.copy': 'Copy',
    'clipboard.paste': 'Paste',
    'clipboard.pastePlain': 'Paste as plain text',
    'clipboard.blocked':
      'The browser would not let the editor read the clipboard. Paste with the keyboard instead.',
  },
  items: (['cut', 'copy', 'paste', 'pastePlain'] as const).map((id, order) => ({
    id,
    label: `clipboard.${id}`,
    icon: id,
    in: ['contextMenu'],
    group: 'clipboard',
    order,
    shortcut: id,
    command: id,
  })),
});
