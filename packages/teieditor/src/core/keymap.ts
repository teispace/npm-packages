import {
  CONTROL_OR_META,
  type KeyboardEventModifierMask,
  type KeyboardShortcutMatch,
} from 'lexical';

/**
 * What Shift turns each key into on a US layout. `event.key` reports the
 * shifted character, so `Mod-Shift-7` arrives as `&`; a binding with Shift
 * also matches its shifted character, or it could never fire.
 */
const SHIFTED: Readonly<Record<string, string>> = {
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
  '[': '{',
  ']': '}',
  '\\': '|',
  ';': ':',
  "'": '"',
  ',': '<',
  '.': '>',
  '/': '?',
  '`': '~',
};

const NAMED_KEYS: Readonly<Record<string, string>> = {
  space: ' ',
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

/**
 * Parse `'Mod-Shift-k'` into the key-and-modifier form Lexical matches on.
 * `Mod` is ⌘ on Apple platforms and Ctrl elsewhere; `Ctrl`, `Meta`/`Cmd`,
 * `Alt`/`Option` and `Shift` name the physical modifiers. A key may be
 * written `-` itself as the last segment (`'Mod--'`). Every modifier not
 * named must be up.
 */
export function parseKey(binding: string): KeyboardShortcutMatch[] {
  const parts = binding.split(/-(?!$)/);
  const raw = parts.pop();
  if (!raw) throw new Error(`teieditor: empty key in "${binding}"`);
  const modifiers: KeyboardEventModifierMask = {};
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'mod':
        Object.assign(modifiers, CONTROL_OR_META);
        break;
      case 'ctrl':
      case 'control':
        modifiers.ctrlKey = true;
        break;
      case 'meta':
      case 'cmd':
        modifiers.metaKey = true;
        break;
      case 'alt':
      case 'option':
        modifiers.altKey = true;
        break;
      case 'shift':
        modifiers.shiftKey = true;
        break;
      default:
        throw new Error(`teieditor: unknown modifier "${part}" in "${binding}"`);
    }
  }
  const key = NAMED_KEYS[raw.toLowerCase()] ?? raw;
  const match: KeyboardShortcutMatch = { key, modifiers };
  const shifted = modifiers.shiftKey ? SHIFTED[key] : undefined;
  return shifted
    ? [
        { ...match, unshiftedKey: key },
        { key: shifted, modifiers, unshiftedKey: key },
      ]
    : [match];
}
