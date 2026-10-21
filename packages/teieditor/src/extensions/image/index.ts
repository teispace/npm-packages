import { configExtension, type Signal, signal } from '@lexical/extension';
import {
  DOMImportExtension,
  DOMRenderExtension,
  defineImportRule,
  domOverride,
  InlineSchema,
  sel,
} from '@lexical/html';
import type { ElementTransformer, TextMatchTransformer } from '@lexical/markdown';
import { DRAG_DROP_PASTE } from '@lexical/rich-text';
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getPreviousSelection,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  $onUpdate,
  $setSlot,
  COMMAND_PRIORITY_LOW,
  HISTORY_MERGE_TAG,
  isBlockDomNode,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
  type NodeMutation,
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
  imageInline,
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
  $createInlineImageNode,
  $isAnyImageNode,
  $isImageNode,
  $isInlineImageNode,
  type BaseImageNode,
  IMAGE_ALIGNS,
  IMAGE_FLOATS,
  type ImageAlign,
  type ImageFloat,
  ImageNode,
  InlineImageNode,
} from './node.js';

export type { SerializedImageNode, SerializedInlineImageNode } from './node.js';
export {
  $createImageNode,
  $createInlineImageNode,
  $isAnyImageNode,
  $isImageNode,
  $isInlineImageNode,
  BaseImageNode,
  IMAGE_ALIGNS,
  IMAGE_FLOATS,
  type ImageAlign,
  type ImageFloat,
  ImageNode,
  InlineImageNode,
} from './node.js';

/** An image to insert. */
export interface ImageData {
  src: string;
  altText?: string;
  width?: number | null;
  height?: number | null;
  align?: ImageAlign;
  /** A caption: its text, or `true` for an empty one to type in. Block images only. */
  caption?: string | boolean;
  /** In the line of text at the caret, like a character, rather than a block of its own. */
  inline?: boolean;
  /** For an inline image: the side it floats to, the text wrapping round it. */
  float?: ImageFloat;
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
  /**
   * The narrowest an image can be made, in px. Default 64. An inline image
   * can go down to 16, an icon's size, whatever this is.
   */
  minWidth: number;
}

/** The narrowest an image can be made: an inline one, an icon's size. */
export const minImageWidth = (options: ImageOptions, inline: boolean): number =>
  inline ? Math.min(16, options.minWidth) : options.minWidth;

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
    /**
     * Where the image sits. An inline image floats to the side for `start`
     * and `end`, and becomes a block for `center` and `full`.
     */
    setImageAlign: [align: ImageAlign, key?: NodeKey];
    /** Make the image inline (in its line of text) or a block; without `inline`, toggle. */
    setImageInline: [inline?: boolean, key?: NodeKey];
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
    /** The selected image is in a line of text. */
    imageInline: [];
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

/**
 * The image (block or inline) with this key; else the selected one, or the
 * one whose caption has the caret.
 */
export function $getImage(key?: NodeKey): BaseImageNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isAnyImageNode(node) ? node : null;
  }
  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    const nodes = selection.getNodes();
    return nodes.length === 1 && $isAnyImageNode(nodes[0]) ? nodes[0] : null;
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

function $insertImageNode<T extends BaseImageNode>(node: T): T {
  const selection = $getSelection() ?? $getPreviousSelection();
  const selected = $getImage();
  if (selected && !$isRangeSelection(selection)) {
    if (node.isInline() && !selected.isInline()) {
      const line = $createParagraphNode().append(node);
      selected.insertAfter(line);
    } else selected.insertAfter(node);
  } else if (node.isInline() && $isRangeSelection(selection)) selection.insertNodes([node]);
  else $insertBlock(node);
  return node.getLatest();
}

/**
 * `node` as the other kind of image, in its place, keeping what it has: a
 * block image's caption becomes the paragraph after it, its side a float.
 */
function $convertImage(node: BaseImageNode, inline: boolean): BaseImageNode {
  const data = {
    src: node.getSrc(),
    altText: node.getAltText(),
    width: node.getWidth(),
    height: node.getHeight(),
  };
  const align = node.getAlign();
  let next: BaseImageNode;
  if (inline && $isImageNode(node)) {
    next = $createInlineImageNode({
      ...data,
      float: align === 'start' || align === 'end' ? align : 'none',
    });
    const caption = node.getCaption();
    const text = caption && caption.getTextContentSize() > 0 ? caption.getChildren() : [];
    const line = $createParagraphNode().append(next);
    node.replace(line);
    if (text.length > 0) line.insertAfter($createParagraphNode().append(...text));
  } else if (!inline && $isInlineImageNode(node)) {
    // The transform lifts it out of its paragraph.
    next = $createImageNode({ ...data, align: align ?? 'center' });
    node.replace(next);
  } else return node;
  $selectNode(next);
  return next;
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
          if (!$isAnyImageNode(node)) return;
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

/** A line break, or a block: the end of an `<img>`'s line. */
const endsLine = (node: Node) => node.nodeName === 'BR' || isBlockDomNode(node);

/** The blocks an `<img>` can sit in a line of. */
const LINE = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd,figcaption,pre';

/**
 * An `<img>` is inline when it says so (`data-inline`, as an inline image
 * saves) or shares its line with text; on a line of its own it is a block.
 */
function isInlineImg(el: HTMLImageElement): boolean {
  if (el.hasAttribute('data-inline')) return true;
  // Text either side of it, up to a line break, in its block: or in what
  // was pasted, which is often a paragraph's inside without the paragraph.
  const block = el.parentElement?.closest(LINE) ?? null;
  for (let node: Element | null = el; node && node !== block; node = node.parentElement) {
    for (const way of ['previousSibling', 'nextSibling'] as const) {
      for (let other = node[way]; other && !endsLine(other); other = other[way]) {
        if (other.textContent?.trim()) return true;
      }
    }
  }
  return false;
}

const IMG_RULE = defineImportRule({
  name: '@teispace/teieditor/image/img',
  match: sel.tag('img'),
  $import: (_ctx, el) => {
    if (isInlineImg(el)) {
      const src = el.getAttribute('src')?.trim();
      if (!src || !isSafeImageSrc(src)) return [];
      const float = el.getAttribute('data-float') as ImageFloat | null;
      return [
        $createInlineImageNode({
          src,
          altText: el.getAttribute('alt') ?? '',
          width: size(el, 'width'),
          height: size(el, 'height'),
          float: float && IMAGE_FLOATS.includes(float) ? float : 'none',
        }),
      ];
    }
    const node = $imageFromElement(el);
    return node ? [node] : [];
  },
});

/**
 * The space between text and an `<img>` beside it, which the core rule
 * collapses as if the image were not there: an image is something in the
 * line, like a character.
 */
/**
 * The node next to `node` that way on its line, through the inline elements
 * round it (a copied paragraph's text often comes in spans): `null` at a
 * line's end.
 */
function onLine(node: Node, way: 'previousSibling' | 'nextSibling'): Node | null {
  let at: Node | null = node;
  while (at && !at[way]) {
    at = at.parentNode;
    if (!at || isBlockDomNode(at)) return null;
  }
  let other = at?.[way] ?? null;
  const into = way === 'previousSibling' ? 'lastChild' : 'firstChild';
  while (other?.[into] && other.nodeName !== 'IMG' && !endsLine(other)) other = other[into];
  return other && !endsLine(other) ? other : null;
}

/** An `<img>` that becomes an image: one with a safe source. */
const isImage = (node: Node | null): boolean =>
  node?.nodeName === 'IMG' && isSafeImageSrc((node as Element).getAttribute('src')?.trim() ?? '');

const TEXT_BY_IMG_RULE = defineImportRule({
  name: '@teispace/teieditor/image/text',
  match: sel.text(),
  $import: (_ctx, el, $next) => {
    const nodes = $next();
    const text = el.textContent ?? '';
    const inlineImg = (node: Node | null) =>
      node?.nodeName === 'IMG' && isInlineImg(node as HTMLImageElement);
    const previous = onLine(el, 'previousSibling');
    const before = /^\s/.test(text) && isImage(previous) && inlineImg(previous);
    // Kept before any inline <img>: one that is refused leaves a single space.
    const after = /\s$/.test(text) && inlineImg(onLine(el, 'nextSibling'));
    if (!before && !after) return nodes;
    // All white space, which the core rule dropped.
    if (nodes.length === 0) return [$createTextNode(' ')];
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (before && $isTextNode(first) && !/^\s/.test(first.getTextContent())) {
      first.setTextContent(` ${first.getTextContent()}`);
    }
    if (after && $isTextNode(last) && !/\s$/.test(last.getTextContent())) {
      last.setTextContent(`${last.getTextContent()} `);
    }
    return nodes;
  },
});

/** The sibling that way, past white space. */
function adjacent(node: Node, way: 'previousSibling' | 'nextSibling'): Node | null {
  let other = node[way];
  while (other?.nodeType === 3 && !other.textContent?.trim()) other = other[way];
  return other;
}

/** A `<br>` beside an image on a line of its own: the image is a block, so no line break is needed. */
const BR_BY_IMG_RULE = defineImportRule({
  name: '@teispace/teieditor/image/br',
  match: sel.tag('br'),
  $import: (_ctx, el, $next) => {
    for (const way of ['previousSibling', 'nextSibling'] as const) {
      const side = adjacent(el, way);
      if (isImage(side) && !isInlineImg(side as HTMLImageElement)) return [];
    }
    return $next();
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

/** `![alt](src)` in a line of text: an inline image. */
const INLINE_IMAGE_TEXT =
  /!\[((?:[^\]\\]|\\.)*)\]\(\s*<?([^\s<>)]+)>?(?:\s+"(?:[^"\\]|\\.)*")?\s*\)/;

export const INLINE_IMAGE: TextMatchTransformer = {
  dependencies: [InlineImageNode],
  export: (node) => {
    if (!$isInlineImageNode(node)) return null;
    const alt = escape(node.getAltText(), /[\\\]]/g);
    return `![${alt}](${node.getSrc().replace(/[\s()<>]/g, encodeURIComponent)})`;
  },
  importRegExp: INLINE_IMAGE_TEXT,
  // Typed, only after something on the line: at its start, the image
  // shortcut makes a block of it on the space that follows.
  regExp: new RegExp(`(?<=.)${INLINE_IMAGE_TEXT.source}$`),
  replace: (textNode, match) => {
    const src = match[2] ?? '';
    if (!isSafeImageSrc(src)) return;
    const node = $createInlineImageNode({ src, altText: unescape(match[1] ?? '') });
    textNode.replace(node);
    node.selectNext(0, 0);
  },
  trigger: ')',
  type: 'text-match',
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
  nodes: [ImageNode, InlineImageNode],
  dependencies: [
    RichText,
    configExtension(DOMImportExtension, {
      rules: [FIGURE_RULE, IMG_RULE, TEXT_BY_IMG_RULE, BR_BY_IMG_RULE],
    }),
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
  markdown: { image: IMAGE, inlineImage: INLINE_IMAGE },
  register: (ctx) => {
    const { lexical, storage, editor } = ctx;
    const onMutations = (mutations: Map<NodeKey, NodeMutation>) => {
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
    };
    return mergeRegister(
      registerHostSelection(lexical, $isAnyImageNode),
      registerSelectedAttribute(lexical, $isAnyImageNode),
      registerSlotKeys(lexical, $isImageNode),
      lexical.registerNodeTransform(ImageNode, $liftBlock),
      // Rich text has put the caret where the files were dropped.
      lexical.registerCommand(
        DRAG_DROP_PASTE,
        (files) => $insertFiles(ctx, files),
        COMMAND_PRIORITY_LOW,
      ),
      lexical.registerMutationListener(ImageNode, onMutations, { skipInitialization: false }),
      lexical.registerMutationListener(InlineImageNode, onMutations),
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
        const src = image.src.trim();
        if (image.inline) {
          $insertImageNode($createInlineImageNode({ ...image, src })).selectNext(0, 0);
          return;
        }
        const node = $insertImageNode($createImageNode({ ...image, src }));
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
      run: ({ storage }, align: ImageAlign, key?: NodeKey) => {
        let node = $getImage(key);
        if (!node || !IMAGE_ALIGNS.includes(align)) return false;
        if ($isInlineImageNode(node)) {
          if (align === 'start' || align === 'end') {
            node.setFloat(node.getFloat() === align ? 'none' : align);
            return;
          }
          if (storage.uploads.has(node.getKey())) return false;
          node = $convertImage(node, false);
        }
        if ($isImageNode(node)) node.setAlign(align);
      },
      can: $hasImage,
    },
    setImageInline: {
      run: ({ storage }, inline?: boolean, key?: NodeKey) => {
        const node = $getImage(key);
        if (!node || storage.uploads.has(node.getKey())) return false;
        $convertImage(node, inline ?? !node.isInline());
      },
      can: ({ storage }) => {
        const node = $getImage();
        return node !== null && !storage.uploads.has(node.getKey());
      },
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
        const w = Math.max(minImageWidth(options, node.isInline()), width);
        const h = height && Number.isFinite(height) ? (height * w) / width : null;
        node.setSize(w, h);
      },
      can: ({ options }) => options.resizable && $hasImage(),
    },
    toggleImageCaption: {
      run: ({ options, storage }, key?: NodeKey) => {
        let node = $getImage(key);
        if (!node) return false;
        // A caption is a block image's: an inline one becomes one.
        if ($isInlineImageNode(node)) {
          if (!options.captions || storage.uploads.has(node.getKey())) return false;
          node = $convertImage(node, false);
        }
        if (!$isImageNode(node)) return false;
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
        return (
          node !== null && (options.captions || ($isImageNode(node) && node.getCaption() !== null))
        );
      },
    },
    removeImage: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getImage(key);
        if (!node) return false;
        if (node.isInline()) {
          node.selectPrevious();
          node.remove();
          return;
        }
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
    imageCaption: () => {
      const node = $getImage();
      return $isImageNode(node) && node.getCaption() !== null;
    },
    imageInline: () => $getImage()?.isInline() === true,
  },
  icons: {
    image: imageIcon,
    upload: uploadIcon,
    imageStart,
    imageCenter,
    imageEnd,
    imageFull,
    imageInline,
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
    'image.inline': 'In line with text',
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
      id: 'imageInline',
      label: 'image.inline',
      icon: 'imageInline',
      group: 'align',
      order: IMAGE_ALIGNS.length,
      command: 'setImageInline',
      active: 'imageInline',
    }),
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
