'use client';

import { $getSelection, $isNodeSelection, type NodeKey } from 'lexical';
import {
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getPeerOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type {
  ExcalidrawModule,
  ExcalidrawOptions,
  ExcalidrawStorage,
} from '../../extensions/excalidraw/index.js';
import {
  $getExcalidraw,
  type ExcalidrawAlign,
  ExcalidrawNode,
} from '../../extensions/excalidraw/node.js';
import {
  cleanScene,
  type ExcalidrawScene,
  sanitizeSvg,
  svgDataURL,
} from '../../extensions/excalidraw/scene.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import { Dialog } from '../ui/dialog.js';
import { DropdownMenu } from '../ui/dropdown.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';
import { useUiRequest } from '../use-ui-request.js';
import type { ToolbarControl } from './editor-toolbar.js';
import { NodeToolbar } from './node-toolbar.js';

/** The extension, by name: the UI never imports it. */
const EXCALIDRAW = '@teispace/teieditor/excalidraw';

const optionsOf = (editor: TeiEditor) =>
  getPeerOptions<ExcalidrawOptions>(editor.lexical, EXCALIDRAW);
const storageOf = (editor: TeiEditor) =>
  (editor.extension(EXCALIDRAW)?.output as { storage?: ExcalidrawStorage } | undefined)?.storage;

/** Excalidraw, loaded once per loader. */
const modules = new WeakMap<object, Promise<ExcalidrawModule>>();
function loadExcalidraw(options: ExcalidrawOptions): Promise<ExcalidrawModule> {
  let promise = modules.get(options.load);
  if (!promise) {
    promise = options.load();
    // A failed load can be tried again.
    promise.catch(() => modules.delete(options.load));
    modules.set(options.load, promise);
  }
  return promise;
}

/**
 * The picture of a scene: Excalidraw's SVG export, light, on no background
 * (the stylesheet inverts it in a dark theme), cleaned of anything that runs
 * or loads, as a `data:` URL, with its size.
 */
export async function exportPreview(
  excalidraw: ExcalidrawModule,
  scene: ExcalidrawScene,
): Promise<{ src: string; width: number | null; height: number | null } | null> {
  if (scene.elements.length === 0) return null;
  const svg = await excalidraw.exportToSvg({
    elements: scene.elements,
    files: scene.files as Record<string, unknown>,
    appState: { exportBackground: false, exportWithDarkMode: false },
    exportPadding: 8,
  });
  sanitizeSvg(svg);
  const dimension = (name: string) => {
    const value = Number.parseFloat(svg.getAttribute(name) ?? '');
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  };
  const markup = new XMLSerializer().serializeToString(svg);
  return { src: svgDataURL(markup), width: dimension('width'), height: dimension('height') };
}

/** Whether the editor shows dark: its frame's `data-theme`, a `.dark` page, or the system's. */
function isDark(el: Element | null): boolean {
  const themed = el?.closest('[data-theme], .dark, .light');
  const theme = themed?.getAttribute('data-theme');
  if (theme === 'dark' || (theme !== 'light' && themed?.classList.contains('dark'))) return true;
  if (theme === 'light' || themed?.classList.contains('light')) return false;
  const view = el?.ownerDocument.defaultView;
  return view?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// -- The selected drawing -----------------------------------------------------

interface Selected {
  key: NodeKey;
  align: ExcalidrawAlign;
  altText: string;
}

function useSelectedDrawing(editor: TeiEditor): Selected | null {
  return useEditorState(
    (e) =>
      e.read(() => {
        const node = $isNodeSelection($getSelection()) ? $getExcalidraw() : null;
        return node
          ? { key: node.getKey(), align: node.getAlign(), altText: node.getAltText() }
          : null;
      }),
    {
      editor,
      equal: (a, b) =>
        a === b ||
        (a !== null &&
          b !== null &&
          a.key === b.key &&
          a.align === b.align &&
          a.altText === b.altText),
    },
  );
}

const drawingElement = (editor: TeiEditor, key: NodeKey) => editor.lexical.getElementByKey(key);

/** Alt text: a small form on the toolbar. */
function AltTextControl({ editor }: { editor: TeiEditor }) {
  const selected = useSelectedDrawing(editor);
  if (!selected) return null;
  const label = editor.t('excalidraw.altText');
  return (
    <DropdownMenu
      size="sm"
      icon="altText"
      chevron={false}
      label={label}
      aria-label={label}
      pressed={selected.altText !== ''}
      data-item="excalidrawAltText"
      data-tei-control="excalidraw-alt"
      content={(close) => (
        <AltTextForm
          editor={editor}
          drawing={selected}
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
  drawing,
  onDone,
}: {
  editor: TeiEditor;
  drawing: Selected;
  onDone: () => void;
}) {
  const [text, setText] = useState(drawing.altText);
  return (
    <form
      className="tei-link-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        editor.commands.setExcalidrawAltText(text, drawing.key);
        onDone();
      }}
    >
      <Input
        value={text}
        placeholder={editor.t('excalidraw.altText.placeholder')}
        aria-label={editor.t('excalidraw.altText')}
        data-tei-control="excalidraw-alt-input"
        onChange={(event) => setText(event.target.value)}
      />
      <Button type="submit" variant="solid" size="sm">
        {editor.t('excalidraw.altText.save')}
      </Button>
    </form>
  );
}

const CONTROLS: Record<string, ToolbarControl> = { excalidrawAltText: AltTextControl };

// -- Resizing -----------------------------------------------------------------

type Corner = 'nw' | 'ne' | 'sw' | 'se';
const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];
/** A keyboard press on a handle resizes by this, in px; with Shift, ten times it. */
const KEY_STEP = 10;

/**
 * Handles on the selected drawing's corners, as an image has: dragging
 * keeps its proportions, a centred one grows from its middle, and the
 * document changes once, on release.
 */
function DrawingResizer({
  editor,
  selected,
  options,
  onResizing,
}: {
  editor: TeiEditor;
  selected: Selected;
  options: ExcalidrawOptions;
  onResizing: (resizing: boolean) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const picture = () => drawingElement(editor, selected.key)?.querySelector('img') ?? null;

  useEffect(() => {
    const el = frame.current;
    const img = drawingElement(editor, selected.key)?.querySelector('img');
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

  const clamp = (img: HTMLImageElement, width: number) => {
    const column = img.closest('[data-tei-excalidraw]')?.parentElement?.clientWidth;
    return Math.round(
      Math.min(column || Number.POSITIVE_INFINITY, Math.max(options.minWidth, width)),
    );
  };
  const commit = (img: HTMLImageElement, width: number) => {
    const ratio = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : null;
    const rect = img.getBoundingClientRect();
    const height = ratio ? width * ratio : (rect.height * width) / (rect.width || width);
    editor.commands.setExcalidrawSize(width, Math.round(height), selected.key);
  };

  const start = (corner: Corner) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const img = picture();
    if (!img || event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const sign = corner === 'nw' || corner === 'sw' ? -1 : 1;
    const grow = selected.align === 'center' ? 2 : 1;
    const startX = event.clientX;
    const startWidth = img.getBoundingClientRect().width;
    let width = startWidth;
    setActive(true);
    onResizing(true);
    const move = (e: PointerEvent) => {
      width = clamp(img, startWidth + (e.clientX - startX) * sign * grow);
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
    const img = picture();
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
    commit(img, clamp(img, img.getBoundingClientRect().width + delta));
  };

  return (
    <div
      ref={frame}
      popover="manual"
      className="tei-image-resizer tei-portal"
      data-tei-ui=""
      data-tei-control="excalidraw-resizer"
      data-active={active ? '' : undefined}
    >
      {CORNERS.map((corner) => (
        <button
          key={corner}
          type="button"
          className="tei-image-handle"
          data-corner={corner}
          aria-label={editor.t('excalidraw.resize')}
          onPointerDown={start(corner)}
          onKeyDown={onKeyDown(corner)}
        />
      ))}
    </div>
  );
}

// -- The dialog ---------------------------------------------------------------

/** What Excalidraw's API gives back, as far as the dialog uses it. */
interface ExcalidrawApi {
  getSceneElements: () => readonly unknown[];
  getFiles: () => Record<string, unknown>;
}

/** Elements and their versions: whether anything was drawn since it opened. */
const signature = (elements: readonly unknown[]) =>
  elements
    .map((el) => {
      const { id, version } = el as { id?: unknown; version?: unknown };
      return `${String(id)}:${String(version)}`;
    })
    .join(',');

type Phase = { kind: 'loading' } | { kind: 'ready'; module: ExcalidrawModule } | { kind: 'failed' };

/** Excalidraw in a dialog, for one drawing; Save writes its scene and a new preview. */
function DrawingDialog({
  editor,
  options,
  nodeKey,
  onClose,
}: {
  editor: TeiEditor;
  options: ExcalidrawOptions;
  nodeKey: NodeKey;
  onClose: () => void;
}) {
  const t = (id: string) => editor.t(id);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const api = useRef<ExcalidrawApi | null>(null);
  // The scene as it opened, read once.
  const initial = useMemo(
    () =>
      editor.read(() => {
        const node = $getExcalidraw(nodeKey);
        return node ? { scene: node.getScene(), width: node.getWidth() } : null;
      }),
    [editor, nodeKey],
  );
  const dark = useMemo(() => isDark(editor.lexical.getRootElement()), [editor]);
  const opened = useMemo(() => signature(initial?.scene.elements ?? []), [initial]);

  useEffect(() => {
    let live = true;
    loadExcalidraw(options).then(
      (module) => live && setPhase({ kind: 'ready', module }),
      () => live && setPhase({ kind: 'failed' }),
    );
    return () => {
      live = false;
    };
  }, [options]);

  /** The scene now, if Excalidraw is up. */
  const current = (): ExcalidrawScene | null => {
    if (!api.current) return null;
    return cleanScene({ elements: api.current.getSceneElements(), files: api.current.getFiles() });
  };
  const changed = () => {
    const scene = current();
    return scene !== null && signature(scene.elements) !== opened;
  };

  /** Close; a drawing still empty (new, never saved) goes. */
  const close = () => {
    onClose();
    const empty = editor.read(() => $getExcalidraw(nodeKey)?.isEmpty() ?? false);
    if (empty) editor.chain().focus().removeExcalidraw(nodeKey).run();
    else editor.focus();
  };
  const dismiss = () => {
    if (changed()) setConfirming(true);
    else close();
  };
  const save = async () => {
    if (phase.kind !== 'ready' || saving) return;
    const scene = current();
    if (!scene) return;
    if (scene.elements.length === 0) {
      onClose();
      editor.chain().focus().removeExcalidraw(nodeKey).run();
      return;
    }
    setSaving(true);
    let preview: Awaited<ReturnType<typeof exportPreview>> = null;
    try {
      preview = await exportPreview(phase.module, scene);
    } catch {
      // The scene is saved; the picture is made again when it next shows.
    }
    // Kept at its width, at the new picture's proportions.
    const width = initial?.width ?? null;
    const height =
      width !== null && preview?.width && preview.height
        ? Math.round((width * preview.height) / preview.width)
        : null;
    editor.commands.setExcalidrawScene(
      {
        elements: scene.elements,
        files: scene.files as Record<string, unknown>,
        preview: preview?.src ?? null,
        ...(width !== null ? { width, height } : {}),
      },
      nodeKey,
    );
    onClose();
    editor.focus();
  };

  const Canvas = phase.kind === 'ready' ? (phase.module.Excalidraw as ComponentType<any>) : null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      title={t('excalidraw.dialog')}
      closeLabel={t('excalidraw.close')}
      className="tei-excalidraw-dialog"
      // Enter in one of Excalidraw's fields must not submit, and so close, the dialog.
      onSubmit={() => {}}
      footer={
        confirming ? (
          <>
            <span className="tei-excalidraw-confirm" role="alert">
              {t('excalidraw.discard')}
            </span>
            <Button size="sm" onClick={() => setConfirming(false)}>
              {t('excalidraw.discard.keep')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              data-tei-control="excalidraw-discard"
              onClick={close}
            >
              {t('excalidraw.discard.confirm')}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" data-tei-control="excalidraw-cancel" onClick={dismiss}>
              {t('excalidraw.cancel')}
            </Button>
            <Button
              variant="solid"
              size="sm"
              disabled={phase.kind !== 'ready' || saving}
              data-tei-control="excalidraw-save"
              onClick={() => void save()}
            >
              {t('excalidraw.save')}
            </Button>
          </>
        )
      }
    >
      <div
        className="tei-excalidraw-canvas"
        data-tei-control="excalidraw-canvas"
        aria-busy={phase.kind === 'loading' ? true : undefined}
      >
        {Canvas ? (
          <Canvas
            initialData={{
              elements: initial?.scene.elements ?? [],
              files: initial?.scene.files ?? {},
              appState: { viewBackgroundColor: 'transparent' },
              scrollToContent: true,
            }}
            excalidrawAPI={(value: ExcalidrawApi) => {
              api.current = value;
            }}
            theme={dark ? 'dark' : 'light'}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
          />
        ) : (
          <p className="tei-excalidraw-status" role="status">
            {phase.kind === 'failed' ? t('excalidraw.unavailable') : t('excalidraw.loading')}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Pictures for drawings that have none (saved without one, or from
 * Lexical's playground): made with Excalidraw, which loads only when such a
 * drawing is in the document. Not an undo step. Each drawing is tried once.
 */
function PreviewMaker({ editor, options }: { editor: TeiEditor; options: ExcalidrawOptions }) {
  useEffect(() => {
    const tried = new Set<NodeKey>();
    const live = true;
    const make = (keys: NodeKey[]) =>
      loadExcalidraw(options)
        .then(async (module) => {
          for (const key of keys) {
            const scene = editor.read(() => $getExcalidraw(key)?.getScene() ?? null);
            const preview = scene && (await exportPreview(module, scene));
            if (live && preview) editor.commands.setExcalidrawPreview(preview.src, key);
          }
        })
        .catch(() => {});
    return editor.lexical.registerMutationListener(
      ExcalidrawNode,
      (mutations) => {
        if (!editor.isEditable) return;
        const keys = editor.read(() =>
          Array.from(mutations.keys()).filter((key) => {
            const node = $getExcalidraw(key);
            return node !== null && !node.getPreview() && !node.isEmpty() && !tried.has(key);
          }),
        );
        for (const key of keys) tried.add(key);
        if (keys.length > 0) void make(keys);
      },
      { skipInitialization: false },
    );
  }, [editor, options]);
  return null;
}

// -- All together -------------------------------------------------------------

export interface ExcalidrawControlsProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** The dialog `openExcalidraw` opens. Default true. */
  dialog?: boolean;
  /** The toolbar over a selected drawing. Default true. */
  toolbar?: boolean;
  /** Drag a corner to resize. Default: the extension's `resizable`. */
  resizer?: boolean;
  /** Controls the `excalidrawMenu` items name, besides (or replacing) the built-in ones. */
  controls?: Record<string, ToolbarControl>;
}

/**
 * The drawing UI: Excalidraw in a dialog (from `openExcalidraw`, a double
 * click, Enter on a selected drawing, or a new one), the toolbar over a
 * selected drawing (edit, alignment, alt text, delete) and its resize
 * handles. Excalidraw loads only when the dialog opens, or to make the
 * picture of a drawing that has none. Renders nothing without the
 * Excalidraw extension.
 *
 * Render it once inside `<EditorContent>`.
 */
export function ExcalidrawControls({
  editor: editorProp,
  dialog = true,
  toolbar = true,
  resizer = true,
  controls,
}: ExcalidrawControlsProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor)
    throw new Error('teieditor: <ExcalidrawControls> needs an `editor` prop or a provider');
  const options = useMemo(() => optionsOf(editor), [editor]);
  const storage = storageOf(editor);
  const focused = useEditorFocus(editor);
  const editable = useEditorState((e) => e.isEditable, { editor });
  const selected = useSelectedDrawing(editor);
  const [resizing, setResizing] = useState(false);
  const [open, setOpen] = useState<NodeKey | null>(null);
  useUiRequest(dialog ? storage?.dialog : undefined, () =>
    setOpen(storage?.dialogFor.peek() ?? null),
  );
  const named = useMemo(() => ({ ...CONTROLS, ...controls }), [controls]);
  if (!options || !storage) return null;
  const shown = editable && focused && selected && open === null ? selected : null;
  const anchor = shown ? drawingElement(editor, shown.key) : null;
  return (
    <TeiEditorContext.Provider value={editor}>
      {toolbar && shown && anchor && (
        <NodeToolbar
          editor={editor}
          anchor={anchor}
          placement="excalidrawMenu"
          label={editor.t('excalidraw.menu')}
          control="excalidraw-toolbar"
          hidden={resizing}
          controls={named}
        />
      )}
      {resizer && options.resizable && shown && anchor?.querySelector('img') && (
        <DrawingResizer
          key={shown.key}
          editor={editor}
          selected={shown}
          options={options}
          onResizing={setResizing}
        />
      )}
      {dialog && open !== null && (
        <DrawingDialog
          key={open}
          editor={editor}
          options={options}
          nodeKey={open}
          onClose={() => setOpen(null)}
        />
      )}
      <PreviewMaker editor={editor} options={options} />
    </TeiEditorContext.Provider>
  );
}
