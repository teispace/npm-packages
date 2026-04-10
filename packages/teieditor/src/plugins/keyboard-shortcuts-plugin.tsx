import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { useTeiEditor } from '../core/context.js';

const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? 'Meta'
    : 'Control';

/**
 * Resolves "Mod+B" style shortcut strings into a check function.
 */
function matchesShortcut(shortcut: string, event: KeyboardEvent): boolean {
  const parts = shortcut.split('+').map((p) => p.trim());
  const key = parts.pop()!.toLowerCase();

  const needsMod = parts.includes('Mod');
  const needsShift = parts.includes('Shift');
  const needsAlt = parts.includes('Alt');

  const modPressed = needsMod ? (MOD_KEY === 'Meta' ? event.metaKey : event.ctrlKey) : true;
  const shiftPressed = needsShift ? event.shiftKey : !event.shiftKey;
  const altPressed = needsAlt ? event.altKey : !event.altKey;

  return modPressed && shiftPressed && altPressed && event.key.toLowerCase() === key;
}

/**
 * Plugin that registers keyboard shortcuts from all extensions.
 * Mounted automatically by TeiEditorProvider via extensions' getPlugins().
 */
export function KeyboardShortcutsPlugin(): null {
  const [lexicalEditor] = useLexicalComposerContext();
  const teiEditor = useTeiEditor();

  useEffect(() => {
    // Collect all key bindings from extensions.
    const bindings: Array<{
      shortcut: string;
      handler: (editor: typeof lexicalEditor) => boolean;
    }> = [];

    for (const ext of teiEditor.extensions) {
      const kb = ext.getKeyBindings?.();
      if (kb) {
        for (const [shortcut, handler] of Object.entries(kb)) {
          bindings.push({ shortcut, handler });
        }
      }
    }

    if (bindings.length === 0) return;

    return lexicalEditor.registerCommand(
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
  }, [lexicalEditor, teiEditor.extensions]);

  return null;
}
