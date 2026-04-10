import type {
  DOMExportOutput,
  Klass,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DecoratorNode,
  type LexicalCommand,
} from 'lexical';
import type { JSX } from 'react';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

// Node
export type SerializedFigmaNode = Spread<{ documentID: string }, SerializedLexicalNode>;

const FIGMA_REGEX =
  /https:\/\/([\w.-]+\.)?figma\.com\/(file|proto)\/([0-9a-zA-Z]{22,128})(?:\/.*)?$/;

export function parseFigmaUrl(url: string): string | null {
  const match = url.match(FIGMA_REGEX);
  return match?.[3] ?? null;
}

export class FigmaNode extends DecoratorNode<JSX.Element> {
  __documentID: string;
  static getType(): string {
    return 'figma';
  }
  static clone(node: FigmaNode): FigmaNode {
    return new FigmaNode(node.__documentID, node.__key);
  }

  constructor(documentID: string, key?: NodeKey) {
    super(key);
    this.__documentID = documentID;
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'tei-figma-wrapper my-4';
    return div;
  }
  updateDOM(): false {
    return false;
  }
  static importDOM(): null {
    return null;
  }
  exportDOM(): DOMExportOutput {
    const a = document.createElement('a');
    a.href = `https://www.figma.com/file/${this.__documentID}`;
    a.textContent = 'View on Figma';
    a.target = '_blank';
    return { element: a };
  }
  static importJSON(json: SerializedFigmaNode): FigmaNode {
    return $createFigmaNode(json.documentID);
  }
  exportJSON(): SerializedFigmaNode {
    return { type: 'figma', version: 1, documentID: this.__documentID };
  }
  isInline(): false {
    return false;
  }
  decorate(): JSX.Element {
    return (
      <div className="tei-figma my-4 aspect-video w-full max-w-2xl overflow-hidden rounded-lg border border-[hsl(var(--tei-border))]">
        <iframe
          src={`https://www.figma.com/embed?embed_host=teieditor&url=https://www.figma.com/file/${this.__documentID}`}
          title="Figma design"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    );
  }
}

export function $createFigmaNode(documentID: string): FigmaNode {
  return $applyNodeReplacement(new FigmaNode(documentID));
}
export function $isFigmaNode(node: LexicalNode | null | undefined): node is FigmaNode {
  return node instanceof FigmaNode;
}

// Extension
export const INSERT_FIGMA_COMMAND: LexicalCommand<string> = createCommand('INSERT_FIGMA_COMMAND');

class FigmaExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'figma';
  protected readonly defaults = {};
  getNodes(): Array<Klass<LexicalNode>> {
    return [FigmaNode];
  }
  onRegister(editor: LexicalEditor): (() => void) | void {
    return editor.registerCommand(
      INSERT_FIGMA_COMMAND,
      (url) => {
        const docID = parseFigmaUrl(url);
        if (!docID) return false;
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const node = $createFigmaNode(docID);
          sel.insertNodes([node]);
          const p = $createParagraphNode();
          node.insertAfter(p);
          p.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const Figma = new FigmaExtension();
