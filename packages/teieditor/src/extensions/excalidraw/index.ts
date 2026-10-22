import { configExtension, type Signal, signal } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import {
  $addUpdateTag,
  $getNearestNodeFromDOMNode,
  $getPreviousSelection,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  HISTORY_MERGE_TAG,
  KEY_ENTER_COMMAND,
  mergeRegister,
  type NodeKey,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import {
  $caretAfter,
  $insertBlockAtSelection,
  $liftBlock,
  $removeBlockHost,
  $selectNode,
  registerHostSelection,
  registerSelectedAttribute,
} from '../../core/slot-host.js';
import type { TeiItem } from '../../core/types.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import {
  altText,
  imageCenter,
  imageEnd,
  imageStart,
  pencil,
  shapes,
  trash,
} from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';
import {
  $createExcalidrawNode,
  $getExcalidraw,
  $isExcalidrawNode,
  EXCALIDRAW_ALIGNS,
  EXCALIDRAW_EXTENSION,
  type ExcalidrawAlign,
  ExcalidrawNode,
} from './node.js';
import { cleanPreview, cleanScene, MAX_SCENE_SIZE, parseScene } from './scene.js';

export type { ExcalidrawAlign, SerializedExcalidrawNode } from './node.js';
export {
  $createExcalidrawNode,
  $getExcalidraw,
  $isExcalidrawNode,
  EXCALIDRAW_ALIGNS,
  EXCALIDRAW_EXTENSION,
  ExcalidrawNode,
} from './node.js';
export type { ExcalidrawElement, ExcalidrawFile, ExcalidrawScene } from './scene.js';
export {
  cleanPreview,
  cleanScene,
  EMPTY_SCENE,
  MAX_PREVIEW_SIZE,
  MAX_SCENE_SIZE,
  parseScene,
  sanitizeSvg,
  svgDataURL,
} from './scene.js';

/**
 * What the UI uses of `@excalidraw/excalidraw`: its editor component and
 * its SVG export. Typed loosely, so this module needs none of its types.
 */
export interface ExcalidrawModule {
  Excalidraw: (props: any) => unknown;
  exportToSvg: (options: {
    elements: readonly unknown[];
    files: Record<string, unknown> | null;
    appState?: Record<string, unknown>;
    exportPadding?: number;
  }) => Promise<SVGSVGElement>;
}

export interface ExcalidrawOptions {
  /**
   * Loads Excalidraw, the first time a drawing is opened (or one without a
   * preview is shown). Default `import('@excalidraw/excalidraw')`. Its
   * stylesheet is yours to import: `@excalidraw/excalidraw/index.css`.
   */
  load: () => Promise<ExcalidrawModule>;
  /** The biggest scene a drawing holds, as JSON. Default 5 MB. */
  maxSceneSize: number;
  /** Drawings can be resized by dragging their corners. Default true. */
  resizable: boolean;
  /** The narrowest a drawing can be made, in px. Default 64. */
  minWidth: number;
}

/** A drawing to insert or save: its scene, and the SVG preview made of it. */
export interface ExcalidrawData {
  elements: readonly unknown[];
  files?: Record<string, unknown>;
  /** An SVG `data:` URL; anything else is left out. */
  preview?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ExcalidrawStorage {
  /** `openExcalidraw`'s requests to the UI. */
  readonly dialog: UiRequest;
  /** The drawing the dialog is for. */
  readonly dialogFor: Signal<NodeKey | null>;
}

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /**
     * A drawing where the caret is. Without `data`, an empty one, opened in
     * Excalidraw where there is a UI (and taken out again if left empty).
     */
    insertExcalidraw: [data?: ExcalidrawData];
    /** Open the selected drawing (or the one with `key`) in Excalidraw, where there is a UI. */
    openExcalidraw: [key?: NodeKey];
    /** A new scene and preview for the selected drawing (or the one with `key`). */
    setExcalidrawScene: [data: ExcalidrawData, key?: NodeKey];
    /** A new preview only, made again from the scene: no step of its own to undo. */
    setExcalidrawPreview: [preview: string, key?: NodeKey];
    /** The shown size in px; `null` for the drawing's own. */
    setExcalidrawSize: [width: number | null, height?: number | null, key?: NodeKey];
    setExcalidrawAlign: [align: ExcalidrawAlign, key?: NodeKey];
    setExcalidrawAltText: [altText: string, key?: NodeKey];
    removeExcalidraw: [key?: NodeKey];
  }
  interface TeiActiveStates {
    /** A drawing is selected. */
    excalidraw: [];
    excalidrawAlign: [align: ExcalidrawAlign];
  }
}

const $hasDrawing = () => $getExcalidraw() !== null;

/** Where a drawing can go: a caret, a text selection, or a selected node (it goes after). */
function $canInsert(): boolean {
  const selection = $getSelection() ?? $getPreviousSelection();
  return $isRangeSelection(selection) || $isNodeSelection(selection);
}

/** Ask the UI to open the drawing; `false` when there is no UI. */
function openDialog(storage: ExcalidrawStorage, key: NodeKey): boolean {
  if (!hasUi(storage.dialog)) return false;
  storage.dialogFor.value = key;
  return requestUi(storage.dialog);
}

// -- HTML ---------------------------------------------------------------------

const px = (el: Element | null, name: string) => {
  const value = Number.parseInt(el?.getAttribute(name) ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** Ours: `<div data-tei-excalidraw data-scene>` round the preview's `<img>`. */
const EXCALIDRAW_RULE = defineImportRule({
  name: EXCALIDRAW_EXTENSION,
  match: sel.tag('div'),
  $import: (_ctx, el, $next) => {
    if (!el.hasAttribute('data-tei-excalidraw')) return $next();
    const scene = parseScene(el.getAttribute('data-scene'));
    if (!scene) return [];
    const img = el.querySelector('img');
    const align = el.getAttribute('data-align') as ExcalidrawAlign | null;
    return [
      $createExcalidrawNode({
        scene,
        preview: cleanPreview(img?.getAttribute('src')),
        altText: img?.getAttribute('alt') ?? '',
        width: px(img, 'width'),
        height: px(img, 'height'),
        align: align && EXCALIDRAW_ALIGNS.includes(align) ? align : undefined,
      }),
    ];
  },
});

/** Lexical's playground's: `<span data-lexical-excalidraw-json>` round an inline `<svg>`, which is not kept. */
const LEXICAL_RULE = defineImportRule({
  name: `${EXCALIDRAW_EXTENSION}/lexical`,
  match: sel.tag('span', 'div'),
  $import: (_ctx, el, $next) => {
    const scene = parseScene(el.getAttribute('data-lexical-excalidraw-json'));
    return scene ? [$createExcalidrawNode({ scene })] : $next();
  },
});

// -- Extension ----------------------------------------------------------------

const ALIGN_ICONS: Record<ExcalidrawAlign, string> = {
  start: 'imageStart',
  center: 'imageCenter',
  end: 'imageEnd',
};

const menuItem = (item: Omit<TeiItem, 'in'>): TeiItem => ({ in: ['excalidrawMenu'], ...item });

/**
 * Drawings, made in Excalidraw: a block that shows an SVG picture of its
 * scene, and opens Excalidraw in a dialog to draw (a double click, Enter
 * with it selected, or its toolbar's Edit). Excalidraw itself loads only
 * then, so it costs nothing before. Resized from its corners, aligned,
 * with alt text. Saved as `<div data-tei-excalidraw data-scene>` round an
 * `<img>` of the SVG (a `data:` URL, checked: nothing in it can run), which
 * any page shows as it is, and which reads back whole.
 *
 * The picture is drawn light; in a dark theme the stylesheet inverts it, as
 * Excalidraw's own dark mode does.
 *
 * In React, `<ExcalidrawControls>` is the dialog, the toolbar over a
 * selected drawing and its resize handles. Import Excalidraw's stylesheet,
 * `@excalidraw/excalidraw/index.css`, where you use it.
 */
export const Excalidraw = defineTeiExtension({
  name: EXCALIDRAW_EXTENSION,
  config: {
    // The literal specifier keeps Excalidraw a chunk of its own in an app's bundle.
    load: () => import('@excalidraw/excalidraw') as unknown as Promise<ExcalidrawModule>,
    maxSceneSize: MAX_SCENE_SIZE,
    resizable: true,
    minWidth: 64,
  } as ExcalidrawOptions,
  nodes: [ExcalidrawNode],
  dependencies: [
    RichText,
    configExtension(DOMImportExtension, { rules: [EXCALIDRAW_RULE, LEXICAL_RULE] }),
  ],
  storage: (): ExcalidrawStorage => ({ dialog: uiRequest(), dialogFor: signal(null) }),
  register: (ctx) => {
    const { lexical, editor, storage } = ctx;
    // A double click on a drawing opens it, when there is a UI.
    const onDoubleClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.('[data-tei-excalidraw]');
      if (!target || !lexical.isEditable() || !hasUi(storage.dialog)) return;
      const key = lexical.read(() => {
        const node = $getNearestNodeFromDOMNode(target);
        return $isExcalidrawNode(node) ? node.getKey() : null;
      });
      if (key !== null) editor.commands.openExcalidraw(key);
    };
    return mergeRegister(
      registerHostSelection(lexical, $isExcalidrawNode),
      registerSelectedAttribute(lexical, $isExcalidrawNode),
      lexical.registerNodeTransform(ExcalidrawNode, $liftBlock),
      // What an empty drawing shows, in the editor's language.
      lexical.registerMutationListener(
        ExcalidrawNode,
        (mutations) => {
          for (const [key, kind] of mutations) {
            if (kind === 'destroyed') continue;
            const dom = lexical.getElementByKey(key);
            if (!dom) continue;
            const empty = editor.t('excalidraw.empty');
            dom.setAttribute('data-placeholder', empty);
            dom.setAttribute('aria-label', editor.t('excalidraw.label'));
          }
        },
        { skipInitialization: false },
      ),
      lexical.registerRootListener((root, prev) => {
        prev?.removeEventListener('dblclick', onDoubleClick);
        root?.addEventListener('dblclick', onDoubleClick);
      }),
      lexical.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          const node = $getExcalidraw();
          if (!node || !openDialog(storage, node.getKey())) return false;
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  },
  commands: {
    insertExcalidraw: {
      run: ({ storage, options }, data?: ExcalidrawData) => {
        if (!$canInsert()) return false;
        const scene = data ? cleanScene(data, options.maxSceneSize) : null;
        if (data && !scene) return false;
        const node = $insertBlockAtSelection(
          $createExcalidrawNode({
            scene: scene ?? undefined,
            preview: data?.preview,
            width: data?.width,
            height: data?.height,
          }),
        );
        if (!data && openDialog(storage, node.getKey())) $selectNode(node);
        else $caretAfter(node);
      },
      can: ({ options }, data?: ExcalidrawData) =>
        $canInsert() && (data === undefined || cleanScene(data, options.maxSceneSize) !== null),
    },
    openExcalidraw: {
      run: ({ storage }, key?: NodeKey) => {
        const node = $getExcalidraw(key);
        return node !== null && openDialog(storage, node.getKey());
      },
      can: ({ storage }, key?: NodeKey) => hasUi(storage.dialog) && $getExcalidraw(key) !== null,
    },
    setExcalidrawScene: {
      run: ({ options }, data: ExcalidrawData, key?: NodeKey) => {
        const node = $getExcalidraw(key);
        const scene = cleanScene(data, options.maxSceneSize);
        if (!node || !scene) return false;
        node.setScene(scene).setPreview(data.preview ?? null);
        if (data.width !== undefined) node.setSize(data.width, data.height ?? null);
      },
      can: ({ options }, data?: ExcalidrawData, key?: NodeKey) =>
        $getExcalidraw(key) !== null &&
        (data === undefined || cleanScene(data, options.maxSceneSize) !== null),
    },
    setExcalidrawPreview: {
      run: (_ctx, preview: string, key?: NodeKey) => {
        const node = $getExcalidraw(key);
        const clean = cleanPreview(preview);
        if (!node || !clean) return false;
        if (clean === node.getPreview()) return;
        $addUpdateTag(HISTORY_MERGE_TAG);
        node.setPreview(clean);
      },
      can: (_ctx, preview?: string, key?: NodeKey) =>
        $getExcalidraw(key) !== null && (preview === undefined || cleanPreview(preview) !== null),
    },
    setExcalidrawSize: {
      run: ({ options }, width: number | null, height?: number | null, key?: NodeKey) => {
        const node = $getExcalidraw(key);
        if (!node || !options.resizable) return false;
        if (width === null) {
          node.setSize(null);
          return;
        }
        if (!Number.isFinite(width)) return false;
        const w = Math.max(options.minWidth, width);
        const h = height && Number.isFinite(height) ? (height * w) / width : null;
        node.setSize(w, h);
      },
      can: ({ options }) => options.resizable && $hasDrawing(),
    },
    setExcalidrawAlign: {
      run: (_ctx, align: ExcalidrawAlign, key?: NodeKey) => {
        const node = $getExcalidraw(key);
        if (!node || !EXCALIDRAW_ALIGNS.includes(align)) return false;
        node.setAlign(align);
      },
      can: $hasDrawing,
    },
    setExcalidrawAltText: {
      run: (_ctx, text: string, key?: NodeKey) => {
        const node = $getExcalidraw(key);
        if (!node || typeof text !== 'string') return false;
        node.setAltText(text.trim());
      },
      can: $hasDrawing,
    },
    removeExcalidraw: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getExcalidraw(key);
        if (!node) return false;
        // An empty one leaving (a new drawing closed unsaved) is no step of its own.
        if (node.isEmpty()) $addUpdateTag(HISTORY_MERGE_TAG);
        $removeBlockHost(node);
      },
      can: $hasDrawing,
    },
  },
  active: {
    excalidraw: $hasDrawing,
    excalidrawAlign: (_ctx, align: ExcalidrawAlign) => $getExcalidraw()?.getAlign() === align,
  },
  icons: { shapes, pencil, altText, imageStart, imageCenter, imageEnd, trash },
  messages: {
    'excalidraw.insert': 'Drawing',
    'excalidraw.insert.description': 'Sketch a diagram in Excalidraw',
    'excalidraw.menu': 'Drawing',
    'excalidraw.label': 'Drawing',
    'excalidraw.empty': 'Empty drawing: double-click to draw',
    'excalidraw.edit': 'Edit drawing',
    'excalidraw.dialog': 'Drawing',
    'excalidraw.loading': 'Loading Excalidraw…',
    'excalidraw.unavailable': 'Excalidraw could not be loaded.',
    'excalidraw.save': 'Save',
    'excalidraw.cancel': 'Cancel',
    'excalidraw.close': 'Close',
    'excalidraw.discard': 'Discard changes?',
    'excalidraw.discard.confirm': 'Discard',
    'excalidraw.discard.keep': 'Keep drawing',
    'excalidraw.align.start': 'Align left',
    'excalidraw.align.center': 'Align centre',
    'excalidraw.align.end': 'Align right',
    'excalidraw.altText': 'Alt text',
    'excalidraw.altText.placeholder': 'Describe the drawing',
    'excalidraw.altText.save': 'Save',
    'excalidraw.resize': 'Resize drawing',
    'excalidraw.remove': 'Delete drawing',
  },
  items: [
    {
      id: 'insertExcalidraw',
      label: 'excalidraw.insert',
      description: 'excalidraw.insert.description',
      icon: 'shapes',
      in: ['slash', 'insert'],
      group: 'insert',
      order: 65,
      keywords: ['drawing', 'draw', 'excalidraw', 'sketch', 'diagram', 'whiteboard', 'canvas'],
      command: 'insertExcalidraw',
    },
    menuItem({
      id: 'excalidrawEdit',
      label: 'excalidraw.edit',
      icon: 'pencil',
      group: 'edit',
      order: 0,
      command: 'openExcalidraw',
    }),
    ...EXCALIDRAW_ALIGNS.map((align, order) =>
      menuItem({
        id: `excalidrawAlign.${align}`,
        label: `excalidraw.align.${align}`,
        icon: ALIGN_ICONS[align],
        group: 'align',
        order,
        command: 'setExcalidrawAlign',
        args: [align],
        active: 'excalidrawAlign',
        activeArgs: [align],
      }),
    ),
    menuItem({
      id: 'excalidrawAltText',
      label: 'excalidraw.altText',
      icon: 'altText',
      group: 'edit',
      order: 1,
      control: 'excalidrawAltText',
    }),
    menuItem({
      id: 'removeExcalidraw',
      variant: 'danger',
      label: 'excalidraw.remove',
      icon: 'trash',
      group: 'remove',
      order: 0,
      command: 'removeExcalidraw',
    }),
  ],
});
