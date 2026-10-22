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
  useSyncExternalStore,
} from 'react';
import type { TeiEditor } from '../core/editor.js';
import { neutralizeAttributes } from '../utils/html-attributes.js';
import { TeiEditorContext } from './context.js';
import { cx } from './ui/context.js';

export interface ContentEditableProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'contentEditable' | 'placeholder' | 'children'> {
  /** Shown while the document is empty. */
  placeholder?: string;
  /**
   * The document as HTML, for the server to render until the editor
   * mounts: the page shows the content at once, with no blank editor and
   * no layout shift. Pass what `renderToHTML` from
   * `@teispace/teieditor/server` gives for the same content and
   * extensions. It is written into the page, so it must be that output
   * (or as trusted), never raw user input. Its `style` attributes are
   * held back (a strict CSP would report them) and `on*` attributes
   * dropped; the editor puts the styles on as it mounts. Only server
   * markup uses it: a page rendered in the browser starts the editor
   * straight away.
   */
  initialHTML?: string;
}

const noSubscribe = () => () => {};

/** True on the server and while hydrating its markup; false after, and in a client render. */
const useServerMarkup = () =>
  useSyncExternalStore(
    noSubscribe,
    () => false,
    () => true,
  );

/**
 * The editable document. Stable hooks for styling: `data-tei-content` always,
 * `data-tei-empty` while empty (the placeholder shows from CSS, so a strict
 * `style-src` needs nothing for it), `data-tei-readonly` while read-only.
 */
export const ContentEditable = forwardRef<
  HTMLDivElement,
  ContentEditableProps & { editor: TeiEditor }
>(function ContentEditable(
  { editor, placeholder, initialHTML, className, role = 'textbox', ...rest },
  ref,
) {
  const [editable, setEditable] = useState(() => editor.isEditable);
  // Unknown until mounted: server markup never shows the placeholder over
  // content that is about to arrive. The layout effect sets it before paint.
  const [empty, setEmpty] = useState(false);

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

  const serverMarkup = useServerMarkup() && Boolean(initialHTML);

  const setRoot = useCallback(
    (element: HTMLDivElement | null) => {
      // Lexical empties the root as it takes it: the server's HTML, if any, goes here.
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
      className={serverMarkup ? cx(className, 'tei-prose') : className}
      // React hydrates this as it is and never writes it again; the editor takes over on mount.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: server markup only, from renderToHTML, with styles and handlers taken out
      dangerouslySetInnerHTML={
        serverMarkup ? { __html: neutralizeAttributes(initialHTML as string) } : undefined
      }
      role={role}
      aria-multiline={role === 'textbox' ? true : undefined}
      aria-readonly={editable ? undefined : true}
      aria-placeholder={placeholder}
      // A textbox needs a name; the app's label wins, else a translatable default.
      aria-label={
        rest['aria-label'] ?? (rest['aria-labelledby'] ? undefined : editor.t('editor.label'))
      }
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
