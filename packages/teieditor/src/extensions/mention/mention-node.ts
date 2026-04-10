import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
  Spread,
} from 'lexical';
import { $applyNodeReplacement, TextNode } from 'lexical';

export type SerializedMentionNode = Spread<
  { mentionName: string; mentionId: string; mentionType: string },
  SerializedTextNode
>;

export class MentionNode extends TextNode {
  __mentionName: string;
  __mentionId: string;
  __mentionType: string;

  static getType(): string {
    return 'mention';
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(
      node.__mentionName,
      node.__mentionId,
      node.__mentionType,
      node.__text,
      node.__key,
    );
  }

  constructor(name: string, id: string, type: string = 'user', text?: string, key?: NodeKey) {
    super(text ?? `@${name}`, key);
    this.__mentionName = name;
    this.__mentionId = id;
    this.__mentionType = type;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const el = super.createDOM(config);
    el.className =
      'tei-mention inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-medium text-primary cursor-pointer hover:bg-primary/20';
    el.setAttribute('data-mention-id', this.__mentionId);
    el.setAttribute('data-mention-type', this.__mentionType);
    return el;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode) => {
        if (!domNode.hasAttribute('data-mention-id')) return null;
        return { conversion: convertMentionElement, priority: 1 };
      },
    };
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('span');
    el.setAttribute('data-mention-id', this.__mentionId);
    el.setAttribute('data-mention-type', this.__mentionType);
    el.textContent = `@${this.__mentionName}`;
    return { element: el };
  }

  static importJSON(json: SerializedMentionNode): MentionNode {
    return $createMentionNode(json.mentionName, json.mentionId, json.mentionType);
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      type: 'mention',
      mentionName: this.__mentionName,
      mentionId: this.__mentionId,
      mentionType: this.__mentionType,
    };
  }

  isTextEntity(): true {
    return true;
  }
  canInsertTextBefore(): boolean {
    return false;
  }
  canInsertTextAfter(): boolean {
    return false;
  }
}

function convertMentionElement(domNode: HTMLElement): DOMConversionOutput {
  const id = domNode.getAttribute('data-mention-id') || '';
  const type = domNode.getAttribute('data-mention-type') || 'user';
  const name = (domNode.textContent || '').replace(/^@/, '');
  return { node: $createMentionNode(name, id, type) };
}

export function $createMentionNode(name: string, id: string, type: string = 'user'): MentionNode {
  return $applyNodeReplacement(new MentionNode(name, id, type));
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}
