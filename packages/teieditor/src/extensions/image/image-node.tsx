import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { JSX } from 'react';

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export type SerializedImageNode = Spread<
  {
    src: string;
    altText: string;
    width: number | 'inherit';
    height: number | 'inherit';
    caption: string;
  },
  SerializedLexicalNode
>;

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __width: number | 'inherit';
  __height: number | 'inherit';
  __caption: string;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__caption,
      node.__key,
    );
  }

  constructor(
    src: string,
    altText: string,
    width?: number | 'inherit',
    height?: number | 'inherit',
    caption?: string,
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width ?? 'inherit';
    this.__height = height ?? 'inherit';
    this.__caption = caption ?? '';
  }

  // -- DOM ------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div');
    div.className = 'tei-image-wrapper relative my-4';
    return div;
  }

  updateDOM(): false {
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: convertImageElement,
        priority: 0,
      }),
    };
  }

  exportDOM(): DOMExportOutput {
    const img = document.createElement('img');
    img.setAttribute('src', this.__src);
    img.setAttribute('alt', this.__altText);
    if (this.__width !== 'inherit') img.setAttribute('width', String(this.__width));
    if (this.__height !== 'inherit') img.setAttribute('height', String(this.__height));
    return { element: img };
  }

  // -- JSON -----------------------------------------------------------------

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return $createImageNode({
      src: serializedNode.src,
      altText: serializedNode.altText,
      width: serializedNode.width,
      height: serializedNode.height,
      caption: serializedNode.caption,
    });
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
      caption: this.__caption,
    };
  }

  // -- Accessors ------------------------------------------------------------

  getSrc(): string {
    return this.__src;
  }
  getAltText(): string {
    return this.__altText;
  }

  setWidthAndHeight(width: number | 'inherit', height: number | 'inherit'): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  setCaption(caption: string): void {
    const writable = this.getWritable();
    writable.__caption = caption;
  }

  // -- Decorator ------------------------------------------------------------

  isInline(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        width={this.__width}
        height={this.__height}
        caption={this.__caption}
      />
    );
  }
}

// ---------------------------------------------------------------------------
// React component rendered by the decorator
// ---------------------------------------------------------------------------

function ImageComponent({
  src,
  altText,
  width,
  height,
  caption,
}: {
  src: string;
  altText: string;
  width: number | 'inherit';
  height: number | 'inherit';
  caption: string;
}) {
  return (
    <figure className="tei-image group my-4 flex flex-col items-center">
      <img
        src={src}
        alt={altText}
        className="max-w-full rounded-lg"
        style={{
          width: width !== 'inherit' ? width : undefined,
          height: height !== 'inherit' ? height : undefined,
        }}
        draggable={false}
      />
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function convertImageElement(domNode: HTMLElement): DOMConversionOutput | null {
  const img = domNode as HTMLImageElement;
  if (img.src) {
    return {
      node: $createImageNode({
        src: img.src,
        altText: img.alt || '',
        width: img.width || 'inherit',
        height: img.height || 'inherit',
      }),
    };
  }
  return null;
}

export interface ImagePayload {
  src: string;
  altText: string;
  width?: number | 'inherit';
  height?: number | 'inherit';
  caption?: string;
  key?: NodeKey;
}

export function $createImageNode({
  src,
  altText,
  width,
  height,
  caption,
  key,
}: ImagePayload): ImageNode {
  return $applyNodeReplacement(new ImageNode(src, altText, width, height, caption, key));
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}
