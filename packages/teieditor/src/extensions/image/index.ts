import { configExtension, type Signal, signal } from '@lexical/extension';
import {
  DOMImportExtension,
  DOMRenderExtension,
  defineImportRule,
  domOverride,
  InlineSchema,
  sel,
} from '@lexical/html';
import type { ElementTransformer } from '@lexical/markdown';
import { DRAG_DROP_PASTE } from '@lexical/rich-text';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getPreviousSelection,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $onUpdate,
  $setSlot,
  COMMAND_PRIORITY_LOW,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
} from 'lexical';
import {
  defineTeiExtension,
  getExtensionOptions,
  type TeiExtension,
  type TeiExtensionContext,
} from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  $caretAfter,
  $findSlotHost,
  $insertBlock,
  $liftBlock,
  $selectNode,
  registerHostSelection,
  registerSelectedAttribute,
  registerSlotKeys,
} from '../../core/slot-host.js';
import type { TeiItem } from '../../core/types.js';
import {
  altText,
  caption,
  imageCenter,
  imageEnd,
  imageFull,
  image as imageIcon,
  imageStart,
  replace,
  trash,
  upload as uploadIcon,
} from '../../icons/index.js';
import { acceptsFile, chooseFiles, readAsDataURL } from '../../utils/files.js';
import { isSafeImageSrc } from '../../utils/url.js';
import { RichText } from '../rich-text/index.js';
import {
  $createImageNode,
  $isImageNode,
  IMAGE_ALIGNS,
  type ImageAlign,
  ImageNode,
} from './node.js';

export type { SerializedImageNode } from './node.js';
export {
  $createImageNode,
  $isImageNode,
  IMAGE_ALIGNS,
  type ImageAlign,
  ImageNode,
} from './node.js';

/** An image to insert. */
export interface ImageData {
  src: string;
  altText?: string;
  width?: number | null;
  height?: number | null;
  align?: ImageAlign;
  /** A caption: its text, or `true` for an empty one to type in. */
  caption?: string | boolean;
}

/** What an upload handler gets besides the file. */
export interface ImageUploadContext {
  /** Report progress, 0 to 1; the image shows it while it uploads. */
  onProgress: (fraction: number) => void;
  /** Aborts when the image is removed before its upload finishes. */
  signal: AbortSignal;
  editor: TeiEditor;
}

/** A hosted image's URL, or that and what the server knows of it. */
export type ImageUploadResult =
  | string
  | { src: string; width?: number; height?: number; altText?: string };

export type ImageUploadHandler = (
  file: File,
  context: ImageUploadContext,
) => Promise<ImageUploadResult>;

/** Why a file did not become an image. */
export class ImageUploadError extends Error {
  constructor(
    readonly code: 'size' | 'upload' | 'unsafe',
    readonly file: File,
    options?: { cause?: unknown },
  ) {
    super(
      code === 'size'
        ? `${file.name} is too large`
        : code === 'unsafe'
          ? `${file.name} came back with a URL that is not an image's`
          : `${file.name} could not be uploaded`,
      options,
    );
    this.name = 'ImageUploadError';
  }
}

export interface ImageOptions {
  /**
   * Uploads a file and resolves with its URL. Without one, images are kept
   * in the document as `data:` URLs. The image shows at once from the file
   * itself and switches to the URL when the upload is done; that switch is
   * not an undo step.
   *
   * The file shows from a `blob:` URL meanwhile, so a Content Security
   * Policy needs `img-src blob:` (and `data:` without a handler).
   */
  upload: ImageUploadHandler | null;
  /** Files that become images, as `<input accept>` reads them. Default `image/*`. */
  accept: string;
  /** The largest file accepted, in bytes. Default 10 MB. */
  maxFileSize: number;
  /** A file was refused or its upload failed; the image is taken out again. */
  onUploadError: ((error: ImageUploadError) => void) | null;
  /** Images can have captions. Default true. */
  captions: boolean;
  /** Images can be resized by dragging their corners. Default true. */
  resizable: boolean;
  /** The narrowest an image can be dragged, in px. Default 64. */
  minWidth: number;
}

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /**
     * Ask for an image: the insert popover (upload or link) where there is
     * an image UI, else the browser's file chooser. Call it from a click.
     */
    openImageInsert: [];
    /** Insert an image where the caret is; the caret goes to the line after it. */
    insertImage: [image: ImageData];
    /** Insert each image file and upload it, through the `upload` option. */
    insertImageFiles: [files: readonly File[]];
    /** The selected image (or the one with `key`) from another URL. */
    setImageSrc: [src: string, key?: NodeKey];
    /** Upload a file in place of the selected image (or the one with `key`). */
    replaceImageFile: [file: File, key?: NodeKey];
    setImageAlign: [align: ImageAlign, key?: NodeKey];
    setImageAltText: [altText: string, key?: NodeKey];
    /** The image's size in px; `null` for its own. */
    setImageSize: [width: number | null, height?: number | null, key?: NodeKey];
    /** Give the image a caption, the caret in it, or take it away. */
    toggleImageCaption: [key?: NodeKey];
    removeImage: [key?: NodeKey];
  }
  interface TeiActiveStates {
    /** An image is selected, or the caret is in its caption. */
    image: [];
    imageAlign: [align: ImageAlign];
    imageCaption: [];
  }
}

/** An upload in flight, by the key of the image it is for. */
export interface Upload {
  controller: AbortController;
  /** The `blob:` URL the image shows until the upload is done. */
  preview: string;
  progress: number;
}

export interface ImageStorage {
  /** Uploads in flight, by the key of their image. */
  uploads: Map<NodeKey, Upload>;
  /** Bumped by `openImageInsert`; image UIs watch it. */
  insertRequest: Signal<number>;
  /** How many image UIs are mounted; with none, `openImageInsert` opens the file chooser. */
  pickers: Signal<number>;
}

type Ctx = TeiExtensionContext<ImageOptions, ImageStorage> & {
  editor: TeiEditor;
  lexical: LexicalEditor;
};

/** The image with this key; else the selected one, or the one whose caption has the caret. */
export function $getImage(key?: NodeKey): ImageNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isImageNode(node) ? node : null;
  }
  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    const nodes = selection.getNodes();
    return nodes.length === 1 && $isImageNode(nodes[0]) ? nodes[0] : null;
  }
  if ($isRangeSelection(selection)) return $findSlotHost(selection.anchor.getNode(), $isImageNode);
  return null;
}

const $hasImage = () => $getImage() !== null;

/** Where an image can go: a caret or text selection, or an image (it goes after). */
function $canInsert(): boolean {
  const selection = $getSelection() ?? $getPreviousSelection();
  return $isRangeSelection(selection) || $getImage() !== null;
}

function $insertImageNode(node: ImageNode): ImageNode {
  const selected = $getImage();
  if (selected && !$isRangeSelection($getSelection())) selected.insertAfter(node);
  else $insertBlock(node);
  return node.getLatest();
}

/** The upload's state on the image's DOM, for CSS: no document change, nothing to undo. */
function paintUpload(lexical: LexicalEditor, key: NodeKey, upload: Upload | undefined): void {
  const dom = lexical.getElementByKey(key);
  if (!dom) return;
  if (upload) {
    dom.setAttribute('data-tei-uploading', '');
    dom.style.setProperty('--tei-progress', String(upload.progress));
  } else {
    dom.removeAttribute('data-tei-uploading');
    dom.style.removeProperty('--tei-progress');
  }
}

/** Files the options accept, and an error for each that is too large. */
function sortFiles(ctx: Ctx, files: readonly File[]): File[] {
  return files.filter((file) => {
    if (!acceptsFile(file, ctx.options.accept)) return false;
    if (file.size <= ctx.options.maxFileSize) return true;
    ctx.options.onUploadError?.(new ImageUploadError('size', file));
    return false;
  });
}

/** Upload `file` for the image with `key`, which shows `preview` meanwhile. */
function startUpload(ctx: Ctx, key: NodeKey, file: File, preview: string): void {
  const { lexical, storage, editor } = ctx;
  const upload: Upload = { controller: new AbortController(), preview, progress: 0 };
  storage.uploads.get(key)?.controller.abort();
  storage.uploads.set(key, upload);
  paintUpload(lexical, key, upload);

  const done = (): boolean => {
    const current = storage.uploads.get(key) === upload;
    if (current) storage.uploads.delete(key);
    paintUpload(lexical, key, undefined);
    return current;
  };
  const fail = (error: ImageUploadError) => {
    if (!done()) return;
    lexical.update(() => $getNodeByKey(key)?.remove(), { tag: HISTORY_MERGE_TAG });
    URL.revokeObjectURL(preview);
    ctx.options.onUploadError?.(error);
  };
  const handler: ImageUploadHandler =
    ctx.options.upload ?? ((f, { onProgress, signal }) => readAsDataURL(f, { onProgress, signal }));
  const { signal } = upload.controller;
  handler(file, {
    signal,
    editor,
    onProgress: (fraction) => {
      if (storage.uploads.get(key) !== upload || !Number.isFinite(fraction)) return;
      upload.progress = Math.min(1, Math.max(0, fraction));
      paintUpload(lexical, key, upload);
    },
  }).then(
    // A result for an upload that is no longer this image's (aborted,
    // replaced) is dropped by `done`.
    (result) => {
      const data = typeof result === 'string' ? { src: result } : result;
      if (!data || typeof data.src !== 'string' || !isSafeImageSrc(data.src)) {
        fail(new ImageUploadError('unsafe', file));
        return;
      }
      if (!done()) return;
      lexical.update(
        () => {
          const node = $getNodeByKey(key);
          if (!$isImageNode(node)) return;
          node.setSrc(data.src);
          if (node.getWidth() === null && data.width) node.setSize(data.width, data.height);
          if (!node.getAltText() && data.altText) node.setAltText(data.altText);
        },
        { tag: HISTORY_MERGE_TAG, onUpdate: () => URL.revokeObjectURL(preview) },
      );
    },
    (cause) => fail(new ImageUploadError('upload', file, { cause })),
  );
}

/** Image nodes for `files`, showing each file until its upload is done. */
function $insertFiles(ctx: Ctx, files: readonly File[]): boolean {
  const accepted = sortFiles(ctx, files);
  if (accepted.length === 0) return false;
  let last: LexicalNode | null = null;
  for (const file of accepted) {
    const preview = URL.createObjectURL(file);
    const node = $createImageNode({ src: preview });
    if (last) last.insertAfter(node);
    else $insertImageNode(node);
    last = node;
    const key = node.getKey();
    $onUpdate(() => startUpload(ctx, key, file, preview));
  }
  if (last) $caretAfter(last);
  return true;
}

// -- HTML ---------------------------------------------------------------------

const size = (el: HTMLImageElement, name: 'width' | 'height') => {
  const value = Number.parseInt(el.getAttribute(name) ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

function $imageFromElement(el: HTMLImageElement, align?: string | null): ImageNode | null {
  const src = el.getAttribute('src')?.trim();
  if (!src || !isSafeImageSrc(src)) return null;
  return $createImageNode({
    src,
    altText: el.getAttribute('alt') ?? '',
    width: size(el, 'width'),
    height: size(el, 'height'),
    align: IMAGE_ALIGNS.includes(align as ImageAlign) ? (align as ImageAlign) : undefined,
  });
}

const IMG_RULE = defineImportRule({
  name: '@teispace/teieditor/image/img',
  match: sel.tag('img'),
  $import: (_ctx, el) => {
    const node = $imageFromElement(el);
    return node ? [node] : [];
  },
});

/** `<figure>` with an image, and its `<figcaption>` as the caption. */
const FIGURE_RULE = defineImportRule({
  name: '@teispace/teieditor/image/figure',
  match: sel.tag('figure'),
  $import: (ctx, el, $next) => {
    const img = el.querySelector('img');
    const node = img && $imageFromElement(img, el.getAttribute('data-align'));
    if (!node) return $next();
    const figcaption = el.querySelector('figcaption');
    if (figcaption) {
      const line = $createParagraphNode();
      line.append(...ctx.$importChildren(figcaption, { schema: InlineSchema }));
      $setSlot(node, 'caption', line);
    }
    return [node];
  },
});

// -- Markdown -----------------------------------------------------------------

/** `![alt](src "title")` on a line of its own; the title is the caption. */
const IMAGE_LINE =
  /^!\[((?:[^\]\\]|\\.)*)\]\(\s*<?([^\s<>)]+)>?(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)\s?$/;
const unescape = (text: string) => text.replace(/\\(.)/g, '$1');
const escape = (text: string, chars: RegExp) => text.replace(chars, '\\$&');

export const IMAGE: ElementTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) return null;
    const alt = escape(node.getAltText(), /[\\\]]/g);
    const src = node.getSrc().replace(/[\s()<>]/g, encodeURIComponent);
    const text = node.getCaption()?.getTextContent();
    return `![${alt}](${src}${text ? ` "${escape(text, /[\\"]/g)}"` : ''})`;
  },
  regExp: IMAGE_LINE,
  replace: (parent, _children, match, isImport) => {
    const src = match[2] ?? '';
    if (!isSafeImageSrc(src)) return false;
    const node = $createImageNode({
      src,
      altText: unescape(match[1] ?? ''),
      caption: match[3] ? unescape(match[3]) : undefined,
    });
    parent.replace(node);
    if (!isImport) $caretAfter(node);
  },
  type: 'element',
};

// -- Extension ----------------------------------------------------------------

/** The extension itself, for its items to read its options. */
let self: TeiExtension<string, ImageOptions, ImageStorage> | undefined;

const imageItem = (item: Omit<TeiItem, 'in'>): TeiItem => ({ in: ['imageMenu'], ...item });

const ALIGN_ICONS: Record<ImageAlign, string> = {
  start: 'imageStart',
  center: 'imageCenter',
  end: 'imageEnd',
  full: 'imageFull',
};

/**
 * Images: from a file (chosen, dropped or pasted, with upload progress) or
 * a URL; resized from their corners; aligned left, centre, right or full
 * width; alt text; and a caption typed in place, which undoes, copies and
 * collaborates with the rest of the document. Saved as `<img>`, or
 * `<figure>` with a caption, and as `![alt](src)` in Markdown.
 *
 * In React, `<Editor>` adds the toolbar over a selected image and its
 * resize handles, and the insert menu (upload or URL).
 */
export const Image = defineTeiExtension({
  name: '@teispace/teieditor/image',
  config: {
    upload: null,
    accept: 'image/*',
    maxFileSize: 10 * 1024 * 1024,
    onUploadError: null,
    captions: true,
    resizable: true,
    minWidth: 64,
  } as ImageOptions,
  nodes: [ImageNode],
  dependencies: [
    RichText,
    configExtension(DOMImportExtension, { rules: [FIGURE_RULE, IMG_RULE] }),
    configExtension(DOMRenderExtension, {
      overrides: [
        domOverride([ImageNode], {
          $getSlotTargetElement: (_node, name, hostDom) =>
            name === 'caption' ? hostDom.querySelector('figcaption') : null,
        }),
      ],
    }),
  ],
  storage: (): ImageStorage => ({
    uploads: new Map(),
    insertRequest: signal(0),
    pickers: signal(0),
  }),
  markdown: { image: IMAGE },
  register: (ctx) => {
    const { lexical, storage, editor } = ctx;
    return mergeRegister(
      registerHostSelection(lexical, $isImageNode),
      registerSelectedAttribute(lexical, $isImageNode),
      registerSlotKeys(lexical, $isImageNode),
      lexical.registerNodeTransform(ImageNode, $liftBlock),
      // Rich text has put the caret where the files were dropped.
      lexical.registerCommand(
        DRAG_DROP_PASTE,
        (files) => $insertFiles(ctx, files),
        COMMAND_PRIORITY_LOW,
      ),
      lexical.registerMutationListener(
        ImageNode,
        (mutations) => {
          for (const [key, kind] of mutations) {
            if (kind === 'created') {
              // What an empty caption shows, in the editor's language.
              lexical
                .getElementByKey(key)
                ?.querySelector('figcaption')
                ?.setAttribute('data-placeholder', editor.t('image.caption.placeholder'));
            }
            const upload = storage.uploads.get(key);
            if (!upload) continue;
            if (kind === 'destroyed') {
              upload.controller.abort();
              storage.uploads.delete(key);
              URL.revokeObjectURL(upload.preview);
            } else paintUpload(lexical, key, upload);
          }
        },
        { skipInitialization: false },
      ),
      () => {
        for (const upload of storage.uploads.values()) {
          upload.controller.abort();
          URL.revokeObjectURL(upload.preview);
        }
        storage.uploads.clear();
      },
    );
  },
  commands: {
    openImageInsert: {
      run: ({ storage, options, editor, lexical }) => {
        if (!$canInsert()) return false;
        if (storage.pickers.peek() > 0) {
          storage.insertRequest.value++;
          return;
        }
        const doc = lexical.getRootElement()?.ownerDocument;
        if (!doc) return false;
        void chooseFiles(doc, { accept: options.accept, multiple: true }).then((files) => {
          if (files.length > 0) editor.chain().focus().insertImageFiles(files).run();
        });
      },
      can: () => $canInsert(),
    },
    insertImage: {
      run: (_ctx, image: ImageData) => {
        if (!image || typeof image.src !== 'string' || !isSafeImageSrc(image.src.trim())) {
          return false;
        }
        if (!$canInsert()) return false;
        const node = $insertImageNode($createImageNode({ ...image, src: image.src.trim() }));
        if (image.caption === true) node.getCaption()?.select();
        else $caretAfter(node);
      },
      can: (_ctx, image?: ImageData) =>
        $canInsert() && (image === undefined || isSafeImageSrc(String(image.src).trim())),
    },
    insertImageFiles: {
      run: (ctx, files: readonly File[]) => $canInsert() && $insertFiles(ctx as Ctx, files),
      can: () => $canInsert(),
    },
    setImageSrc: {
      run: ({ storage, lexical }, src: string, key?: NodeKey) => {
        const node = $getImage(key);
        if (!node || !isSafeImageSrc(src.trim())) return false;
        const upload = storage.uploads.get(node.getKey());
        if (upload) {
          upload.controller.abort();
          storage.uploads.delete(node.getKey());
          URL.revokeObjectURL(upload.preview);
          $onUpdate(() => paintUpload(lexical, node.getKey(), undefined));
        }
        node.setSrc(src.trim());
      },
      can: $hasImage,
    },
    replaceImageFile: {
      run: (ctx, file: File, key?: NodeKey) => {
        const node = $getImage(key);
        const [accepted] = sortFiles(ctx as Ctx, [file]);
        if (!node || !accepted) return false;
        const preview = URL.createObjectURL(accepted);
        node.setSrc(preview).setSize(null);
        const nodeKey = node.getKey();
        $onUpdate(() => startUpload(ctx as Ctx, nodeKey, accepted, preview));
      },
      can: $hasImage,
    },
    setImageAlign: {
      run: (_ctx, align: ImageAlign, key?: NodeKey) => {
        const node = $getImage(key);
        if (!node || !IMAGE_ALIGNS.includes(align)) return false;
        node.setAlign(align);
      },
      can: $hasImage,
    },
    setImageAltText: {
      run: (_ctx, text: string, key?: NodeKey) => {
        const node = $getImage(key);
        if (!node || typeof text !== 'string') return false;
        node.setAltText(text.trim());
      },
      can: $hasImage,
    },
    setImageSize: {
      run: ({ options }, width: number | null, height?: number | null, key?: NodeKey) => {
        const node = $getImage(key);
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
      can: ({ options }) => options.resizable && $hasImage(),
    },
    toggleImageCaption: {
      run: ({ options }, key?: NodeKey) => {
        const node = $getImage(key);
        if (!node) return false;
        if (node.getCaption()) {
          const inCaption = $isRangeSelection($getSelection());
          node.setCaption(false);
          if (inCaption) $selectNode(node);
          return;
        }
        if (!options.captions) return false;
        node.setCaption(true);
        node.getCaption()?.select();
      },
      can: ({ options }) => {
        const node = $getImage();
        return node !== null && (options.captions || node.getCaption() !== null);
      },
    },
    removeImage: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getImage(key);
        if (!node) return false;
        const next = node.getNextSibling();
        const previous = node.getPreviousSibling();
        node.remove();
        if (next) next.selectStart();
        else if (previous) previous.selectEnd();
        else $caretAfter(node);
      },
      can: $hasImage,
    },
  },
  active: {
    image: $hasImage,
    imageAlign: (_ctx, align: ImageAlign) => $getImage()?.getAlign() === align,
    imageCaption: () => $getImage()?.getCaption() != null,
  },
  icons: {
    image: imageIcon,
    upload: uploadIcon,
    imageStart,
    imageCenter,
    imageEnd,
    imageFull,
    caption,
    altText,
    replace,
    trash,
  },
  messages: {
    'image.insert': 'Image',
    'image.insert.description': 'Upload or embed with a link',
    'image.menu': 'Image',
    'image.upload': 'Upload',
    'image.upload.choose': 'Choose an image',
    'image.upload.drop': 'or drop one here',
    'image.url': 'Link',
    'image.url.placeholder': 'Paste an image link…',
    'image.url.invalid': 'That is not an image link',
    'image.altText': 'Alt text',
    'image.altText.placeholder': 'Describe the image',
    'image.altText.hint': 'Read aloud by screen readers, and shown if the image cannot load.',
    'image.save': 'Save',
    'image.embed': 'Embed image',
    'image.align.start': 'Align left',
    'image.align.center': 'Align centre',
    'image.align.end': 'Align right',
    'image.align.full': 'Full width',
    'image.caption': 'Caption',
    'image.caption.placeholder': 'Write a caption…',
    'image.replace': 'Replace',
    'image.remove': 'Delete image',
    'image.resize': 'Resize image',
    'image.uploading': 'Uploading…',
  },
  items: [
    {
      id: 'insertImage',
      label: 'image.insert',
      description: 'image.insert.description',
      icon: 'image',
      in: ['toolbar', 'slash', 'insert'],
      group: 'insert',
      order: 10,
      keywords: ['image', 'picture', 'photo', 'img', 'upload', 'media'],
      command: 'openImageInsert',
      control: 'insertImage',
    },
    ...IMAGE_ALIGNS.map((align, order) =>
      imageItem({
        id: `imageAlign.${align}`,
        label: `image.align.${align}`,
        icon: ALIGN_ICONS[align],
        group: 'align',
        order,
        command: 'setImageAlign',
        args: [align],
        active: 'imageAlign',
        activeArgs: [align],
      }),
    ),
    imageItem({
      id: 'imageCaption',
      label: 'image.caption',
      icon: 'caption',
      group: 'edit',
      order: 0,
      command: 'toggleImageCaption',
      active: 'imageCaption',
      visible: (editor) => Boolean(self && getExtensionOptions(editor, self)?.captions),
    }),
    imageItem({
      id: 'imageAltText',
      label: 'image.altText',
      icon: 'altText',
      group: 'edit',
      order: 1,
      control: 'imageAltText',
    }),
    imageItem({
      id: 'imageReplace',
      label: 'image.replace',
      icon: 'replace',
      group: 'edit',
      order: 2,
      control: 'imageReplace',
    }),
    imageItem({
      id: 'removeImage',
      label: 'image.remove',
      icon: 'trash',
      group: 'remove',
      order: 0,
      command: 'removeImage',
    }),
  ],
});

self = Image;
