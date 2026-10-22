'use client';

import { useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import { StickyNote, type StickyNoteStorage } from '../../extensions/sticky-note/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Menu } from '../ui/menu.js';
import { Popover } from '../ui/popover.js';
import { useUiRequest } from '../use-ui-request.js';
import { useMenuEntries } from './menu-entries.js';

export interface StickyMenuProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

/**
 * The menu a sticky note's swatch opens (`openStickyMenu`): its colours,
 * each with its swatch, and taking the note away. Its items are the
 * `stickyMenu` placement's. Without it, the swatch steps to the next colour.
 */
export function StickyMenu({ editor: editorProp }: StickyMenuProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <StickyMenu> needs an `editor` prop or a provider');
  return (
    <TeiEditorContext.Provider value={editor}>
      <EditorStickyMenu editor={editor} />
    </TeiEditorContext.Provider>
  );
}

function EditorStickyMenu({ editor }: { editor: TeiEditor }) {
  const storage = editor.extension(StickyNote)?.output.storage as StickyNoteStorage | undefined;
  const [anchor, setAnchor] = useState<Element | null>(null);
  useUiRequest(storage?.menu, () => {
    const key = storage?.menuFor.peek();
    const note = key ? editor.lexical.getElementByKey(key) : null;
    setAnchor(note?.querySelector('[data-tei-sticky-swatch]') ?? note ?? null);
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
      data-tei-control="sticky-menu"
    >
      <StickyMenuList editor={editor} onClose={close} />
    </Popover>
  );
}

/** Mounted only while open, so its states cost nothing the rest of the time. */
function StickyMenuList({ editor, onClose }: { editor: TeiEditor; onClose: () => void }) {
  const items = editor.items('stickyMenu');
  const groups = useMenuEntries(editor, items, onClose, () => 'hide').map((group) => ({
    ...group,
    items: group.items.map((entry) => {
      const color = items.find((item) => item.id === entry.id)?.args?.[0];
      // The colour is a fixed name: CSS draws it from the note's own tokens.
      return typeof color === 'string' && !entry.icon
        ? {
            ...entry,
            icon: <span className="tei-menu-swatch" data-tei-sticky-color={color} />,
          }
        : entry;
    }),
  }));
  return (
    <Menu groups={groups} label={editor.t('sticky.menu')} initial="checked" onClose={onClose} />
  );
}
