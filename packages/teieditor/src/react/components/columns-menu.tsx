'use client';

import { useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import { Columns, type ColumnsStorage } from '../../extensions/columns/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Menu } from '../ui/menu.js';
import { Popover } from '../ui/popover.js';
import { useUiRequest } from '../use-ui-request.js';
import { useMenuEntries } from './menu-entries.js';

export interface ColumnsMenuProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

/**
 * The menu a columns block's control opens (`openColumnsMenu`): its
 * layouts, adding and deleting a column, and turning it back into blocks.
 * Its items are the `columnsMenu` placement's, so an app's own layouts come
 * in with theirs. Without it, the control steps to the next layout.
 */
export function ColumnsMenu({ editor: editorProp }: ColumnsMenuProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <ColumnsMenu> needs an `editor` prop or a provider');
  return (
    <TeiEditorContext.Provider value={editor}>
      <EditorColumnsMenu editor={editor} />
    </TeiEditorContext.Provider>
  );
}

function EditorColumnsMenu({ editor }: { editor: TeiEditor }) {
  const storage = editor.extension(Columns)?.output.storage as ColumnsStorage | undefined;
  const [anchor, setAnchor] = useState<Element | null>(null);
  useUiRequest(storage?.menu, () => {
    const key = storage?.menuFor.peek();
    const box = key ? editor.lexical.getElementByKey(key) : null;
    setAnchor(box?.querySelector('[data-tei-columns-control]') ?? box ?? null);
  });
  if (!anchor) return null;
  const close = () => setAnchor(null);
  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-end"
      offset={4}
      restoreFocus={false}
      initialFocus="container"
      onDismiss={(reason) => {
        close();
        if (reason === 'escape') editor.focus();
      }}
      data-tei-control="columns-menu"
    >
      <ColumnsMenuList editor={editor} onClose={close} />
    </Popover>
  );
}

/** Mounted only while open, so its states cost nothing the rest of the time. */
function ColumnsMenuList({ editor, onClose }: { editor: TeiEditor; onClose: () => void }) {
  const groups = useMenuEntries(editor, editor.items('columnsMenu'), onClose, () => 'hide');
  return (
    <Menu groups={groups} label={editor.t('columns.menu')} initial="checked" onClose={onClose} />
  );
}
