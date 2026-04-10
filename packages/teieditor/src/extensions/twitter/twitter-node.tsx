import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { JSX } from 'react';

export type SerializedTweetNode = Spread<{ tweetID: string }, SerializedLexicalNode>;

const TWEET_REGEX = /^https:\/\/(twitter|x)\.com\/(#!\/)?(\w+)\/status(es)*\/(\d+)/;

export function parseTweetUrl(url: string): string | null {
  const match = url.match(TWEET_REGEX);
  return match?.[5] ?? null;
}

export class TweetNode extends DecoratorNode<JSX.Element> {
  __tweetID: string;

  static getType(): string {
    return 'tweet';
  }

  static clone(node: TweetNode): TweetNode {
    return new TweetNode(node.__tweetID, node.__key);
  }

  constructor(tweetID: string, key?: NodeKey) {
    super(key);
    this.__tweetID = tweetID;
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'tei-tweet-wrapper my-4';
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
    el.href = `https://x.com/i/status/${this.__tweetID}`;
    el.textContent = `Tweet ${this.__tweetID}`;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    return { element: el };
  }

  static importJSON(json: SerializedTweetNode): TweetNode {
    return $createTweetNode(json.tweetID);
  }

  exportJSON(): SerializedTweetNode {
    return { type: 'tweet', version: 1, tweetID: this.__tweetID };
  }

  isInline(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <div className="tei-tweet my-4 max-w-lg rounded-xl border border-[hsl(var(--tei-border))] p-4">
        <div className="mb-2 flex items-center gap-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-[hsl(var(--tei-fg))]"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span className="text-sm font-medium">Post</span>
        </div>
        <a
          href={`https://x.com/i/status/${this.__tweetID}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[hsl(var(--tei-primary))] underline hover:opacity-80"
        >
          View on X →
        </a>
      </div>
    );
  }
}

export function $createTweetNode(tweetID: string): TweetNode {
  return $applyNodeReplacement(new TweetNode(tweetID));
}

export function $isTweetNode(node: LexicalNode | null | undefined): node is TweetNode {
  return node instanceof TweetNode;
}
