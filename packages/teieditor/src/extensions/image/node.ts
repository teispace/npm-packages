import { $appendNodeToHTML } from '@lexical/html';
import {
  $create,
  $createParagraphNode,
  $createTextNode,
  $getDocument,
  $getSlot,
  $removeSlot,
  $setSlot,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type ParagraphNode,
  type SerializedLexicalNode,
} from 'lexical';
import { isSafeImageSrc } from '../../utils/url.js';

/** Where an image sits in its column. `full` stretches it to the column's width. */
export type ImageAlign = 'start' | 'center' | 'end' | 'full';
export const IMAGE_ALIGNS: readonly ImageAlign[] = ['start', 'center', 'end', 'full'];

export interface SerializedImageNode extends SerializedLexicalNode {
  src: string;
  altText: string;
  /** Rendered width in px; absent for the image's own. */
  width?: number;
  height?: number;
  align?: ImageAlign;
}

/** A size from saved JSON: 4.x wrote `'inherit'`, the Lexical playground `0`, for none. */
const size = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;

/** Every `text` in a saved Lexical document, joined: the playground's caption editor, as text. */
function textOf(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as {
    text?: unknown;
    children?: unknown;
    root?: unknown;
    editorState?: unknown;
  };
  if (typeof node.text === 'string') return node.text;
  if (node.editorState) return textOf(node.editorState);
  if (node.root) return textOf(node.root);
  return Array.isArray(node.children) ? node.children.map(textOf).join('') : '';
}

/**
 * An image: a block with its own caption, which is a slot of the document
 * (typed in place, undone with everything else, collaborative). It draws
 * its own DOM, `<figure><img><figcaption>`, so it needs no framework and
 * renders the same on a server.
 */
export class ImageNode extends DecoratorNode<null> {
  __src = '';
  __altText = '';
  __width: number | null = null;
  __height: number | null = null;
  __align: ImageAlign = 'center';

  $config() {
    return this.config('image', { extends: DecoratorNode, slots: ['caption'] });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__src = prev.__src;
    this.__altText = prev.__altText;
    this.__width = prev.__width;
    this.__height = prev.__height;
    this.__align = prev.__align;
  }

  // -- Data ------------------------------------------------------------------

  getSrc(): string {
    return this.getLatest().__src;
  }

  /** Refuses a URL that could run script; the image keeps its source. */
  setSrc(src: string): this {
    const self = this.getWritable();
    if (isSafeImageSrc(src)) self.__src = src;
    return self;
  }

  getAltText(): string {
    return this.getLatest().__altText;
  }

  setAltText(altText: string): this {
    const self = this.getWritable();
    self.__altText = altText;
    return self;
  }

  getWidth(): number | null {
    return this.getLatest().__width;
  }

  getHeight(): number | null {
    return this.getLatest().__height;
  }

  /** The rendered size in px; `null` for the image's own. */
  setSize(width: number | null, height: number | null = null): this {
    const self = this.getWritable();
    self.__width = size(width);
    self.__height = self.__width === null ? null : size(height);
    return self;
  }

  getAlign(): ImageAlign {
    return this.getLatest().__align;
  }

  setAlign(align: ImageAlign): this {
    const self = this.getWritable();
    if (IMAGE_ALIGNS.includes(align)) self.__align = align;
    return self;
  }

  /** The caption, when the image has one. */
  getCaption(): ParagraphNode | null {
    return $getSlot(this, 'caption') as ParagraphNode | null;
  }

  /** Give the image a caption (with `text`, if any) or take it away. */
  setCaption(caption: string | boolean): this {
    const self = this.getWritable();
    if (caption === false) {
      $removeSlot(self, 'caption');
    } else if (!self.getCaption() || typeof caption === 'string') {
      const line = $createParagraphNode();
      if (typeof caption === 'string' && caption) line.append($createTextNode(caption));
      $setSlot(self, 'caption', line);
    }
    return self;
  }

  // -- JSON ------------------------------------------------------------------

  updateFromJSON(json: LexicalUpdateJSON<SerializedImageNode>): this {
    const self = super.updateFromJSON(json);
    const data = json as Partial<SerializedImageNode> & {
      alt?: unknown;
      caption?: unknown;
      showCaption?: unknown;
    };
    if (typeof data.src === 'string') self.setSrc(data.src);
    const alt = typeof data.altText === 'string' ? data.altText : data.alt;
    if (typeof alt === 'string') self.setAltText(alt);
    self.setSize(size(data.width), size(data.height));
    if (typeof data.align === 'string') self.setAlign(data.align as ImageAlign);
    // 4.x kept the caption as a string; the Lexical playground in an editor
    // of its own. Both become this image's caption.
    if (!self.getCaption()) {
      if (typeof data.caption === 'string' && data.caption) self.setCaption(data.caption);
      else if (data.showCaption === true) self.setCaption(textOf(data.caption));
    }
    return self;
  }

  exportJSON(): SerializedImageNode {
    const json: SerializedImageNode = {
      ...super.exportJSON(),
      src: this.getSrc(),
      altText: this.getAltText(),
    };
    const width = this.getWidth();
    const height = this.getHeight();
    if (width !== null) json.width = width;
    if (height !== null) json.height = height;
    if (this.getAlign() !== 'center') json.align = this.getAlign();
    return json;
  }

  // -- DOM -------------------------------------------------------------------

  createDOM(config: EditorConfig): HTMLElement {
    const doc = $getDocument();
    const figure = doc.createElement('figure');
    figure.className = (config.theme.image as string | undefined) ?? 'tei-image';
    figure.contentEditable = 'false';
    figure.setAttribute('data-tei-image', '');
    const img = doc.createElement('img');
    img.draggable = false;
    img.decoding = 'async';
    figure.append(img, doc.createElement('figcaption'));
    this.#paint(figure);
    return figure;
  }

  updateDOM(_prev: this, dom: HTMLElement): false {
    this.#paint(dom);
    return false;
  }

  /** Attributes only: no style attribute, so a strict CSP has nothing to report. */
  #paint(figure: HTMLElement): void {
    const img = figure.querySelector('img');
    if (!img) return;
    if (img.getAttribute('src') !== this.__src) img.setAttribute('src', this.__src);
    img.alt = this.__altText;
    const set = (name: string, value: number | null) =>
      value === null ? img.removeAttribute(name) : img.setAttribute(name, String(value));
    set('width', this.__width);
    set('height', this.__height);
    figure.setAttribute('data-align', this.__align);
  }

  decorate(): null {
    return null;
  }

  isInline(): false {
    return false;
  }

  /** `<img>` when that is all there is; `<figure>` for a caption or an alignment. */
  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const doc = $getDocument();
    const img = doc.createElement('img');
    img.setAttribute('src', this.getSrc());
    img.setAttribute('alt', this.getAltText());
    const width = this.getWidth();
    const height = this.getHeight();
    if (width !== null) img.setAttribute('width', String(width));
    if (height !== null) img.setAttribute('height', String(height));
    const caption = this.getCaption();
    const align = this.getAlign();
    if (!caption && align === 'center') return { element: img };
    const figure = doc.createElement('figure');
    if (align !== 'center') figure.setAttribute('data-align', align);
    figure.append(img);
    if (caption) {
      const figcaption = doc.createElement('figcaption');
      for (const child of caption.getChildren()) $appendNodeToHTML(editor, child, figcaption);
      figure.append(figcaption);
    }
    return { element: figure };
  }

  getTextContent(): string {
    return '';
  }
}

export function $createImageNode(data: {
  src: string;
  altText?: string;
  width?: number | null;
  height?: number | null;
  align?: ImageAlign;
  caption?: string | boolean;
}): ImageNode {
  const node = $create(ImageNode)
    .setSrc(data.src)
    .setAltText(data.altText ?? '')
    .setSize(data.width ?? null, data.height ?? null);
  if (data.align) node.setAlign(data.align);
  if (data.caption !== undefined && data.caption !== false) node.setCaption(data.caption);
  return node;
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}
