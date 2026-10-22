import {
  COMMAND_PRIORITY_BEFORE_NORMAL,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  mergeRegister,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';

export interface TabFocusOptions {
  /**
   * Tab and Shift-Tab always move focus out of the editor: nothing indents
   * on Tab, not even lists, tables or code. Default false: Tab does what the
   * installed extensions bind it to (lists indent; plain text leaves, see
   * `Indent`'s `tabIndents`).
   */
  always: boolean;
}

/** Whether a key is Tab or Shift-Tab, with no other modifier. */
const isTab = (event: KeyboardEvent) =>
  event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey;

/**
 * Keyboard users can always leave the editor: Escape, then Tab (or
 * Shift-Tab), moves focus to the next (or previous) control, whatever Tab
 * would do in the document, as in CodeMirror and VS Code. With `always`,
 * Tab never indents at all. The browser moves focus itself; the editor
 * only steps aside.
 */
export const TabFocus = defineTeiExtension({
  name: '@teispace/teieditor/tab-focus',
  config: { always: false } as TabFocusOptions,
  register: ({ lexical, options }) => {
    let armed = false;
    // Escape is seen however it is handled (a menu may take it first).
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') armed = true;
      else if (!isTab(event) && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))
        armed = false;
    };
    const stopRoot = lexical.registerRootListener(
      (root: HTMLElement | null, previous: HTMLElement | null) => {
        previous?.removeEventListener('keydown', onKey, true);
        root?.addEventListener('keydown', onKey, true);
        armed = false;
      },
    );
    return mergeRegister(
      stopRoot,
      () => lexical.getRootElement()?.removeEventListener('keydown', onKey, true),
      registerTabFocus(lexical, () => {
        const leave = armed || options.always;
        armed = false;
        return leave;
      }),
    );
  },
});

/** Before every Tab binding but an open menu's: let the browser move focus when `leave()` says so. */
function registerTabFocus(lexical: LexicalEditor, leave: () => boolean): () => void {
  return lexical.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => isTab(event) && leave(),
    COMMAND_PRIORITY_BEFORE_NORMAL,
  );
}
