import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  Klass,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
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
export class PageBreakNode extends DecoratorNode<JSX.Element> {
  static getType(): string {
    return 'page-break';
  }
  static clone(node: PageBreakNode): PageBreakNode {
    return new PageBreakNode(node.__key);
  }
  constructor(key?: NodeKey) {
    super(key);
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'tei-page-break my-6';
    div.style.pageBreakAfter = 'always';
    return div;
  }
  updateDOM(): false {
    return false;
  }
  static importDOM(): DOMConversionMap | null {
    return {
      figure: (domNode) => {
        if (domNode.getAttribute('data-type') === 'page-break') {
          return {
            conversion: (): DOMConversionOutput => ({ node: $createPageBreakNode() }),
            priority: 1,
          };
        }
        return null;
      },
    };
  }
  exportDOM(): DOMExportOutput {
    const el = document.createElement('figure');
    el.setAttribute('data-type', 'page-break');
    el.style.pageBreakAfter = 'always';
    return { element: el };
  }
  static importJSON(): PageBreakNode {
    return $createPageBreakNode();
  }
  exportJSON(): SerializedLexicalNode {
    return { type: 'page-break', version: 1 };
  }
  getTextContent(): string {
    return '\n';
  }
  isInline(): false {
    return false;
  }
  decorate(): JSX.Element {
    return (
      <div className="tei-page-break my-6 flex items-center gap-3">
        <div className="flex-1 border-t border-dashed border-[hsl(var(--tei-border))]" />
        <span className="text-xs font-medium text-[hsl(var(--tei-muted-fg))]">PAGE BREAK</span>
        <div className="flex-1 border-t border-dashed border-[hsl(var(--tei-border))]" />
      </div>
    );
  }
}

export function $createPageBreakNode(): PageBreakNode {
  return $applyNodeReplacement(new PageBreakNode());
}
export function $isPageBreakNode(node: LexicalNode | null | undefined): node is PageBreakNode {
  return node instanceof PageBreakNode;
}

// Extension
export const INSERT_PAGE_BREAK_COMMAND: LexicalCommand<void> = createCommand(
  'INSERT_PAGE_BREAK_COMMAND',
);

class PageBreakExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'pageBreak';
  protected readonly defaults = {};
  getNodes(): Array<Klass<LexicalNode>> {
    return [PageBreakNode];
  }
  onRegister(editor: LexicalEditor): (() => void) | void {
    return editor.registerCommand(
      INSERT_PAGE_BREAK_COMMAND,
      () => {
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const node = $createPageBreakNode();
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

export const PageBreak = new PageBreakExtension();
