import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND, type LexicalEditor } from 'lexical';
import type { TeiExtension } from './types.js';

const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? 'Meta'
    : 'Control';

/** Resolve a "Mod+Shift+K" style shortcut string against a keyboard event. */
export function matchesShortcut(shortcut: string, event: KeyboardEvent): boolean {
  const parts = shortcut.split('+').map((p) => p.trim());
  const key = parts.pop()?.toLowerCase() ?? '';

  const needsMod = parts.includes('Mod');
  const needsShift = parts.includes('Shift');
  const needsAlt = parts.includes('Alt');

  const modPressed = needsMod ? (MOD_KEY === 'Meta' ? event.metaKey : event.ctrlKey) : true;
  const shiftPressed = needsShift ? event.shiftKey : !event.shiftKey;
  const altPressed = needsAlt ? event.altKey : !event.altKey;

  return modPressed && shiftPressed && altPressed && event.key.toLowerCase() === key;
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
        if (matchesShortcut(shortcut, event)) {
          event.preventDefault();
          return handler(lexicalEditor);
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
