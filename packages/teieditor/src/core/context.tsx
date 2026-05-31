'use client';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react';
import { ToolbarProvider } from '../plugins/toolbar-context.js';
import type { TeiEditorInstance } from './types.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TeiEditorContext = createContext<TeiEditorInstance | null>(null);

/**
 * Access the TeiEditor instance from any child component.
 *
 * @example
 * ```tsx
 * const editor = useTeiEditor();
 * console.log(editor.extensions);
 * ```
 */
export function useTeiEditor(): TeiEditorInstance {
  const ctx = useContext(TeiEditorContext);
  if (!ctx) {
    throw new Error('useTeiEditor must be used within <TeiEditorProvider>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface TeiEditorProviderProps {
  /** Instance returned by `createTeiEditor()`. */
  editor: TeiEditorInstance;
  children: ReactNode;
}

/**
 * Wraps children in both the TeiEditor context and Lexical's `<LexicalComposer>`.
 * All extension plugins are automatically mounted. A shared `ToolbarProvider`
 * is included so toolbar, bubble menu, and other components can share state.
 *
 * @example
 * ```tsx
 * <TeiEditorProvider editor={editor}>
 *   <Toolbar />
 *   <EditorContent />
 * </TeiEditorProvider>
 * ```
 */
export function TeiEditorProvider({ editor, children }: TeiEditorProviderProps) {
  const ExtensionPlugins = useMemo(
    () => editor.plugins.map((Plugin, i) => <Plugin key={i} />),
    [editor.plugins],
  );

  return (
    <TeiEditorContext.Provider value={editor}>
      <LexicalComposer initialConfig={editor.composerConfig}>
        <ToolbarProvider>
          <ExtensionLifecycle editor={editor} />
          {ExtensionPlugins}
          {children}
        </ToolbarProvider>
      </LexicalComposer>
    </TeiEditorContext.Provider>
  );
}

/**
 * Drives each extension's `onRegister`/`onDestroy` lifecycle. Rendered inside
 * `<LexicalComposer>` so it can resolve the live Lexical editor. Without this,
 * extensions whose commands live only in `onRegister` (callout, math, datetime,
 * file, layout, figma, twitter, youtube, page-break, …) never register them and
 * their insert commands silently no-op.
 */
function ExtensionLifecycle({ editor }: { editor: TeiEditorInstance }): null {
  const [lexicalEditor] = useLexicalComposerContext();
  const { extensions } = editor;

  useEffect(() => {
    const teardowns: Array<() => void> = [];
    for (const ext of extensions) {
      const cleanup = ext.onRegister?.(lexicalEditor);
      if (typeof cleanup === 'function') teardowns.push(cleanup);
    }
    return () => {
      for (const teardown of teardowns) teardown();
      for (const ext of extensions) ext.onDestroy?.(lexicalEditor);
    };
  }, [lexicalEditor, extensions]);

  return null;
}
