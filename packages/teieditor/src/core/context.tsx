'use client';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { ToolbarProvider } from '../plugins/toolbar-context.js';
import { registerExtensionKeyBindings } from './keybindings.js';
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
// Chrome slot
//
// Extension plugins are mounted by the provider *before* `children` so that
// their Lexical command registrations keep priority over the rich-text plugin
// and the editors' own plugins. That ordering is deliberate and must not
// change — but it means an extension plugin that renders **visible** chrome
// (WordCount's status bar being the only one today) would paint above the
// toolbar and the content, which is never where a status bar belongs.
//
// Rather than reorder the mount (behaviour-changing) or strip WordCount out of
// StarterKit (feature-losing, and it just moves the problem to the next
// chrome-rendering extension), extensions portal their chrome into a slot the
// host places deliberately. No slot mounted → no chrome, so a bare
// `<TeiEditorProvider>` never sprouts UI the host did not ask for.
// ---------------------------------------------------------------------------

interface ChromeSlotContextValue {
  element: HTMLElement | null;
  register: (element: HTMLElement | null) => void;
}

const TeiChromeSlotContext = createContext<ChromeSlotContextValue | null>(null);

/** What {@link useTeiChromeSlot} reports to a chrome-rendering plugin. */
export interface TeiChromeSlot {
  /** True when rendered inside a `<TeiEditorProvider>`. */
  inProvider: boolean;
  /** The mounted `<TeiEditorSlot>` element, or `null` if none is mounted. */
  element: HTMLElement | null;
}

/**
 * Resolve the chrome slot for an extension plugin that renders visible UI.
 *
 * Recommended usage — portal into the slot when there is one, fall back to
 * rendering inline only when used standalone (outside `<TeiEditorProvider>`):
 *
 * ```tsx
 * const slot = useTeiChromeSlot();
 * const bar = <div className="…">…</div>;
 * if (!slot.inProvider) return bar;
 * return slot.element ? createPortal(bar, slot.element) : null;
 * ```
 */
export function useTeiChromeSlot(): TeiChromeSlot {
  const ctx = useContext(TeiChromeSlotContext);
  return { inProvider: ctx !== null, element: ctx?.element ?? null };
}

export interface TeiEditorSlotProps {
  className?: string;
}

/**
 * Placement target for extension chrome (today: the WordCount status bar).
 * Render it inside `<TeiEditorProvider>` wherever that chrome belongs —
 * typically as the last child of the editor wrapper.
 *
 * @example
 * ```tsx
 * <TeiEditorProvider editor={editor}>
 *   <Toolbar />
 *   <EditorContent />
 *   <TeiEditorSlot />
 * </TeiEditorProvider>
 * ```
 */
export function TeiEditorSlot({ className }: TeiEditorSlotProps) {
  const ctx = useContext(TeiChromeSlotContext);
  if (!ctx) {
    throw new Error('<TeiEditorSlot> must be used within <TeiEditorProvider>');
  }
  // `register` is a `useState` setter, so its identity is stable and React
  // will not detach/reattach the ref on every render.
  return <div className={className} data-tei-slot="chrome" ref={ctx.register} />;
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

  const [slotElement, setSlotElement] = useState<HTMLElement | null>(null);
  const chromeSlot = useMemo<ChromeSlotContextValue>(
    () => ({ element: slotElement, register: setSlotElement }),
    [slotElement],
  );

  return (
    <TeiEditorContext.Provider value={editor}>
      <LexicalComposer initialConfig={editor.composerConfig}>
        <TeiChromeSlotContext.Provider value={chromeSlot}>
          <ToolbarProvider>
            <ExtensionLifecycle editor={editor} />
            {ExtensionPlugins}
            {children}
          </ToolbarProvider>
        </TeiChromeSlotContext.Provider>
      </LexicalComposer>
    </TeiEditorContext.Provider>
  );
}

/**
 * Drives each extension's `onRegister`/`onDestroy` lifecycle AND registers their
 * keyboard shortcuts. Rendered inside `<LexicalComposer>` so it can resolve the
 * live Lexical editor. Without this, extensions whose commands live only in
 * `onRegister` (callout, math, datetime, file, layout, figma, twitter, youtube,
 * page-break, …) never register them and their insert commands silently no-op —
 * and extension key bindings (Mod+B/I/U/K, …) would be dead on this headless
 * core path, since `KeyboardShortcutsPlugin` is only hand-mounted in the
 * scaffolded registry editors, not added to any extension's `getPlugins()`.
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
    // Wire extension keyboard shortcuts on the core path.
    const unregisterKeys = registerExtensionKeyBindings(lexicalEditor, extensions);
    return () => {
      unregisterKeys();
      for (const teardown of teardowns) teardown();
      for (const ext of extensions) ext.onDestroy?.(lexicalEditor);
    };
  }, [lexicalEditor, extensions]);

  return null;
}
