import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical';
import { $applyNodeReplacement, ElementNode } from 'lexical';

// ---------------------------------------------------------------------------
// CollapsibleContainerNode (<details>)
// ---------------------------------------------------------------------------

export type SerializedCollapsibleContainerNode = Spread<{ open: boolean }, SerializedElementNode>;

export class CollapsibleContainerNode extends ElementNode {
  __open: boolean;

  static getType(): string {
    return 'collapsible-container';
  }

  static clone(node: CollapsibleContainerNode): CollapsibleContainerNode {
    return new CollapsibleContainerNode(node.__open, node.__key);
  }

  constructor(open: boolean = false, key?: NodeKey) {
    super(key);
    this.__open = open;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('details');
    dom.classList.add('tei-collapsible-container');
    if (config.theme.collapsibleContainer) {
      dom.className = config.theme.collapsibleContainer;
    }
    dom.open = this.__open;
    dom.addEventListener('toggle', () => {
      const open = dom.open;
      const editor = (config as any).__lexicalEditor;
      // Sync the DOM state back to the node
      if (editor) {
        editor.update(() => {
          const writable = this.getWritable();
          writable.__open = open;
        });
      }
    });
    return dom;
  }

  updateDOM(prevNode: CollapsibleContainerNode, dom: HTMLDetailsElement): boolean {
    if (prevNode.__open !== this.__open) {
      dom.open = this.__open;
    }
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      details: () => ({
        conversion: (domNode: HTMLElement) => {
          const open = (domNode as HTMLDetailsElement).open;
          return { node: $createCollapsibleContainerNode(open) };
        },
        priority: 1,
      }),
    };
  }

  exportDOM(): DOMExportOutput {
    const dom = document.createElement('details');
    dom.open = this.__open;
    return { element: dom };
  }

  static importJSON(json: SerializedCollapsibleContainerNode): CollapsibleContainerNode {
    return $createCollapsibleContainerNode(json.open);
  }

  exportJSON(): SerializedCollapsibleContainerNode {
    return {
      ...super.exportJSON(),
      type: 'collapsible-container',
      open: this.__open,
    };
  }

  isOpen(): boolean {
    return this.__open;
  }

  setOpen(open: boolean): void {
    this.getWritable().__open = open;
  }

  toggleOpen(): void {
    this.getWritable().__open = !this.__open;
  }

  isShadowRoot(): boolean {
    return true;
  }
}

export function $createCollapsibleContainerNode(open: boolean = false): CollapsibleContainerNode {
  return $applyNodeReplacement(new CollapsibleContainerNode(open));
}

export function $isCollapsibleContainerNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContainerNode {
  return node instanceof CollapsibleContainerNode;
}

// ---------------------------------------------------------------------------
// CollapsibleTitleNode (<summary>)
// ---------------------------------------------------------------------------

export type SerializedCollapsibleTitleNode = SerializedElementNode;

export class CollapsibleTitleNode extends ElementNode {
  static getType(): string {
    return 'collapsible-title';
  }

  static clone(node: CollapsibleTitleNode): CollapsibleTitleNode {
    return new CollapsibleTitleNode(node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('summary');
    dom.classList.add('tei-collapsible-title');
    if (config.theme.collapsibleTitle) {
      dom.className = config.theme.collapsibleTitle;
    }
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      summary: () => ({
        conversion: () => ({ node: $createCollapsibleTitleNode() }),
        priority: 1,
      }),
    };
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement('summary') };
  }

  static importJSON(): CollapsibleTitleNode {
    return $createCollapsibleTitleNode();
  }

  exportJSON(): SerializedCollapsibleTitleNode {
    return { ...super.exportJSON(), type: 'collapsible-title' };
  }

  collapseAtStart(): boolean {
    // Don't allow collapsing the title to avoid losing it
    return false;
  }
}

export function $createCollapsibleTitleNode(): CollapsibleTitleNode {
  return $applyNodeReplacement(new CollapsibleTitleNode());
}

export function $isCollapsibleTitleNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleTitleNode {
  return node instanceof CollapsibleTitleNode;
}

// ---------------------------------------------------------------------------
// CollapsibleContentNode
// ---------------------------------------------------------------------------

export type SerializedCollapsibleContentNode = SerializedElementNode;

export class CollapsibleContentNode extends ElementNode {
  static getType(): string {
    return 'collapsible-content';
  }

  static clone(node: CollapsibleContentNode): CollapsibleContentNode {
    return new CollapsibleContentNode(node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('div');
    dom.classList.add('tei-collapsible-content');
    if (config.theme.collapsibleContent) {
      dom.className = config.theme.collapsibleContent;
    }
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement('div') };
  }

  static importJSON(): CollapsibleContentNode {
    return $createCollapsibleContentNode();
  }

  exportJSON(): SerializedCollapsibleContentNode {
    return { ...super.exportJSON(), type: 'collapsible-content' };
  }

  isShadowRoot(): boolean {
    return true;
  }
}

export function $createCollapsibleContentNode(): CollapsibleContentNode {
  return $applyNodeReplacement(new CollapsibleContentNode());
}

export function $isCollapsibleContentNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContentNode {
  return node instanceof CollapsibleContentNode;
}
