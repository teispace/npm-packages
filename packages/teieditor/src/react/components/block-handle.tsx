'use client';

import { IS_APPLE, type NodeKey } from 'lexical';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import { $blocks, $getBlock, type BlockPlace, Blocks } from '../../extensions/blocks/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { useItemStates } from '../items.js';
import { Button } from '../ui/button.js';
import type { FloatingAnchor, VirtualElement } from '../ui/floating.js';
import { Menu, type MenuGroupData, type MenuItemData } from '../ui/menu.js';
import { Popover } from '../ui/popover.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';
import { useHover, useRootListener } from '../use-hover.js';

/** How far a press moves before it is a drag, in px. */
const DRAG_THRESHOLD = 4;
/** How near an edge of the view the pointer starts it scrolling, in px. */
const SCROLL_EDGE = 48;

// -- Where blocks are ---------------------------------------------------------

/** The blocks' keys, in order, kept until the document changes. */
function useBlockKeys(editor: TeiEditor) {
  const cache = useRef<NodeKey[] | null>(null);
  useEffect(
    () =>
      editor.lexical.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size > 0 || dirtyLeaves.size > 0) cache.current = null;
      }),
    [editor],
  );
  return useCallback(() => {
    cache.current ??= editor.read(() => $blocks().map((block) => block.getKey()));
    return cache.current;
  }, [editor]);
}

/** The block nearest `y`: blocks run down the page, so a binary search finds it. */
function blockAt(editor: TeiEditor, keys: readonly NodeKey[], y: number): NodeKey | null {
  let lo = 0;
  let hi = keys.length - 1;
  let nearest: { key: NodeKey; distance: number } | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const key = keys[mid] as NodeKey;
    const rect = editor.lexical.getElementByKey(key)?.getBoundingClientRect();
    if (!rect) return null;
    if (y < rect.top) hi = mid - 1;
    else if (y > rect.bottom) lo = mid + 1;
    else return key;
    const distance = y < rect.top ? rect.top - y : y - rect.bottom;
    if (!nearest || distance < nearest.distance) nearest = { key, distance };
  }
  return nearest?.key ?? null;
}

/** Where a block starts, its marker included: a list item's list's edge. */
function startEdge(el: HTMLElement, rtl: boolean): number {
  const box = (el.tagName === 'LI' ? (el.parentElement ?? el) : el).getBoundingClientRect();
  // A list item's own box starts at its text; its list's, before the marker.
  if (el.tagName !== 'LI') return rtl ? box.right : box.left;
  const item = el.getBoundingClientRect();
  return rtl ? Math.min(box.right, item.right + 24) : Math.max(box.left, item.left - 24);
}

/** A block's first line: the handle sits level with it. */
function firstLine(el: HTMLElement): { top: number; height: number } {
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const pad = Number.parseFloat(style.paddingTop) || 0;
  const line = Number.parseFloat(style.lineHeight);
  const height = Number.isFinite(line) ? line : (Number.parseFloat(style.fontSize) || 16) * 1.5;
  return { top: box.top + pad, height: Math.min(height, Math.max(box.height - pad, 0) || height) };
}

const isRtl = (el: Element) => getComputedStyle(el).direction === 'rtl';

/** The point the handle hangs from: the block's start edge, level with its first line. */
function handleAnchor(el: HTMLElement): VirtualElement {
  return {
    contextElement: el,
    getBoundingClientRect() {
      const { top, height } = firstLine(el);
      return DOMRect.fromRect({ x: startEdge(el, isRtl(el)), y: top, width: 0, height });
    },
  };
}

interface DropTarget {
  key: NodeKey;
  place: BlockPlace;
}

/**
 * Where a block dropped at `y` goes: before or after the block under it,
 * by which half `y` is in; nowhere inside the block being moved.
 */
function dropTarget(
  editor: TeiEditor,
  keys: readonly NodeKey[],
  moving: NodeKey,
  y: number,
): DropTarget | null {
  const key = blockAt(editor, keys, y);
  const el = key ? editor.lexical.getElementByKey(key) : null;
  const self = editor.lexical.getElementByKey(moving);
  if (!key || !el || !self) return null;
  // Its own nested items move with it: no drop among them.
  const holder = self.nextElementSibling;
  const inUnit =
    key === moving ||
    (self.tagName === 'LI' &&
      holder?.tagName === 'LI' &&
      holder.contains(el) &&
      !el.contains(self));
  if (inUnit) return null;
  const rect = el.getBoundingClientRect();
  return { key, place: y < rect.top + rect.height / 2 ? 'before' : 'after' };
}

/** The drop line, between the target and its neighbour, as wide as the target. */
function dropAnchor(
  editor: TeiEditor,
  keys: readonly NodeKey[],
  target: DropTarget,
): VirtualElement | null {
  const el = editor.lexical.getElementByKey(target.key);
  if (!el) return null;
  const at = keys.indexOf(target.key);
  const neighbour = keys[target.place === 'before' ? at - 1 : at + 1];
  const other = neighbour ? editor.lexical.getElementByKey(neighbour) : null;
  return {
    contextElement: el,
    getBoundingClientRect() {
      const rect = el.getBoundingClientRect();
      const near = other?.getBoundingClientRect();
      const edge = target.place === 'before' ? rect.top : rect.bottom;
      const y = near
        ? target.place === 'before'
          ? (near.bottom + rect.top) / 2
          : (rect.bottom + near.top) / 2
        : edge;
      return DOMRect.fromRect({ x: rect.left, y, width: rect.width, height: 0 });
    },
  };
}

/** The nearest scrolling box round the editor, or the page. */
function scroller(el: Element): Element | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

/** A still copy of the block under the pointer while it is dragged: no frames, nothing live. */
function ghostOf(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  for (const frame of copy.querySelectorAll('iframe, video, audio')) frame.remove();
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    node.removeAttribute('contenteditable');
    node.removeAttribute('data-lexical-decorator');
  }
  return copy;
}

// -- The block menu -----------------------------------------------------------

/** Its entries: "Turn into" the block types, then the `blockMenu` actions by group. */
function useBlockMenu(editor: TeiEditor, onDone: () => void): MenuGroupData[] {
  const items = editor.items('blockMenu');
  const states = useItemStates(editor, items);
  const run = (item: TeiItem) => () => {
    onDone();
    editor.runItem(item);
  };
  const entry = (item: TeiItem, index: number): MenuItemData => {
    const state = states[index];
    const shortcut = item.shortcut ? editor.shortcut(item.shortcut) : undefined;
    return {
      id: item.id,
      label: editor.t(item.label),
      icon: item.icon,
      shortcut,
      checked: item.active ? Boolean(state?.active) : undefined,
      radio: item.active ? true : undefined,
      disabled: !state?.enabled,
      variant: item.group === 'delete' ? 'danger' : undefined,
      onSelect: run(item),
    };
  };
  const types: MenuItemData[] = [];
  const groups: MenuGroupData[] = [];
  items.forEach((item, index) => {
    if (item.in.includes('blockType')) {
      types.push(entry(item, index));
      return;
    }
    const id = item.group ?? 'other';
    let group = groups.find((g) => g.id === id);
    if (!group) {
      group = { id, items: [] };
      groups.push(group);
    }
    (group.items as MenuItemData[]).push(entry(item, index));
  });
  if (types.some((type) => !type.disabled)) {
    groups.unshift({
      id: 'turnInto',
      items: [
        {
          id: 'turnInto',
          label: editor.t('block.turnInto'),
          // What the block is now.
          icon: types.find((type) => type.checked)?.icon ?? 'paragraph',
          items: types,
        },
      ],
    });
  }
  return groups;
}

// -- The handle ---------------------------------------------------------------

interface Drag {
  key: NodeKey;
  target: DropTarget | null;
  x: number;
  y: number;
}

export interface BlockHandleProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** The + button beside the handle, to add a block. Default true. */
  add?: boolean;
}

/**
 * Beside the block under the pointer (the caret's, on a touch screen): a
 * handle to drag it elsewhere, or click for its menu (turn into, duplicate,
 * move, delete), and a + to add a block after it (Alt: before) with the
 * slash menu open. Renders nothing without `Blocks`.
 *
 * Render it once inside `<EditorContent>` (`<Editor>` does).
 */
export function BlockHandle({ editor: editorProp, add = true }: BlockHandleProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <BlockHandle> needs an `editor` prop or a provider');
  if (!editor.extension(Blocks)) return null;
  return (
    <TeiEditorContext.Provider value={editor}>
      <Handle editor={editor} add={add} />
    </TeiEditorContext.Provider>
  );
}

function Handle({ editor, add }: { editor: TeiEditor; add: boolean }) {
  const editable = useEditorState((e) => e.isEditable, { editor });
  const focused = useEditorFocus(editor);
  const caret = useEditorState((e) => e.read(() => $getBlock()?.getKey() ?? null), { editor });
  const keys = useBlockKeys(editor);
  const hover = useHover<NodeKey>();
  const [coarse, setCoarse] = useState(false);
  const [menu, setMenu] = useState<{ key: NodeKey; anchor: FloatingAnchor } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The block whose handle is pressed: a tap blurs the editor (iOS) before
  // the click, and the handle must stay for it.
  const [held, setHeld] = useState<NodeKey | null>(null);
  const press = useRef<{ key: NodeKey; x: number; y: number; id: number } | null>(null);
  const frame = useRef(0);
  // Set as a press becomes a drag: the click that ends it is not for the menu.
  const dragged = useRef(false);
  const closeMenu = () => setMenu(null);
  const groups = useBlockMenu(editor, closeMenu);

  useEffect(() => {
    // Where nothing can hover (a touch screen), the caret's block has the handle.
    const query = typeof matchMedia === 'function' ? matchMedia('(hover: none)') : null;
    if (!query) return;
    setCoarse(query.matches);
    const change = () => setCoarse(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useRootListener(
    editor,
    'pointermove',
    editable && !drag
      ? (event) => {
          if (event.pointerType === 'touch') return;
          const y = event.clientY;
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => {
            const key = blockAt(editor, keys(), y);
            if (key) hover.set(key);
          });
        }
      : null,
  );
  useRootListener(
    editor,
    'pointerleave',
    editable
      ? (event) => {
          const to = event.relatedTarget;
          if (to instanceof Element && to.closest('[data-tei-control^="block-"]')) return;
          hover.leave();
        }
      : null,
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const key = drag?.key ?? menu?.key ?? held ?? hover.value ?? (coarse && focused ? caret : null);
  // Follow the block through edits under it (it may go).
  useEditorState((e) => (key ? e.read(() => $getBlock(key)?.getLatest()) : null), { editor });
  const el = key ? editor.lexical.getElementByKey(key) : null;

  // The block the menu is for, or the one being dragged, shows it.
  const marked = drag?.key ?? menu?.key ?? null;
  useEffect(() => {
    if (!marked) return;
    const block = editor.lexical.getElementByKey(marked);
    const name = drag ? 'data-tei-dragging' : 'data-tei-block-selected';
    block?.setAttribute(name, '');
    return () => block?.removeAttribute(name);
  }, [editor, marked, drag]);

  // While dragging: follow the pointer, scroll at the edges, Escape cancels.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const root = editor.lexical.getRootElement();
    const box = root ? scroller(root) : null;
    let tick = 0;
    const scroll = () => {
      setDrag((current) => {
        if (!current) return current;
        const view = box?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
        const step =
          current.y < view.top + SCROLL_EDGE
            ? -Math.ceil((view.top + SCROLL_EDGE - current.y) / 4)
            : current.y > view.bottom - SCROLL_EDGE
              ? Math.ceil((current.y - view.bottom + SCROLL_EDGE) / 4)
              : 0;
        if (step !== 0) {
          if (box) box.scrollTop += step;
          else scrollBy(0, step);
          return { ...current, target: dropTarget(editor, keys(), current.key, current.y) };
        }
        return current;
      });
      tick = requestAnimationFrame(scroll);
    };
    tick = requestAnimationFrame(scroll);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      press.current = null;
      setDrag(null);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(tick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [editor, dragging, keys]);

  const anchor = useMemo(() => (el ? handleAnchor(el) : null), [el]);
  const dragKey = drag?.key ?? null;
  // Copied once, as the drag starts.
  const ghost = useMemo(() => (dragKey && el ? ghostOf(el) : null), [dragKey, el]);
  if (!editable || !key || !el || !anchor) return null;
  const rtl = isRtl(el);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    setHeld(key);
    dragged.current = false;
    press.current = { key, x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = press.current;
    if (!start || start.id !== event.pointerId) return;
    const { clientX: x, clientY: y } = event;
    if (!drag && Math.hypot(x - start.x, y - start.y) < DRAG_THRESHOLD) return;
    if (!drag) {
      dragged.current = true;
      setMenu(null);
    }
    setDrag({ key: start.key, x, y, target: dropTarget(editor, keys(), start.key, y) });
  };
  const finish = (event: ReactPointerEvent<HTMLButtonElement>, drop: boolean) => {
    const start = press.current;
    press.current = null;
    // A tap keeps it for the click to come (it clears it): iOS blurs the editor in between.
    if (!drop || dragged.current) setHeld(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag || !start) return;
    const target = drag.target;
    setDrag(null);
    hover.set(start.key);
    if (drop && target) {
      editor.commands.moveBlock(start.key, target.key, target.place);
      editor.chain().focus().selectBlock(start.key).run();
    }
  };

  const drop = drag?.target ? dropAnchor(editor, keys(), drag.target) : null;
  const label = editor.t('block.handle');

  return (
    <>
      <Popover
        open
        anchor={anchor}
        placement={rtl ? 'right' : 'left'}
        offset={4}
        noFlip
        variant="bar"
        dismissOnOutside={false}
        className="tei-block-handle"
        data-tei-control="block-handle"
        data-dragging={drag ? '' : undefined}
        onPointerEnter={hover.keep}
        onPointerLeave={hover.leave}
      >
        {add && (
          <Button
            size="sm"
            icon="plus"
            label={editor.t('block.add', { alt: IS_APPLE ? '⌥' : 'Alt' })}
            className="tei-block-add"
            data-tei-control="block-add"
            onClick={(event) => {
              editor
                .chain()
                .focus()
                .insertBlock(key, event.altKey ? 'before' : 'after', '/')
                .run();
            }}
          />
        )}
        <Button
          size="sm"
          icon="grip"
          label={label}
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          className="tei-block-grip"
          data-tei-control="block-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finish(event, true)}
          onPointerCancel={(event) => finish(event, false)}
          onClick={(event) => {
            const ended = dragged.current;
            dragged.current = false;
            // A key press clicks with detail 0: always the menu.
            if (ended && event.detail !== 0) return;
            setHeld(null);
            editor.commands.selectBlock(key);
            setMenu(menu ? null : { key, anchor: event.currentTarget });
          }}
        />
      </Popover>
      {drop && (
        <Popover
          open
          anchor={drop}
          placement="bottom-start"
          offset={-1}
          noFlip
          matchWidth
          dismissOnOutside={false}
          className="tei-block-drop"
          data-tei-control="block-drop"
          aria-hidden="true"
        />
      )}
      {drag && ghost && (
        <Popover
          open
          anchor={{
            getBoundingClientRect: () =>
              DOMRect.fromRect({ x: drag.x + 12, y: drag.y + 12, width: 0, height: 0 }),
          }}
          placement="bottom-start"
          offset={0}
          noFlip
          dismissOnOutside={false}
          className="tei-block-ghost"
          data-tei-control="block-ghost"
          aria-hidden="true"
          ref={(node) => {
            if (node && !node.contains(ghost)) node.replaceChildren(ghost);
            if (node) node.style.setProperty('--tei-ghost-width', `${el.offsetWidth}px`);
          }}
        />
      )}
      {menu && (
        <Popover
          open
          anchor={menu.anchor}
          placement={rtl ? 'bottom-end' : 'bottom-start'}
          restoreFocus={false}
          initialFocus="container"
          onDismiss={(reason) => {
            closeMenu();
            if (reason === 'escape') editor.focus();
          }}
          data-tei-control="block-menu"
        >
          <Menu groups={groups} label={editor.t('block.menu')} onClose={closeMenu} />
        </Popover>
      )}
    </>
  );
}
