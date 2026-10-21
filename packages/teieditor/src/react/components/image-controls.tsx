'use client';

import { $getSelection, $isNodeSelection, type NodeKey } from 'lexical';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getExtensionOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import { $getImage, Image, type ImageAlign, minImageWidth } from '../../extensions/image/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { useItemStates } from '../items.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import { DropdownMenu } from '../ui/dropdown.js';
import { Popover } from '../ui/popover.js';
import { Separator } from '../ui/toolbar.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';
import { ItemButton, itemControl, type ToolbarControl } from './editor-toolbar.js';
import { ImageInsertPopover, pickImages } from './image-insert.js';

// -- The selected image -------------------------------------------------------

interface Selected {
  key: NodeKey;
  /** `null` for an inline image in its line. */
  align: ImageAlign | null;
  inline: boolean;
  altText: string;
  /** The image itself is selected, not the caret in its caption. */
  whole: boolean;
}

const sameSelected = (a: Selected | null, b: Selected | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.key === b.key &&
    a.align === b.align &&
    a.inline === b.inline &&
    a.altText === b.altText &&
    a.whole === b.whole);

function useSelectedImage(editor: TeiEditor): Selected | null {
  return useEditorState(
    (e) =>
      e.read(() => {
        const node = $getImage();
        if (!node) return null;
        return {
          key: node.getKey(),
          align: node.getAlign(),
          inline: node.isInline(),
          altText: node.getAltText(),
          whole: $isNodeSelection($getSelection()),
        };
      }),
    { editor, equal: sameSelected },
  );
}

const imageElement = (editor: TeiEditor, key: NodeKey) =>
  editor.lexical.getElementByKey(key)?.querySelector('img') ?? null;

/** Alt text: a small form on the toolbar. */
function AltTextControl({ editor }: { editor: TeiEditor }) {
  const selected = useSelectedImage(editor);
  if (!selected) return null;
  const label = editor.t('image.altText');
  return (
    <DropdownMenu
      size="sm"
      icon="altText"
      chevron={false}
      label={label}
      aria-label={label}
      pressed={selected.altText !== ''}
      data-item="imageAltText"
      data-tei-control="image-alt"
      content={(close) => (
        <AltTextForm
          editor={editor}
          image={selected}
          onDone={() => {
            close();
            editor.focus();
          }}
        />
      )}
    />
  );
}

function AltTextForm({
  editor,
  image,
  onDone,
}: {
  editor: TeiEditor;
  image: Selected;
  onDone: () => void;
}) {
  const [text, setText] = useState(image.altText);
  const hintId = useId();
  return (
    <form
      className="tei-image-alt"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        editor.commands.setImageAltText(text, image.key);
        onDone();
      }}
    >
      <div className="tei-link-form">
        <Input
          value={text}
          placeholder={editor.t('image.altText.placeholder')}
          aria-label={editor.t('image.altText')}
          aria-describedby={hintId}
          data-tei-control="image-alt-input"
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" variant="solid" size="sm">
          {editor.t('image.save')}
        </Button>
      </div>
      <p id={hintId} className="tei-hint">
        {editor.t('image.altText.hint')}
      </p>
    </form>
  );
}

/** Replace: a new file for the selected image. */
function ReplaceControl({ editor }: { editor: TeiEditor }) {
  const selected = useSelectedImage(editor);
  if (!selected) return null;
  return (
    <Button
      size="sm"
      icon="replace"
      label={editor.t('image.replace')}
      data-item="imageReplace"
      data-tei-control="image-replace"
      onClick={() =>
        void pickImages(editor, false).then(([file]) => {
          if (file) editor.chain().focus().replaceImageFile(file, selected.key).run();
        })
      }
    />
  );
}

const IMAGE_CONTROLS: Record<string, ToolbarControl> = {
  imageAltText: AltTextControl,
  imageReplace: ReplaceControl,
};

/** The `imageMenu` items, by group, as buttons and the controls they name. */
function ImageToolbarItems({
  editor,
  controls,
}: {
  editor: TeiEditor;
  controls?: Record<string, ToolbarControl>;
}) {
  const items = useMemo(() => editor.items('imageMenu'), [editor]);
  const states = useItemStates(editor, items);
  const named = useMemo(() => ({ ...IMAGE_CONTROLS, ...controls }), [controls]);
  const out: React.ReactNode[] = [];
  let group: string | undefined;
  items.forEach((item: TeiItem, i) => {
    const state = states[i];
    if (out.length > 0 && item.group !== group) {
      out.push(<Separator key={`sep-${item.id}`} />);
    }
    group = item.group;
    const Control = itemControl(item, named);
    out.push(
      Control ? (
        <Control key={item.id} editor={editor} />
      ) : (
        <ItemButton key={item.id} editor={editor} item={item} state={state} />
      ),
    );
  });
  return <>{out}</>;
}

function ImageToolbar({
  editor,
  selected,
  hidden,
  controls,
}: {
  editor: TeiEditor;
  selected: Selected;
  hidden: boolean;
  controls?: Record<string, ToolbarControl>;
}) {
  const element = imageElement(editor, selected.key);
  if (!element) return null;
  return (
    <Popover
      open={!hidden}
      anchor={element}
      placement="top"
      offset={8}
      variant="bar"
      dismissOnOutside={false}
      role="toolbar"
      aria-label={editor.t('image.menu')}
      data-tei-control="image-toolbar"
    >
      <ImageToolbarItems editor={editor} controls={controls} />
    </Popover>
  );
}

// -- Resizing -----------------------------------------------------------------

type Corner = 'nw' | 'ne' | 'sw' | 'se';
const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];
/** A keyboard press on a handle resizes by this, in px; with Shift, ten times it. */
const KEY_STEP = 10;

/**
 * Handles on the selected image's corners. Dragging keeps its proportions; a
 * centred image grows from its middle. The document changes once, on release.
 */
function ImageResizer({
  editor,
  selected,
  onResizing,
}: {
  editor: TeiEditor;
  selected: Selected;
  onResizing: (resizing: boolean) => void;
}) {
  const options = getExtensionOptions(editor, Image);
  const frame = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  // Over the image, through the CSSOM, following it as the page moves.
  useEffect(() => {
    const el = frame.current;
    const img = imageElement(editor, selected.key);
    if (!el || !img) return;
    const place = () => {
      const rect = img.getBoundingClientRect();
      el.style.translate = `${Math.round(rect.left)}px ${Math.round(rect.top)}px`;
      el.style.inlineSize = `${Math.round(rect.width)}px`;
      el.style.blockSize = `${Math.round(rect.height)}px`;
    };
    if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) el.showPopover();
    place();
    const doc = el.ownerDocument;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    observer?.observe(img);
    doc.addEventListener('scroll', place, true);
    doc.defaultView?.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      doc.removeEventListener('scroll', place, true);
      doc.defaultView?.removeEventListener('resize', place);
    };
  }, [editor, selected.key]);

  if (!options) return null;

  /** The widest the image can be: its column. */
  const maxWidth = (img: HTMLImageElement) => {
    const host = img.closest('[data-tei-image]');
    return host?.parentElement?.clientWidth || Number.POSITIVE_INFINITY;
  };
  const clampWidth = (img: HTMLImageElement, width: number) =>
    Math.round(Math.min(maxWidth(img), Math.max(minImageWidth(options, selected.inline), width)));

  const commit = (img: HTMLImageElement, width: number) => {
    const ratio = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : null;
    const rect = img.getBoundingClientRect();
    const height = ratio ? width * ratio : (rect.height * width) / (rect.width || width);
    editor.commands.setImageSize(width, Math.round(height), selected.key);
  };

  const start = (corner: Corner) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const img = imageElement(editor, selected.key);
    if (!img || event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    // The handles sit on the physical corners: wider is away from the image.
    const sign = corner === 'nw' || corner === 'sw' ? -1 : 1;
    const grow = selected.align === 'center' ? 2 : 1;
    const startX = event.clientX;
    const startWidth = img.getBoundingClientRect().width;
    let width = startWidth;
    setActive(true);
    onResizing(true);
    const move = (e: PointerEvent) => {
      width = clampWidth(img, startWidth + (e.clientX - startX) * sign * grow);
      // A preview on the image itself; the document changes on release.
      img.style.setProperty('inline-size', `${width}px`);
      img.style.setProperty('block-size', 'auto');
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      img.style.removeProperty('inline-size');
      img.style.removeProperty('block-size');
      setActive(false);
      onResizing(false);
      if (Math.round(width) !== Math.round(startWidth)) commit(img, width);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const onKeyDown = (corner: Corner) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const img = imageElement(editor, selected.key);
    if (!img) return;
    const step = event.shiftKey ? KEY_STEP * 10 : KEY_STEP;
    const west = corner === 'nw' || corner === 'sw';
    const keys: Record<string, number> = {
      ArrowRight: west ? -step : step,
      ArrowLeft: west ? step : -step,
      ArrowUp: step,
      ArrowDown: -step,
    };
    const delta = keys[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    commit(img, clampWidth(img, img.getBoundingClientRect().width + delta));
  };

  return (
    <div
      ref={frame}
      popover="manual"
      className="tei-image-resizer tei-portal"
      data-tei-ui=""
      data-tei-control="image-resizer"
      data-active={active ? '' : undefined}
    >
      {CORNERS.map((corner) => (
        <button
          key={corner}
          type="button"
          className="tei-image-handle"
          data-corner={corner}
          aria-label={editor.t('image.resize')}
          onPointerDown={start(corner)}
          onKeyDown={onKeyDown(corner)}
        />
      ))}
    </div>
  );
}

// -- All together -------------------------------------------------------------

export interface ImageControlsProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** The insert popover that `openImageInsert` opens. Default true. */
  insert?: boolean;
  /** The toolbar over a selected image. Default true. */
  toolbar?: boolean;
  /** Drag a corner to resize. Default: the Image extension's `resizable`. */
  resizer?: boolean;
  /** Controls the `imageMenu` items name, besides (or replacing) the built-in ones. */
  controls?: Record<string, ToolbarControl>;
}

/**
 * The image UI: the insert popover (upload, drop or link) that
 * `openImageInsert` and the slash menu open, the toolbar over a selected
 * image (alignment, caption, alt text, replace, delete) and its resize
 * handles. Renders nothing without `Image`.
 *
 * Render it once inside `<EditorContent>` (`<Editor>` does).
 */
export function ImageControls({
  editor: editorProp,
  insert = true,
  toolbar = true,
  resizer = true,
  controls,
}: ImageControlsProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <ImageControls> needs an `editor` prop or a provider');
  const options = getExtensionOptions(editor, Image);
  const focused = useEditorFocus(editor);
  const editable = useEditorState((e) => e.isEditable, { editor });
  const selected = useSelectedImage(editor);
  const [resizing, setResizing] = useState(false);
  if (!options) return null;
  const shown = editable && focused && selected ? selected : null;
  return (
    <TeiEditorContext.Provider value={editor}>
      {insert && <ImageInsertPopover editor={editor} />}
      {toolbar && shown && (
        <ImageToolbar editor={editor} selected={shown} hidden={resizing} controls={controls} />
      )}
      {resizer && options.resizable && shown?.whole && shown.align !== 'full' && (
        <ImageResizer key={shown.key} editor={editor} selected={shown} onResizing={setResizing} />
      )}
    </TeiEditorContext.Provider>
  );
}
