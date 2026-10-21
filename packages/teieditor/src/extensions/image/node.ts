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
 * What both kinds of image hold: a source, alt text and a size. Not a node
 * of its own; `ImageNode` and `InlineImageNode` are.
 */
export class BaseImageNode extends DecoratorNode<null> {
  __src = '';
  __altText = '';
  __width: number | null = null;
  __height: number | null = null;

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__src = prev.__src;
    this.__altText = prev.__altText;
    this.__width = prev.__width;
    this.__height = prev.__height;
  }

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

  /** Where it sits: an inline image only floats to a side, or not. */
  getAlign(): ImageAlign | null {
    return null;
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedImageNode>): this {
    const self = super.updateFromJSON(json);
    const data = json as Partial<SerializedImageNode> & { alt?: unknown };
    if (typeof data.src === 'string') self.setSrc(data.src);
    const alt = typeof data.altText === 'string' ? data.altText : data.alt;
    if (typeof alt === 'string') self.setAltText(alt);
    self.setSize(size(data.width), size(data.height));
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
    return json;
  }

  /** The `<img>`, from attributes only: no style attribute for a strict CSP to report. */
  protected paintImage(img: HTMLImageElement): void {
    if (img.getAttribute('src') !== this.__src) img.setAttribute('src', this.__src);
    img.alt = this.__altText;
    const set = (name: string, value: number | null) =>
      value === null ? img.removeAttribute(name) : img.setAttribute(name, String(value));
    set('width', this.__width);
    set('height', this.__height);
  }

  /** A fresh `<img>` for the editor's DOM. */
  protected createImage(): HTMLImageElement {
    const img = $getDocument().createElement('img');
    img.draggable = false;
    img.decoding = 'async';
    return img;
  }

  /** The `<img>` saved HTML gets. */
  protected exportImage(): HTMLImageElement {
    const img = $getDocument().createElement('img');
    img.setAttribute('src', this.getSrc());
    img.setAttribute('alt', this.getAltText());
    const width = this.getWidth();
    const height = this.getHeight();
    if (width !== null) img.setAttribute('width', String(width));
    if (height !== null) img.setAttribute('height', String(height));
    return img;
  }

  decorate(): null {
    return null;
  }

  getTextContent(): string {
    return '';
  }
}

/**
 * An image: a block with its own caption, which is a slot of the document
 * (typed in place, undone with everything else, collaborative). It draws
 * its own DOM, `<figure><img><figcaption>`, so it needs no framework and
 * renders the same on a server.
 */
export class ImageNode extends BaseImageNode {
  __align: ImageAlign = 'center';

  $config() {
    return this.config('image', { extends: BaseImageNode, slots: ['caption'] });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__align = prev.__align;
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
      caption?: unknown;
      showCaption?: unknown;
    };
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
    const json = super.exportJSON();
    if (this.getAlign() !== 'center') json.align = this.getAlign();
    return json;
  }

  // -- DOM -------------------------------------------------------------------

  createDOM(config: EditorConfig): HTMLElement {
    const figure = $getDocument().createElement('figure');
    figure.className = (config.theme.image as string | undefined) ?? 'tei-image';
    figure.contentEditable = 'false';
    figure.setAttribute('data-tei-image', '');
    figure.append(this.createImage(), $getDocument().createElement('figcaption'));
    this.#paint(figure);
    return figure;
  }

  updateDOM(_prev: this, dom: HTMLElement): false {
    this.#paint(dom);
    return false;
  }

  #paint(figure: HTMLElement): void {
    const img = figure.querySelector('img');
    if (!img) return;
    this.paintImage(img);
    figure.setAttribute('data-align', this.__align);
  }

  isInline(): false {
    return false;
  }

  /** `<img>` when that is all there is; `<figure>` for a caption or an alignment. */
  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const img = this.exportImage();
    const caption = this.getCaption();
    const align = this.getAlign();
    if (!caption && align === 'center') return { element: img };
    const figure = $getDocument().createElement('figure');
    if (align !== 'center') figure.setAttribute('data-align', align);
    figure.append(img);
    if (caption) {
      const figcaption = $getDocument().createElement('figcaption');
      for (const child of caption.getChildren()) $appendNodeToHTML(editor, child, figcaption);
      figure.append(figcaption);
    }
    return { element: figure };
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

/** Which side an inline image floats to, the text wrapping round it; `none` keeps it in the line. */
export type ImageFloat = 'none' | 'start' | 'end';
export const IMAGE_FLOATS: readonly ImageFloat[] = ['none', 'start', 'end'];

export interface SerializedInlineImageNode extends SerializedImageNode {
  float?: ImageFloat;
}

/**
 * An image in a line of text, like a character: an emoji-sized icon, a
 * badge, or a picture the text wraps round when it floats to a side. No
 * caption; turned into a block image, it can have one.
 */
export class InlineImageNode extends BaseImageNode {
  __float: ImageFloat = 'none';

  $config() {
    return this.config('inline-image', { extends: BaseImageNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__float = prev.__float;
  }

  getFloat(): ImageFloat {
    return this.getLatest().__float;
  }

  setFloat(float: ImageFloat): this {
    const self = this.getWritable();
    if (IMAGE_FLOATS.includes(float)) self.__float = float;
    return self;
  }

  getAlign(): ImageAlign | null {
    const float = this.getFloat();
    return float === 'none' ? null : float;
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedInlineImageNode>): this {
    const self = super.updateFromJSON(json);
    const { float } = json as Partial<SerializedInlineImageNode>;
    if (typeof float === 'string') self.setFloat(float);
    return self;
  }

  exportJSON(): SerializedInlineImageNode {
    const json: SerializedInlineImageNode = super.exportJSON();
    if (this.getFloat() !== 'none') json.float = this.getFloat();
    return json;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = $getDocument().createElement('span');
    span.className = (config.theme.inlineImage as string | undefined) ?? 'tei-inline-image';
    span.contentEditable = 'false';
    span.setAttribute('data-tei-image', '');
    span.append(this.createImage());
    this.#paint(span);
    return span;
  }

  updateDOM(_prev: this, dom: HTMLElement): false {
    this.#paint(dom);
    return false;
  }

  #paint(span: HTMLElement): void {
    const img = span.querySelector('img');
    if (!img) return;
    this.paintImage(img);
    span.setAttribute('data-float', this.__float);
  }

  isInline(): true {
    return true;
  }

  /** `<img data-inline>`, so it comes back inline even on a line of its own. */
  exportDOM(): DOMExportOutput {
    const img = this.exportImage();
    img.setAttribute('data-inline', '');
    if (this.getFloat() !== 'none') img.setAttribute('data-float', this.getFloat());
    return { element: img };
  }
}

export function $createInlineImageNode(data: {
  src: string;
  altText?: string;
  width?: number | null;
  height?: number | null;
  float?: ImageFloat;
}): InlineImageNode {
  return $create(InlineImageNode)
    .setSrc(data.src)
    .setAltText(data.altText ?? '')
    .setSize(data.width ?? null, data.height ?? null)
    .setFloat(data.float ?? 'none');
}

export function $isInlineImageNode(node: LexicalNode | null | undefined): node is InlineImageNode {
  return node instanceof InlineImageNode;
}

/** Either kind of image. */
export function $isAnyImageNode(node: LexicalNode | null | undefined): node is BaseImageNode {
  return node instanceof BaseImageNode;
}
