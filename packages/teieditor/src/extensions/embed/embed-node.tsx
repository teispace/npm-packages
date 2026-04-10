import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { JSX } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmbedType = 'youtube' | 'twitter' | 'generic';

export type SerializedEmbedNode = Spread<
  { url: string; embedType: EmbedType },
  SerializedLexicalNode
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectEmbedType(url: string): EmbedType {
  if (/(?:youtube\.com\/watch|youtu\.be\/)/.test(url)) return 'youtube';
  if (/(?:twitter\.com|x\.com)\/\w+\/status\//.test(url)) return 'twitter';
  return 'generic';
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1]! : null;
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

export class EmbedNode extends DecoratorNode<JSX.Element> {
  __url: string;
  __embedType: EmbedType;

  static getType(): string {
    return 'embed';
  }

  static clone(node: EmbedNode): EmbedNode {
    return new EmbedNode(node.__url, node.__embedType, node.__key);
  }

  constructor(url: string, embedType?: EmbedType, key?: NodeKey) {
    super(key);
    this.__url = url;
    this.__embedType = embedType ?? detectEmbedType(url);
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'tei-embed-wrapper my-4';
    return div;
  }

  updateDOM(): false {
    return false;
  }

  static importDOM(): null {
    return null;
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('a');
    el.href = this.__url;
    el.textContent = this.__url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    return { element: el };
  }

  static importJSON(json: SerializedEmbedNode): EmbedNode {
    return $createEmbedNode(json.url, json.embedType);
  }

  exportJSON(): SerializedEmbedNode {
    return { type: 'embed', version: 1, url: this.__url, embedType: this.__embedType };
  }

  getUrl(): string {
    return this.__url;
  }
  isInline(): false {
    return false;
  }

  decorate(): JSX.Element {
    return <EmbedComponent url={this.__url} embedType={this.__embedType} />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EmbedComponent({ url, embedType }: { url: string; embedType: EmbedType }) {
  if (embedType === 'youtube') {
    const id = getYouTubeId(url);
    if (id) {
      return (
        <div className="tei-embed tei-embed-youtube my-4 aspect-video w-full max-w-2xl overflow-hidden rounded-lg">
          <iframe
            src={`https://www.youtube.com/embed/${id}`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      );
    }
  }

  if (embedType === 'twitter') {
    return (
      <div className="tei-embed tei-embed-twitter my-4 rounded-lg border border-border p-4">
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
          View on X (Twitter) →
        </a>
      </div>
    );
  }

  // Generic embed — render as a styled link card
  return (
    <div className="tei-embed tei-embed-generic my-4 flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-lg">
        🔗
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-sm text-primary underline"
      >
        {url}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function $createEmbedNode(url: string, embedType?: EmbedType): EmbedNode {
  return $applyNodeReplacement(new EmbedNode(url, embedType));
}

export function $isEmbedNode(node: LexicalNode | null | undefined): node is EmbedNode {
  return node instanceof EmbedNode;
}
