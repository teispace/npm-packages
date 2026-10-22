'use client';

import { useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import { Callout, type CalloutStorage } from '../../extensions/callout/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Menu } from '../ui/menu.js';
import { Popover } from '../ui/popover.js';
import { useUiRequest } from '../use-ui-request.js';
import { useMenuEntries } from './menu-entries.js';

export interface CalloutMenuProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

/**
 * The menu a callout's icon opens (`openCalloutMenu`): its kinds, and
 * taking it away. Its items are the `calloutMenu` placement's, so an app's
 * own kinds come in with theirs. Without it, the icon steps to the next kind.
 */
export function CalloutMenu({ editor: editorProp }: CalloutMenuProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <CalloutMenu> needs an `editor` prop or a provider');
  return (
    <TeiEditorContext.Provider value={editor}>
      <EditorCalloutMenu editor={editor} />
    </TeiEditorContext.Provider>
  );
}

function EditorCalloutMenu({ editor }: { editor: TeiEditor }) {
  const storage = editor.extension(Callout)?.output.storage as CalloutStorage | undefined;
  const [anchor, setAnchor] = useState<Element | null>(null);
  useUiRequest(storage?.menu, () => {
    const key = storage?.menuFor.peek();
    const box = key ? editor.lexical.getElementByKey(key) : null;
    setAnchor(box?.querySelector('[data-tei-callout-icon]') ?? box ?? null);
  });
  if (!anchor) return null;
  const close = () => setAnchor(null);
  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-start"
      offset={4}
      restoreFocus={false}
      initialFocus="container"
      onDismiss={(reason) => {
        close();
        if (reason === 'escape') editor.focus();
      }}
      data-tei-control="callout-menu"
    >
      <CalloutMenuList editor={editor} onClose={close} />
    </Popover>
  );
}

/** Mounted only while open, so its states cost nothing the rest of the time. */
function CalloutMenuList({ editor, onClose }: { editor: TeiEditor; onClose: () => void }) {
  const groups = useMenuEntries(editor, editor.items('calloutMenu'), onClose, () => 'hide');
  return (
    <Menu groups={groups} label={editor.t('callout.menu')} initial="checked" onClose={onClose} />
  );
}
