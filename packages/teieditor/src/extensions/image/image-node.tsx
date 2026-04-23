import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
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
import {
  $applyNodeReplacement,
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
} from 'lexical';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef } from 'react';

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
        nodeKey={this.__key}
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
  nodeKey,
}: {
  src: string;
  altText: string;
  width: number | 'inherit';
  height: number | 'inherit';
  caption: string;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const imgRef = useRef<HTMLImageElement>(null);

  // Click to select
  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event: MouseEvent) => {
        if (imgRef.current && imgRef.current.contains(event.target as Node)) {
          if (!event.shiftKey) clearSelection();
          setSelected(true);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, setSelected, clearSelection]);

  // Resize handler
  const handleResize = useCallback(
    (newWidth: number, newHeight: number) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node && node instanceof ImageNode) {
          node.setWidthAndHeight(newWidth, newHeight);
        }
      });
    },
    [editor, nodeKey],
  );

  const numericWidth = width !== 'inherit' ? width : undefined;
  const numericHeight = height !== 'inherit' ? height : undefined;

  return (
    <figure
      className={`tei-image group my-4 flex flex-col items-center ${
        isSelected ? 'ring-2 ring-[hsl(var(--tei-ring))] rounded-lg' : ''
      }`}
    >
      <div className="relative inline-block">
        <img
          ref={imgRef}
          src={src}
          alt={altText}
          className="max-w-full rounded-lg cursor-pointer"
          style={{
            width: numericWidth,
            height: numericHeight,
          }}
          draggable={false}
        />
        {/* Resize handles shown when selected. Fall back to the rendered
            image dimensions if the node hasn't been explicitly sized yet —
            otherwise the handles would only appear after the first resize. */}
        {isSelected && (
          <div className="absolute inset-0">
            {[
              'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize',
              'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize',
              'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize',
              'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-se-resize',
            ].map((pos) => (
              <div
                key={pos}
                className={`absolute h-3 w-3 rounded-full border-2 border-[hsl(var(--tei-primary))] bg-[hsl(var(--tei-bg))] ${pos}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const img = imgRef.current;
                  if (!img) return;
                  const startX = e.clientX;
                  const startW = numericWidth ?? img.offsetWidth;
                  const startH = numericHeight ?? img.offsetHeight;
                  const aspect = startH > 0 ? startW / startH : 1;
                  const isRight = pos.includes('right');

                  const onMove = (ev: PointerEvent) => {
                    const dx = ev.clientX - startX;
                    const delta = isRight ? dx : -dx;
                    let newW = Math.max(50, startW + delta);
                    const newH = Math.max(50, newW / aspect);
                    newW = newH * aspect;
                    handleResize(Math.round(newW), Math.round(newH));
                  };
                  const onUp = () => {
                    document.removeEventListener('pointermove', onMove);
                    document.removeEventListener('pointerup', onUp);
                  };
                  document.addEventListener('pointermove', onMove);
                  document.addEventListener('pointerup', onUp);
                }}
              />
            ))}
          </div>
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-[hsl(var(--tei-muted-fg))]">
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
