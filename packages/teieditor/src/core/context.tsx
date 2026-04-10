import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
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
          {ExtensionPlugins}
          {children}
        </ToolbarProvider>
      </LexicalComposer>
    </TeiEditorContext.Provider>
  );
}
