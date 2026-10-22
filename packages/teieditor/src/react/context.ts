'use client';

import { createContext, useContext } from 'react';
import type { TeiEditor } from '../core/editor.js';

/** The editor that UI below an `<EditorContent>` or `<EditorProvider>` talks to. */
export const TeiEditorContext = createContext<TeiEditor | null>(null);

/**
 * The editor from the nearest provider. Throws outside one, since every
 * caller needs an editor to do anything; use {@link useOptionalEditor} where
 * there may be none.
 */
export function useCurrentEditor(): TeiEditor {
  const editor = useContext(TeiEditorContext);
  if (!editor) {
    throw new Error(
      'teieditor: no editor here. Render this inside <Editor>, <EditorContent> or <EditorProvider>.',
    );
  }
  return editor;
}

/** The editor from the nearest provider, or `null` outside one. */
export function useOptionalEditor(): TeiEditor | null {
  return useContext(TeiEditorContext);
}
