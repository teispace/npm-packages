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
  info: 'tei-callout-info border-[hsl(var(--tei-callout-info-border))] bg-[hsl(var(--tei-callout-info-bg))]',
  warning:
    'tei-callout-warning border-[hsl(var(--tei-callout-warning-border))] bg-[hsl(var(--tei-callout-warning-bg))]',
  error:
    'tei-callout-error border-[hsl(var(--tei-callout-error-border))] bg-[hsl(var(--tei-callout-error-bg))]',
  success:
    'tei-callout-success border-[hsl(var(--tei-callout-success-border))] bg-[hsl(var(--tei-callout-success-bg))]',
  note: 'tei-callout-note border-[hsl(var(--tei-callout-note-border))] bg-[hsl(var(--tei-callout-note-bg))]',
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
