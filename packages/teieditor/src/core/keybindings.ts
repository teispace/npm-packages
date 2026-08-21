import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND, type LexicalEditor } from 'lexical';
import type { TeiExtension } from './types.js';

/**
 * Whether this platform uses ⌘ rather than Ctrl for the "Mod" role.
 *
 * Computed per call, NOT once at module scope. The module can be evaluated on
 * the server (the core path is imported by RSC-reachable code), where
 * `navigator.userAgent` on Node is `"Node.js/…"` — a module-level constant
 * would therefore latch `Control` for the lifetime of that module instance and
 * break every ⌘ shortcut for Mac users on any bundle that reused it. The check
 * is a regex over a short string on keydown; it is not worth caching.
 */
function usesMetaKey(): boolean {
  try {
    const nav = (globalThis as { navigator?: { userAgent?: string } }).navigator;
    return typeof nav?.userAgent === 'string' && /Mac|iPhone|iPad/.test(nav.userAgent);
  } catch {
    return false;
  }
}

/**
 * `event.code` (physical key) for the shortcut tokens whose printed character
 * Shift rewrites.
 *
 * This is the fix for a class of silently-dead shortcuts. `event.key` reports
 * the *resulting character*, so on a US layout holding Shift turns `7` into
 * `&`, `8` into `*`, `9` into `(`, `=` into `+`, and `-` into `_`. A shortcut
 * declared as `Mod+Shift+7` compared against `event.key` therefore could never
 * match — five of the seventeen shortcuts shipped in this package were
 * unreachable for exactly this reason (bullet list, numbered list, check list,
 * and both font-size bindings). Letters are unaffected because `Shift+e`
 * produces `E`, which lowercases back to `e`.
 */
const CODE_FOR_TOKEN: Readonly<Record<string, string>> = {
  '0': 'Digit0',
  '1': 'Digit1',
  '2': 'Digit2',
  '3': 'Digit3',
  '4': 'Digit4',
  '5': 'Digit5',
  '6': 'Digit6',
  '7': 'Digit7',
  '8': 'Digit8',
  '9': 'Digit9',
  '=': 'Equal',
  '-': 'Minus',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '\\': 'Backslash',
  '`': 'Backquote',
};

/**
 * Match the final token of a shortcut against an event, by printed character
 * first and physical key second.
 *
 * Checking `event.key` first preserves the existing behaviour for letters and
 * for named keys (`Enter`, `Escape`, `ArrowUp`, …). Falling back to
 * `event.code` rescues the punctuation/digit tokens that Shift rewrites, and
 * also makes those shortcuts work on layouts where the character sits on a
 * different physical key.
 */
function tokenMatches(token: string, event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() === token) return true;
  const code =
    CODE_FOR_TOKEN[token] ??
    (token.length === 1 && token >= 'a' && token <= 'z' ? `Key${token.toUpperCase()}` : undefined);
  return code !== undefined && event.code === code;
}

/** Resolve a "Mod+Shift+K" style shortcut string against a keyboard event. */
export function matchesShortcut(shortcut: string, event: KeyboardEvent): boolean {
  const parts = shortcut.split('+').map((p) => p.trim());
  const key = parts.pop()?.toLowerCase() ?? '';

  const needsMod = parts.includes('Mod');
  const needsShift = parts.includes('Shift');
  const needsAlt = parts.includes('Alt');

  const modPressed = needsMod ? (usesMetaKey() ? event.metaKey : event.ctrlKey) : true;
  const shiftPressed = needsShift ? event.shiftKey : !event.shiftKey;
  const altPressed = needsAlt ? event.altKey : !event.altKey;

  return modPressed && shiftPressed && altPressed && tokenMatches(key, event);
}

/**
 * Tracks editors that already have extension key bindings registered, so the
 * provider's lifecycle and a hand-mounted {@link KeyboardShortcutsPlugin} (both
 * present in the scaffolded registry editors) don't double-register the same
 * shortcuts. First caller wins; the second is a no-op until the first
 * unregisters. WeakSet so it never pins an editor in memory.
 */
const editorsWithBindings = new WeakSet<LexicalEditor>();

/**
 * Register every extension's `getKeyBindings()` against the editor's
 * `KEY_DOWN_COMMAND`. Returns an unregister function (or a no-op when no
 * extension declares a binding, or when bindings are already registered for this
 * editor). Shared by {@link KeyboardShortcutsPlugin} and the provider's
 * lifecycle so the headless core path gets shortcuts too — they used to be dead
 * there because the plugin was never mounted automatically.
 */
export function registerExtensionKeyBindings(
  lexicalEditor: LexicalEditor,
  extensions: ReadonlyArray<TeiExtension>,
): () => void {
  // Idempotency guard: avoid two KEY_DOWN handlers for the same editor.
  if (editorsWithBindings.has(lexicalEditor)) return () => {};

  const bindings: Array<{
    shortcut: string;
    handler: (editor: LexicalEditor) => boolean;
  }> = [];

  for (const ext of extensions) {
    const kb = ext.getKeyBindings?.();
    if (kb) {
      for (const [shortcut, handler] of Object.entries(kb)) {
        bindings.push({ shortcut, handler });
      }
    }
  }

  if (bindings.length === 0) return () => {};

  editorsWithBindings.add(lexicalEditor);
  const unregister = lexicalEditor.registerCommand(
    KEY_DOWN_COMMAND,
    (event: KeyboardEvent) => {
      for (const { shortcut, handler } of bindings) {
        if (!matchesShortcut(shortcut, event)) continue;
        // Only suppress the browser default once the handler has actually
        // claimed the event. Calling preventDefault() first meant a handler
        // that declined (returned false) still swallowed the native behaviour —
        // the keystroke did nothing at all instead of falling through.
        const handled = handler(lexicalEditor);
        if (handled) {
          event.preventDefault();
          return true;
        }
      }
      return false;
    },
    COMMAND_PRIORITY_HIGH,
  );
  return () => {
    editorsWithBindings.delete(lexicalEditor);
    unregister();
  };
}
