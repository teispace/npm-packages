'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { useTeiEditor } from '../core/context.js';
import { registerExtensionKeyBindings } from '../core/keybindings.js';

/**
 * Plugin that registers keyboard shortcuts from all extensions.
 *
 * `TeiEditorProvider` already wires extension key bindings on the headless core
 * path, so you only need this component in hand-assembled `<LexicalComposer>`
 * trees (e.g. the scaffolded registry editors) that don't use the provider's
 * lifecycle. Mounting it alongside the provider is harmless — bindings are
 * registered idempotently per editor instance.
 */
export function KeyboardShortcutsPlugin(): null {
  const [lexicalEditor] = useLexicalComposerContext();
  const teiEditor = useTeiEditor();

  useEffect(
    () => registerExtensionKeyBindings(lexicalEditor, teiEditor.extensions),
    [lexicalEditor, teiEditor.extensions],
  );

  return null;
}
