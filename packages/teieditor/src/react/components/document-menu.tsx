'use client';

import { useId, useMemo, useRef, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Button, type ButtonProps } from '../ui/button.js';
import type { Placement } from '../ui/floating.js';
import { Menu, type MenuGroupData, type MenuItemData } from '../ui/menu.js';
import { Popover } from '../ui/popover.js';
import { useEditorState } from '../use-editor-state.js';

export interface DocumentMenuProps extends Omit<ButtonProps, 'onSelect' | 'content'> {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  placement?: Placement;
  /**
   * Change the menu as it opens: add, drop or reorder sections. It gets the
   * sections built from the `document` items.
   */
  groups?: (groups: MenuGroupData[], editor: TeiEditor) => MenuGroupData[];
}

/** Sections in this order; any other group after them, as it comes. */
const ORDER = ['view', 'file', 'clear'];

interface State {
  active: boolean;
  enabled: boolean;
}

const loose = (editor: TeiEditor) =>
  editor as unknown as {
    isActive(name: string, ...args: readonly unknown[]): boolean;
  };

/**
 * Whether each item is on and can run. Not gated on editability as
 * toolbar items are: Read only must still turn off, Export still works.
 */
function readStates(editor: TeiEditor, items: readonly TeiItem[]): State[] {
  return items.map((item) => ({
    active: item.active ? loose(editor).isActive(item.active, ...(item.activeArgs ?? [])) : false,
    enabled: item.command ? editor.can().command(item.command, ...(item.args ?? [])) : true,
  }));
}

const sameStates = (a: State[], b: State[]) =>
  a.length === b.length &&
  a.every((s, i) => s.active === b[i]?.active && s.enabled === b[i]?.enabled);

/**
 * The document menu: the views (markdown source, invisibles, pages, read
 * only), import, export by format, and clearing the document with a
 * confirming step. Built from the `document` items the installed
 * extensions contribute, so it shows only what is there; empty, it renders
 * nothing.
 */
export function DocumentMenu({
  editor: editorProp,
  placement = 'bottom-end',
  groups: change,
  label,
  icon,
  ...button
}: DocumentMenuProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <DocumentMenu> needs an `editor` prop or a provider');
  const items = useMemo(() => editor.items('document'), [editor]);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  if (items.length === 0) return null;
  const name = label ?? editor.t('document.label');
  return (
    <TeiEditorContext.Provider value={editor}>
      <Button
        {...button}
        ref={setAnchor}
        data-tei-control="document-menu-button"
        icon={icon ?? editor.icon('document') ?? FILE_TEXT}
        label={name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (!open && event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      />
      <Popover
        open={open}
        anchor={anchor}
        placement={placement}
        restoreFocus
        onDismiss={() => setOpen(false)}
        data-tei-control="document-menu"
      >
        <DocumentMenuContent
          editor={editor}
          items={items}
          label={name}
          change={change}
          close={() => setOpen(false)}
        />
      </Popover>
    </TeiEditorContext.Provider>
  );
}

function DocumentMenuContent({
  editor,
  items,
  label,
  change,
  close,
}: {
  editor: TeiEditor;
  items: readonly TeiItem[];
  label: string;
  change: DocumentMenuProps['groups'];
  close: () => void;
}) {
  const states = useEditorState((e) => readStates(e, items), { editor, equal: sameStates });
  const [confirming, setConfirming] = useState<TeiItem | null>(null);
  // A danger row asks first: selecting it keeps the menu open for the question.
  const asking = useRef(false);
  const titleId = useId();

  const groups = useMemo(() => {
    const entry = (item: TeiItem, i: number): MenuItemData => {
      const state = states[i] as State;
      return {
        id: item.id,
        label: editor.t(item.label),
        icon: item.icon,
        checked: item.active ? state.active : undefined,
        disabled: !state.enabled,
        variant: item.variant,
        onSelect: () => {
          if (item.variant === 'danger') {
            asking.current = true;
            setConfirming(item);
          } else editor.runItem(item);
        },
      };
    };
    const sections = new Map<string, MenuItemData[]>();
    const exports: MenuItemData[] = [];
    items.forEach((item, i) => {
      const group = item.group ?? 'other';
      if (group === 'export') {
        exports.push(entry(item, i));
        return;
      }
      const list = sections.get(group) ?? [];
      list.push(entry(item, i));
      sections.set(group, list);
    });
    // The formats go in one submenu, after the rest of the file section.
    if (exports.length) {
      const file = sections.get('file') ?? [];
      file.push({
        id: 'export',
        label: editor.t('document.export'),
        icon: 'download',
        disabled: exports.every((e) => e.disabled),
        items: exports,
      });
      sections.set('file', file);
    }
    const rank = (id: string) => {
      const at = ORDER.indexOf(id);
      return at < 0 ? ORDER.length : at;
    };
    const built = [...sections.entries()]
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([id, list]): MenuGroupData => ({ id, items: list }));
    return change ? change(built, editor) : built;
  }, [items, states, editor, change]);

  if (confirming) {
    return (
      <div
        className="tei-confirm"
        role="alertdialog"
        aria-labelledby={titleId}
        data-tei-control="document-confirm"
      >
        <p id={titleId} className="tei-confirm-title">
          {editor.t(`${confirming.label}.confirm`)}
        </p>
        <p className="tei-confirm-hint">{editor.t(`${confirming.label}.hint`)}</p>
        <div className="tei-confirm-actions">
          <Button variant="outline" size="sm" autoFocus onClick={close}>
            {editor.t('document.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            data-tei-confirm=""
            onClick={() => {
              close();
              editor.runItem(confirming);
            }}
          >
            {editor.t(confirming.label)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Menu
      groups={groups}
      label={label}
      onClose={() => {
        if (asking.current) {
          asking.current = false;
          return;
        }
        close();
      }}
    />
  );
}

/** A sheet with lines; an app replaces it with an icon named `document`. */
const FILE_TEXT = [
  [
    'path',
    { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4' },
  ],
  ['path', { d: 'M10 9H8M16 13H8M16 17H8' }],
] as const;
