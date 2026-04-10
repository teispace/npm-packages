import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { JSX } from 'react';

export type SerializedYouTubeNode = Spread<{ videoID: string }, SerializedLexicalNode>;

const YOUTUBE_REGEX = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;

export function parseYouTubeUrl(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  return match && match[2]?.length === 11 ? match[2] : null;
}

export class YouTubeNode extends DecoratorNode<JSX.Element> {
  __videoID: string;

  static getType(): string {
    return 'youtube';
  }

  static clone(node: YouTubeNode): YouTubeNode {
    return new YouTubeNode(node.__videoID, node.__key);
  }

  constructor(videoID: string, key?: NodeKey) {
    super(key);
    this.__videoID = videoID;
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'tei-youtube-wrapper my-4';
    return div;
  }

  updateDOM(): false {
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      iframe: (domNode: HTMLElement) => {
        const src = domNode.getAttribute('src') || '';
        if (src.includes('youtube.com/embed/') || src.includes('youtube-nocookie.com/embed/')) {
          return {
            conversion: (node: HTMLElement) => convertYouTubeElement(node),
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  exportDOM(): DOMExportOutput {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', `https://www.youtube-nocookie.com/embed/${this.__videoID}`);
    iframe.setAttribute('width', '560');
    iframe.setAttribute('height', '315');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    );
    iframe.setAttribute('title', 'YouTube video');
    return { element: iframe };
  }

  static importJSON(json: SerializedYouTubeNode): YouTubeNode {
    return $createYouTubeNode(json.videoID);
  }

  exportJSON(): SerializedYouTubeNode {
    return { type: 'youtube', version: 1, videoID: this.__videoID };
  }

  getVideoID(): string {
    return this.__videoID;
  }

  getTextContent(): string {
    return `https://www.youtube.com/watch?v=${this.__videoID}`;
  }

  isInline(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <div className="tei-youtube my-4 aspect-video w-full max-w-2xl overflow-hidden rounded-lg">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${this.__videoID}`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    );
  }
}

function convertYouTubeElement(domNode: HTMLElement): DOMConversionOutput | null {
  const src = domNode.getAttribute('src') || '';
  const match = src.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (match?.[1]) {
    return { node: $createYouTubeNode(match[1]) };
  }
  return null;
}

export function $createYouTubeNode(videoID: string): YouTubeNode {
  return $applyNodeReplacement(new YouTubeNode(videoID));
}

export function $isYouTubeNode(node: LexicalNode | null | undefined): node is YouTubeNode {
  return node instanceof YouTubeNode;
}
