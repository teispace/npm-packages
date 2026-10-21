'use client';

import { getExtensionDependencyFromEditor } from '@lexical/extension';
import { ReactExtension } from '@lexical/react/ReactExtension';
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';
import type { TeiEditor } from '../core/editor.js';
import { TeiEditorContext } from './context.js';

export interface ContentEditableProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'contentEditable' | 'placeholder' | 'children'> {
  /** Shown while the document is empty. */
  placeholder?: string;
}

/**
 * The editable document. Stable hooks for styling: `data-tei-content` always,
 * `data-tei-empty` while empty (the placeholder shows from CSS, so a strict
 * `style-src` needs nothing for it), `data-tei-readonly` while read-only.
 */
export const ContentEditable = forwardRef<
  HTMLDivElement,
  ContentEditableProps & { editor: TeiEditor }
>(function ContentEditable({ editor, placeholder, className, role = 'textbox', ...rest }, ref) {
  const [editable, setEditable] = useState(() => editor.isEditable);
  const [empty, setEmpty] = useState(() => editor.isEmpty);

  useLayoutEffect(() => {
    setEditable(editor.isEditable);
    setEmpty(editor.isEmpty);
    const offEditable = editor.lexical.registerEditableListener(setEditable);
    const offUpdate = editor.lexical.registerUpdateListener(() => setEmpty(editor.isEmpty));
    return () => {
      offEditable();
      offUpdate();
    };
  }, [editor]);

  const setRoot = useCallback(
    (element: HTMLDivElement | null) => {
      editor.lexical.setRootElement(element?.ownerDocument?.defaultView ? element : null);
      if (typeof ref === 'function') ref(element);
      else if (ref) ref.current = element;
    },
    [editor, ref],
  );

  return (
    <div
      {...rest}
      ref={setRoot}
      className={className}
      role={role}
      aria-multiline={role === 'textbox' ? true : undefined}
      aria-readonly={editable ? undefined : true}
      aria-placeholder={placeholder}
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck={rest.spellCheck ?? true}
      data-tei-content=""
      data-tei-empty={empty ? '' : undefined}
      data-tei-readonly={editable ? undefined : ''}
      data-placeholder={placeholder}
    />
  );
});

export interface EditorContentProps extends ContentEditableProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** Rendered inside the editor's React context, after the document. */
  children?: ReactNode;
}

/**
 * Renders the document, plus any React UI the extensions declared, and
 * provides the editor to `children` and everything below.
 */
export const EditorContent = forwardRef<HTMLDivElement, EditorContentProps>(function EditorContent(
  { editor: editorProp, children, ...props },
  ref,
) {
  const contextEditor = useContext(TeiEditorContext);
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <EditorContent> needs an `editor` prop or a provider');
  const { Component } = getExtensionDependencyFromEditor(editor.lexical, ReactExtension).output;
  return (
    <TeiEditorContext.Provider value={editor}>
      <Component contentEditable={<ContentEditable ref={ref} editor={editor} {...props} />}>
        {children}
      </Component>
    </TeiEditorContext.Provider>
  );
});

/** Provide an editor to UI rendered outside `<EditorContent>` (a toolbar in a header, say). */
export function EditorProvider({ editor, children }: { editor: TeiEditor; children?: ReactNode }) {
  return <TeiEditorContext.Provider value={editor}>{children}</TeiEditorContext.Provider>;
}
