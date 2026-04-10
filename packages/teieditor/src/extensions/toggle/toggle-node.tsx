import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical';
import { $applyNodeReplacement, ElementNode } from 'lexical';

export type SerializedToggleNode = Spread<{ title: string; open: boolean }, SerializedElementNode>;

export class ToggleNode extends ElementNode {
  __title: string;
  __open: boolean;

  static getType(): string {
    return 'toggle';
  }

  static clone(node: ToggleNode): ToggleNode {
    return new ToggleNode(node.__title, node.__open, node.__key);
  }

  constructor(title: string = 'Toggle', open: boolean = false, key?: NodeKey) {
    super(key);
    this.__title = title;
    this.__open = open;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createDOM(_config: EditorConfig): HTMLElement {
    const details = document.createElement('details');
    details.className = 'tei-toggle my-4 rounded-lg border border-border';
    if (this.__open) details.open = true;

    const summary = document.createElement('summary');
    summary.className =
      'tei-toggle-title cursor-pointer select-none px-4 py-2 font-medium hover:bg-accent/50 rounded-t-lg';
    summary.textContent = this.__title;
    details.appendChild(summary);

    const content = document.createElement('div');
    content.className = 'tei-toggle-content px-4 py-2';
    details.appendChild(content);

    return details;
  }

  updateDOM(prevNode: ToggleNode, dom: HTMLElement): boolean {
    const details = dom as HTMLDetailsElement;
    if (prevNode.__open !== this.__open) {
      details.open = this.__open;
    }
    const summary = dom.querySelector('summary');
    if (summary && prevNode.__title !== this.__title) {
      summary.textContent = this.__title;
    }
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      details: () => ({
        conversion: convertToggleElement,
        priority: 0,
      }),
    };
  }

  exportDOM(): DOMExportOutput {
    const details = document.createElement('details');
    if (this.__open) details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = this.__title;
    details.appendChild(summary);
    return { element: details };
  }

  static importJSON(json: SerializedToggleNode): ToggleNode {
    return $createToggleNode(json.title, json.open);
  }

  exportJSON(): SerializedToggleNode {
    return { ...super.exportJSON(), type: 'toggle', title: this.__title, open: this.__open };
  }

  getTitle(): string {
    return this.__title;
  }
  isOpen(): boolean {
    return this.__open;
  }

  setTitle(title: string): void {
    this.getWritable().__title = title;
  }

  toggleOpen(): void {
    this.getWritable().__open = !this.__open;
  }
}

function convertToggleElement(domNode: HTMLElement): DOMConversionOutput {
  const summary = domNode.querySelector('summary');
  const title = summary?.textContent || 'Toggle';
  const open = (domNode as HTMLDetailsElement).open;
  return { node: $createToggleNode(title, open) };
}

export function $createToggleNode(title: string = 'Toggle', open: boolean = false): ToggleNode {
  return $applyNodeReplacement(new ToggleNode(title, open));
}

export function $isToggleNode(node: LexicalNode | null | undefined): node is ToggleNode {
  return node instanceof ToggleNode;
}
