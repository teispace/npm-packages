'use client';

import { $getSelection, $isRangeSelection } from 'lexical';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import { $blockOf } from '../../utils/selection.js';
import { useOptionalEditor } from '../context.js';
import { useItemStates } from '../items.js';
import { selectionAnchor } from '../selection-anchor.js';
import type { Placement } from '../ui/floating.js';
import { Popover } from '../ui/popover.js';
import { useEditorState } from '../use-editor-state.js';
import { ItemButton } from './editor-toolbar.js';

export interface BubbleMenuProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** Item ids to show, in order. Default: every `bubble` item the extensions contribute. */
  items?: readonly string[];
  /** Your own controls, after the items. */
  children?: ReactNode;
  /**
   * When to show, on top of the defaults (a text selection, while editing,
   * not mid-drag). Called after every update.
   */
  shouldShow?: (editor: TeiEditor) => boolean;
  /** Default `top`; it flips below when there is no room. */
  placement?: Placement;
}

/** The selection, as a key that changes when it moves: so the anchor follows it. */
function $selectedText(): string | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return null;
  if (selection.getTextContent().trim() === '') return null;
  // Code blocks take no formatting. (By type, so the menu does not load code nodes.)
  if ($blockOf(selection.anchor.getNode())?.getType() === 'code') return null;
  const { anchor, focus } = selection;
  return `${anchor.key}:${anchor.offset}:${focus.key}:${focus.offset}`;
}

/**
 * Formatting for the selected text, right above it: bold, italic, link and
 * whatever else the extensions put in `bubble`. Shows once a selection is
 * made (not while the mouse is still dragging it out), hides when it
 * collapses or focus leaves the editor.
 *
 * Render it inside `<EditorContent>` (`<Editor>` does).
 */
export function BubbleMenu({
  editor: editorProp,
  items: ids,
  children,
  shouldShow,
  placement = 'top',
}: BubbleMenuProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <BubbleMenu> needs an `editor` prop or a provider');

  const items = useMemo(() => {
    const all = editor.items('bubble');
    if (!ids) return all;
    const byId = new Map(all.map((item) => [item.id, item]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }, [editor, ids]);
  const states = useItemStates(editor, items);
  const selected = useEditorState(
    (e) => (e.isEditable && (shouldShow?.(e) ?? true) ? e.read($selectedText) : null),
    { editor },
  );
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const ready = useInteraction(editor, bar);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new selection is a new place
  const anchor = useMemo(
    () => (selected && ready ? selectionAnchor(editor) : null),
    [editor, selected, ready],
  );

  if (!anchor || items.length + (children ? 1 : 0) === 0) return null;
  return (
    <Popover
      ref={setBar}
      open
      anchor={anchor}
      placement={placement}
      offset={8}
      // Over the first line it goes below, not over the toolbar above the document.
      flipBoundary={editor.lexical.getRootElement()}
      variant="bar"
      dismissOnOutside={false}
      role="toolbar"
      aria-label={editor.t('bubble.label')}
      data-tei-control="bubble-menu"
    >
      {items.map((item, i) => (
        <ItemButton key={item.id} editor={editor} item={item} state={states[i]} />
      ))}
      {children}
    </Popover>
  );
}

/**
 * Whether the bar may show: the user is editing (focus in the document or
 * in the bar itself) and is not holding the mouse down to select.
 */
function useInteraction(editor: TeiEditor, bar: HTMLElement | null): boolean {
  const [focused, setFocused] = useState(() => editor.isFocused);
  const [pressing, setPressing] = useState(false);

  useEffect(() => {
    const root = editor.lexical.getRootElement();
    const doc = root?.ownerDocument ?? document;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && Boolean(root?.contains(target) || bar?.contains(target));
    const onFocusIn = (event: FocusEvent) => setFocused(inside(event.target));
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget === null) setFocused(false);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button === 0 && root?.contains(event.target as Node)) setPressing(true);
    };
    const onUp = () => setPressing(false);
    setFocused(editor.isFocused || inside(doc.activeElement));
    doc.addEventListener('focusin', onFocusIn);
    doc.addEventListener('focusout', onFocusOut);
    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onUp, true);
    const off = editor.on('onFocus', () => setFocused(true));
    return () => {
      doc.removeEventListener('focusin', onFocusIn);
      doc.removeEventListener('focusout', onFocusOut);
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
      off();
    };
  }, [editor, bar]);

  return focused && !pressing;
}
