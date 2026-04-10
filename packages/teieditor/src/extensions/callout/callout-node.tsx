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

export type CalloutVariant = 'info' | 'warning' | 'error' | 'success' | 'note';

export type SerializedCalloutNode = Spread<{ variant: CalloutVariant }, SerializedElementNode>;

const VARIANT_STYLES: Record<CalloutVariant, string> = {
  info: 'tei-callout-info border-blue-400 bg-blue-50 dark:bg-blue-950/30',
  warning: 'tei-callout-warning border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30',
  error: 'tei-callout-error border-red-400 bg-red-50 dark:bg-red-950/30',
  success: 'tei-callout-success border-green-400 bg-green-50 dark:bg-green-950/30',
  note: 'tei-callout-note border-gray-400 bg-gray-50 dark:bg-gray-950/30',
};

/** Icons for callout variants. Exported for use in toolbar/UI components. */
export const VARIANT_ICONS: Record<CalloutVariant, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  success: '✅',
  note: '📝',
};

export class CalloutNode extends ElementNode {
  __variant: CalloutVariant;

  static getType(): string {
    return 'callout';
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__variant, node.__key);
  }

  constructor(variant: CalloutVariant = 'info', key?: NodeKey) {
    super(key);
    this.__variant = variant;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div');
    div.className = `tei-callout my-4 rounded-lg border-l-4 p-4 ${VARIANT_STYLES[this.__variant]}`;
    div.setAttribute('data-callout-variant', this.__variant);
    return div;
  }

  updateDOM(prevNode: CalloutNode, dom: HTMLElement): boolean {
    if (prevNode.__variant !== this.__variant) {
      dom.className = `tei-callout my-4 rounded-lg border-l-4 p-4 ${VARIANT_STYLES[this.__variant]}`;
      dom.setAttribute('data-callout-variant', this.__variant);
    }
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        const variant = domNode.getAttribute('data-callout-variant');
        if (!variant) return null;
        return { conversion: () => convertCalloutElement(variant as CalloutVariant), priority: 1 };
      },
    };
  }

  exportDOM(): DOMExportOutput {
    const div = document.createElement('div');
    div.className = `tei-callout ${VARIANT_STYLES[this.__variant]}`;
    div.setAttribute('data-callout-variant', this.__variant);
    return { element: div };
  }

  static importJSON(json: SerializedCalloutNode): CalloutNode {
    return $createCalloutNode(json.variant);
  }

  exportJSON(): SerializedCalloutNode {
    return { ...super.exportJSON(), type: 'callout', variant: this.__variant };
  }

  getVariant(): CalloutVariant {
    return this.__variant;
  }

  setVariant(variant: CalloutVariant): void {
    const writable = this.getWritable();
    writable.__variant = variant;
  }
}

function convertCalloutElement(variant: CalloutVariant): DOMConversionOutput {
  return { node: $createCalloutNode(variant) };
}

export function $createCalloutNode(variant: CalloutVariant = 'info'): CalloutNode {
  return $applyNodeReplacement(new CalloutNode(variant));
}

export function $isCalloutNode(node: LexicalNode | null | undefined): node is CalloutNode {
  return node instanceof CalloutNode;
}
