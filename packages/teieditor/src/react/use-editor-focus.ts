'use client';

import { useEffect, useState } from 'react';
import type { TeiEditor } from '../core/editor.js';

/** The editor's floating UI (menus, popovers, bars): focus there still counts as editing. */
const UI = '[data-tei-ui]';

function within(editor: TeiEditor, target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const root = editor.lexical.getRootElement();
  if (root?.contains(target)) return true;
  const element = target.nodeType === 1 ? (target as Element) : target.parentElement;
  return Boolean(element?.closest(UI));
}

/**
 * Whether the user is editing: focus in the document, or in the editor's
 * own floating UI (a link field, a bubble menu button). Moving focus
 * anywhere else, or nowhere, ends it.
 */
export function useEditorFocus(editor: TeiEditor): boolean {
  const [focused, setFocused] = useState(() => editor.isFocused);

  useEffect(() => {
    setFocused(editor.isFocused);
    const doc = editor.lexical.getRootElement()?.ownerDocument ?? document;
    const onFocusIn = (event: FocusEvent) => setFocused(within(editor, event.target));
    const onFocusOut = (event: FocusEvent) => {
      // Focus going nowhere (a press on the page) fires no focusin.
      if (event.relatedTarget === null) setFocused(false);
    };
    doc.addEventListener('focusin', onFocusIn);
    doc.addEventListener('focusout', onFocusOut);
    const off = editor.on('onFocus', () => setFocused(true));
    return () => {
      doc.removeEventListener('focusin', onFocusIn);
      doc.removeEventListener('focusout', onFocusOut);
      off();
    };
  }, [editor]);

  return focused;
}
