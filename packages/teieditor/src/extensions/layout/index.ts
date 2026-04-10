import type {
  DOMExportOutput,
  EditorConfig,
  Klass,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical';
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  ElementNode,
  type LexicalCommand,
} from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';

// ---------------------------------------------------------------------------
// LayoutContainerNode
// ---------------------------------------------------------------------------

export type SerializedLayoutContainerNode = Spread<{ columns: number }, SerializedElementNode>;

export class LayoutContainerNode extends ElementNode {
  __columns: number;
  static getType(): string {
    return 'layout-container';
  }
  static clone(node: LayoutContainerNode): LayoutContainerNode {
    return new LayoutContainerNode(node.__columns, node.__key);
  }

  constructor(columns: number = 2, key?: NodeKey) {
    super(key);
    this.__columns = columns;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div');
    div.className = `tei-layout grid gap-4 my-4`;
    div.style.gridTemplateColumns = `repeat(${this.__columns}, 1fr)`;
    return div;
  }

  updateDOM(prevNode: LayoutContainerNode, dom: HTMLElement): boolean {
    if (prevNode.__columns !== this.__columns) {
      dom.style.gridTemplateColumns = `repeat(${this.__columns}, 1fr)`;
    }
    return false;
  }

  static importDOM(): null {
    return null;
  }
  exportDOM(): DOMExportOutput {
    const div = document.createElement('div');
    div.style.display = 'grid';
    div.style.gridTemplateColumns = `repeat(${this.__columns}, 1fr)`;
    div.style.gap = '1rem';
    return { element: div };
  }

  static importJSON(json: SerializedLayoutContainerNode): LayoutContainerNode {
    return $createLayoutContainerNode(json.columns);
  }

  exportJSON(): SerializedLayoutContainerNode {
    return { ...super.exportJSON(), type: 'layout-container', columns: this.__columns };
  }

  getColumns(): number {
    return this.__columns;
  }
  isShadowRoot(): boolean {
    return true;
  }
}

export function $createLayoutContainerNode(columns: number = 2): LayoutContainerNode {
  return $applyNodeReplacement(new LayoutContainerNode(columns));
}

// ---------------------------------------------------------------------------
// LayoutItemNode
// ---------------------------------------------------------------------------

export class LayoutItemNode extends ElementNode {
  static getType(): string {
    return 'layout-item';
  }
  static clone(node: LayoutItemNode): LayoutItemNode {
    return new LayoutItemNode(node.__key);
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className =
      'tei-layout-item rounded-lg border border-[hsl(var(--tei-border))] p-3 min-h-[100px]';
    return div;
  }

  updateDOM(): false {
    return false;
  }
  static importDOM(): null {
    return null;
  }
  exportDOM(): DOMExportOutput {
    const div = document.createElement('div');
    return { element: div };
  }
  static importJSON(): LayoutItemNode {
    return new LayoutItemNode();
  }
  exportJSON(): SerializedElementNode {
    return { ...super.exportJSON(), type: 'layout-item' };
  }
  isShadowRoot(): boolean {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export interface LayoutPayload {
  columns: number;
}

export const INSERT_LAYOUT_COMMAND: LexicalCommand<LayoutPayload> =
  createCommand('INSERT_LAYOUT_COMMAND');

class LayoutExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'layout';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [LayoutContainerNode, LayoutItemNode];
  }

  onRegister(editor: LexicalEditor): (() => void) | void {
    return editor.registerCommand(
      INSERT_LAYOUT_COMMAND,
      ({ columns }) => {
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;

          const container = $createLayoutContainerNode(columns);
          for (let i = 0; i < columns; i++) {
            const item = new LayoutItemNode();
            const p = $createParagraphNode();
            item.append(p);
            container.append(item);
          }

          sel.insertNodes([container]);
          const after = $createParagraphNode();
          container.insertAfter(after);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const Layout = new LayoutExtension();
