'use client';

import { $getSelection, $isRangeSelection } from 'lexical';
import { type FormEvent, useEffect, useId, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import {
  $getLinkAtSelection,
  Link,
  type LinkAtSelection,
  type LinkStorage,
} from '../../extensions/link/index.js';
import { useOptionalEditor } from '../context.js';
import { selectionAnchor } from '../selection-anchor.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import type { FloatingAnchor } from '../ui/floating.js';
import { Popover } from '../ui/popover.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';

export interface LinkPopoverProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /**
   * Show a bar with the link, Edit and Remove while the caret is in a link.
   * Default true.
   */
  preview?: boolean;
}

const sameLink = (a: LinkAtSelection | null, b: LinkAtSelection | null) =>
  a === b || (a !== null && b !== null && a.key === b.key && a.url === b.url);

/**
 * Add, edit and remove links. Opens for ⌘K, the toolbar's and the bubble
 * menu's link buttons (`openLinkEditor`), and shows the link under the
 * caret with Edit and Remove. URLs the Link extension refuses are refused
 * here too, with a message, before anything changes.
 *
 * Render it once inside `<EditorContent>` (`<Editor>` does).
 */
export function LinkPopover({ editor: editorProp, preview = true }: LinkPopoverProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <LinkPopover> needs an `editor` prop or a provider');
  const storage = editor.extension(Link)?.output.storage as LinkStorage | undefined;
  const focused = useEditorFocus(editor);
  const current = useEditorState((e) => (storage ? e.read(() => collapsedLink()) : null), {
    editor,
    equal: sameLink,
  });
  const [editing, setEditing] = useState<{
    anchor: FloatingAnchor;
    link: LinkAtSelection | null;
  }>();

  // Count as mounted, so `openLinkEditor` (and ⌘K) know there is a UI.
  useEffect(() => {
    if (!storage) return;
    storage.editors.value++;
    return () => {
      storage.editors.value--;
    };
  }, [storage]);

  // Open the editor on each request, and for one made while this loaded.
  useEffect(() => {
    if (!storage) return;
    return storage.editRequest.subscribe((request) => {
      if (request <= storage.handled) return;
      storage.handled = request;
      const link = editor.read(() => $getLinkAtSelection());
      const anchor = linkElement(editor, link) ?? selectionAnchor(editor);
      if (anchor) setEditing({ anchor, link });
    });
  }, [editor, storage]);

  if (!storage) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('teieditor: <LinkPopover> needs the Link extension; it renders nothing.');
    }
    return null;
  }

  const close = (refocus = true) => {
    setEditing(undefined);
    if (refocus) editor.focus();
  };

  if (editing) {
    return <LinkForm editor={editor} anchor={editing.anchor} link={editing.link} onClose={close} />;
  }

  const element = preview && focused && current ? linkElement(editor, current) : null;
  if (!element || !current) return null;
  return (
    <Popover
      open
      anchor={element}
      placement="bottom-start"
      variant="bar"
      dismissOnOutside={false}
      data-tei-control="link-preview"
      aria-label={editor.t('link.edit')}
      role="group"
    >
      <a
        className="tei-link-url"
        href={current.url}
        target="_blank"
        rel="noopener noreferrer"
        title={current.url}
      >
        {displayUrl(current.url)}
      </a>
      <Button
        icon="pencil"
        label={editor.t('link.edit')}
        size="sm"
        onClick={() => setEditing({ anchor: element, link: current })}
      />
      <Button
        icon="unlink"
        label={editor.t('link.remove')}
        size="sm"
        onClick={() => editor.chain().focus().unsetLink().run()}
      />
    </Popover>
  );
}

function LinkForm({
  editor,
  anchor,
  link,
  onClose,
}: {
  editor: TeiEditor;
  anchor: FloatingAnchor;
  link: LinkAtSelection | null;
  onClose: (refocus?: boolean) => void;
}) {
  const [url, setUrl] = useState(link?.url ?? '');
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = url.trim();
    if (!value) {
      if (link) editor.chain().focus().unsetLink().run();
      onClose();
      return;
    }
    // Focus goes back only once the link is in: a refused URL keeps the
    // field focused, so the user can fix it.
    if (!editor.chain().setLink(value).run()) {
      setInvalid(true);
      return;
    }
    onClose();
  };

  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-start"
      initialFocus="first"
      restoreFocus={false}
      onDismiss={(reason) => onClose(reason === 'escape')}
      data-tei-control="link-editor"
      role="dialog"
      aria-label={editor.t(link ? 'link.edit' : 'link.add')}
    >
      {/* The Link extension adds a missing scheme and checks the URL; the browser's
          own check would refuse `example.com` before it got the chance. */}
      <form className="tei-link-form" noValidate onSubmit={submit}>
        <Input
          type="url"
          inputMode="url"
          value={url}
          placeholder={editor.t('link.placeholder')}
          aria-label={editor.t('link.placeholder')}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
        />
        <Button type="submit" variant="solid" size="sm">
          {editor.t('link.apply')}
        </Button>
        {link && (
          <Button
            icon="unlink"
            label={editor.t('link.remove')}
            size="sm"
            onClick={() => {
              editor.chain().focus().unsetLink().run();
              onClose();
            }}
          />
        )}
      </form>
      {invalid && (
        <p id={errorId} className="tei-hint" data-error="" role="alert">
          {editor.t('link.invalid')}
        </p>
      )}
    </Popover>
  );
}

/** The link the caret is in, only while the selection is a caret (a range is the bubble menu's). */
function collapsedLink(): LinkAtSelection | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const link = $getLinkAtSelection();
  return link && link.text.length > 0 ? link : null;
}

function linkElement(editor: TeiEditor, link: LinkAtSelection | null): HTMLElement | null {
  return link ? editor.lexical.getElementByKey(link.key) : null;
}

/** A URL as people read it: no scheme, no trailing slash. */
function displayUrl(url: string): string {
  return url.replace(/^(https?:)?\/\//, '').replace(/\/$/, '');
}
