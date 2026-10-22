import {
  $create,
  $getDocument,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedLexicalNode,
} from 'lexical';
import {
  cleanPreview,
  cleanScene,
  EMPTY_SCENE,
  type ExcalidrawElement,
  type ExcalidrawFile,
  type ExcalidrawScene,
  parseScene,
} from './scene.js';

/** The extension's name, which the UI finds it by. */
export const EXCALIDRAW_EXTENSION = '@teispace/teieditor/excalidraw';

export const EXCALIDRAW_ALIGNS = ['start', 'center', 'end'] as const;
export type ExcalidrawAlign = (typeof EXCALIDRAW_ALIGNS)[number];

export interface SerializedExcalidrawNode extends SerializedLexicalNode {
  elements: readonly ExcalidrawElement[];
  files: Readonly<Record<string, ExcalidrawFile>>;
  /** The drawing as an SVG `data:` URL, for pages without Excalidraw. */
  preview?: string;
  altText?: string;
  /** Shown width in px; absent for the drawing's own. */
  width?: number;
  height?: number;
  align?: ExcalidrawAlign;
}

/** A size in px from saved JSON; anything else is none. */
const size = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100_000
    ? Math.round(value)
    : null;

/**
 * A drawing made in Excalidraw: its scene (elements and the images they
 * use) and an SVG preview of it, which is what the page shows. It draws
 * its own DOM, an `<img>` of the preview, so it needs no framework, shows
 * with no Excalidraw loaded and renders the same on a server. Saved as
 * `<div data-tei-excalidraw data-scene>` round that `<img>`.
 */
export class ExcalidrawNode extends DecoratorNode<null> {
  __scene: ExcalidrawScene = EMPTY_SCENE;
  __preview: string | null = null;
  __altText = '';
  __width: number | null = null;
  __height: number | null = null;
  __align: ExcalidrawAlign = 'center';

  $config() {
    return this.config('excalidraw', { extends: DecoratorNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__scene = prev.__scene;
    this.__preview = prev.__preview;
    this.__altText = prev.__altText;
    this.__width = prev.__width;
    this.__height = prev.__height;
    this.__align = prev.__align;
  }

  getScene(): ExcalidrawScene {
    return this.getLatest().__scene;
  }

  /** Whether it has nothing drawn. */
  isEmpty(): boolean {
    return this.getLatest().__scene.elements.length === 0;
  }

  /** A new scene, checked; one that is not a scene is refused, the old one kept. */
  setScene(scene: unknown): this {
    const self = this.getWritable();
    const clean = cleanScene(scene);
    if (clean) self.__scene = clean;
    return self;
  }

  getPreview(): string | null {
    return this.getLatest().__preview;
  }

  /** The SVG preview, as a `data:` URL; anything else is none. */
  setPreview(preview: string | null): this {
    const self = this.getWritable();
    self.__preview = cleanPreview(preview);
    return self;
  }

  getAltText(): string {
    return this.getLatest().__altText;
  }

  setAltText(altText: string): this {
    const self = this.getWritable();
    if (typeof altText === 'string') self.__altText = altText.slice(0, 1000);
    return self;
  }

  getWidth(): number | null {
    return this.getLatest().__width;
  }

  getHeight(): number | null {
    return this.getLatest().__height;
  }

  /** The shown size in px; `null` for the drawing's own. */
  setSize(width: number | null, height: number | null = null): this {
    const self = this.getWritable();
    self.__width = size(width);
    self.__height = self.__width === null ? null : size(height);
    return self;
  }

  getAlign(): ExcalidrawAlign {
    return this.getLatest().__align;
  }

  setAlign(align: ExcalidrawAlign): this {
    const self = this.getWritable();
    if (EXCALIDRAW_ALIGNS.includes(align)) self.__align = align;
    return self;
  }

  // -- JSON ------------------------------------------------------------------

  updateFromJSON(json: LexicalUpdateJSON<SerializedExcalidrawNode>): this {
    const self = super.updateFromJSON(json);
    const data = json as Partial<SerializedExcalidrawNode> & { data?: unknown };
    // Lexical's playground keeps the scene as JSON text in `data`.
    const scene = typeof data.data === 'string' ? parseScene(data.data) : cleanScene(data);
    if (scene) self.setScene(scene);
    self.setPreview(typeof data.preview === 'string' ? data.preview : null);
    if (typeof data.altText === 'string') self.setAltText(data.altText);
    self.setSize(size(data.width), size(data.height));
    if (typeof data.align === 'string') self.setAlign(data.align);
    return self;
  }

  exportJSON(): SerializedExcalidrawNode {
    const self = this.getLatest();
    const json: SerializedExcalidrawNode = {
      ...super.exportJSON(),
      elements: self.__scene.elements,
      files: self.__scene.files,
    };
    if (self.__preview) json.preview = self.__preview;
    if (self.__altText) json.altText = self.__altText;
    if (self.__width !== null) json.width = self.__width;
    if (self.__height !== null) json.height = self.__height;
    if (self.__align !== 'center') json.align = self.__align;
    return json;
  }

  // -- DOM -------------------------------------------------------------------

  createDOM(config: EditorConfig): HTMLElement {
    const box = $getDocument().createElement('div');
    box.className = (config.theme.excalidraw as string | undefined) ?? 'tei-excalidraw';
    box.setAttribute('contenteditable', 'false');
    box.setAttribute('data-tei-excalidraw', '');
    this.#paint(box);
    return box;
  }

  updateDOM(_prev: this, dom: HTMLElement): false {
    this.#paint(dom);
    return false;
  }

  /** Attributes only: no style attribute for a strict CSP to report. */
  #paint(box: HTMLElement): void {
    box.setAttribute('data-align', this.__align);
    box.toggleAttribute('data-empty', this.__scene.elements.length === 0);
    let img = box.querySelector('img');
    if (!this.__preview) {
      img?.remove();
      box.setAttribute('role', 'img');
      return;
    }
    box.removeAttribute('role');
    if (!img) {
      img = $getDocument().createElement('img');
      img.draggable = false;
      img.decoding = 'async';
      box.append(img);
    }
    this.#image(img);
  }

  /** The `<img>` of the preview, from attributes. */
  #image(img: HTMLImageElement): void {
    if (img.getAttribute('src') !== this.__preview) img.setAttribute('src', this.__preview ?? '');
    img.setAttribute('alt', this.__altText);
    const set = (name: string, value: number | null) =>
      value === null ? img.removeAttribute(name) : img.setAttribute(name, String(value));
    set('width', this.__width);
    set('height', this.__height);
  }

  isInline(): false {
    return false;
  }

  /**
   * `<div data-tei-excalidraw data-scene>` round the preview's `<img>`: the
   * page shows the picture with nothing loaded, and the scene in
   * `data-scene` reads back whole.
   */
  exportDOM(): DOMExportOutput {
    const self = this.getLatest();
    const div = $getDocument().createElement('div');
    div.setAttribute('data-tei-excalidraw', '');
    div.setAttribute('data-scene', JSON.stringify(self.__scene));
    if (self.__align !== 'center') div.setAttribute('data-align', self.__align);
    if (self.__preview) {
      const img = $getDocument().createElement('img');
      self.#image(img);
      div.append(img);
    }
    return { element: div };
  }

  decorate(): null {
    return null;
  }

  getTextContent(): string {
    return '';
  }
}

export function $createExcalidrawNode(
  data: {
    scene?: unknown;
    preview?: string | null;
    altText?: string;
    width?: number | null;
    height?: number | null;
    align?: ExcalidrawAlign;
  } = {},
): ExcalidrawNode {
  const node = $create(ExcalidrawNode)
    .setScene(data.scene ?? EMPTY_SCENE)
    .setPreview(data.preview ?? null)
    .setAltText(data.altText ?? '')
    .setSize(data.width ?? null, data.height ?? null);
  return data.align ? node.setAlign(data.align) : node;
}

export function $isExcalidrawNode(node: LexicalNode | null | undefined): node is ExcalidrawNode {
  return node instanceof ExcalidrawNode;
}

/** The drawing with this key, else the selected one. */
export function $getExcalidraw(key?: NodeKey): ExcalidrawNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isExcalidrawNode(node) ? node : null;
  }
  const selection = $getSelection();
  const nodes = $isNodeSelection(selection) ? selection.getNodes() : [];
  return nodes.length === 1 && $isExcalidrawNode(nodes[0]) ? nodes[0] : null;
}
