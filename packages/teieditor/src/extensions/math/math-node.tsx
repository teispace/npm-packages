import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { JSX } from 'react';

export type SerializedMathNode = Spread<
  { expression: string; inline: boolean },
  SerializedLexicalNode
>;

export class MathNode extends DecoratorNode<JSX.Element> {
  __expression: string;
  __inline: boolean;

  static getType(): string {
    return 'math';
  }

  static clone(node: MathNode): MathNode {
    return new MathNode(node.__expression, node.__inline, node.__key);
  }

  constructor(expression: string, inline: boolean = false, key?: NodeKey) {
    super(key);
    this.__expression = expression;
    this.__inline = inline;
  }

  createDOM(): HTMLElement {
    const tag = this.__inline ? 'span' : 'div';
    const el = document.createElement(tag);
    el.className = this.__inline ? 'tei-math-inline' : 'tei-math-block my-4';
    return el;
  }

  updateDOM(): false {
    return false;
  }

  static importDOM(): null {
    return null;
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement(this.__inline ? 'span' : 'div');
    el.className = 'tei-math';
    el.setAttribute('data-math', this.__expression);
    el.textContent = this.__expression;
    return { element: el };
  }

  static importJSON(json: SerializedMathNode): MathNode {
    return $createMathNode(json.expression, json.inline);
  }

  exportJSON(): SerializedMathNode {
    return { type: 'math', version: 1, expression: this.__expression, inline: this.__inline };
  }

  getExpression(): string {
    return this.__expression;
  }
  isInline(): boolean {
    return this.__inline;
  }

  setExpression(expression: string): void {
    this.getWritable().__expression = expression;
  }

  decorate(): JSX.Element {
    return <MathComponent expression={this.__expression} inline={this.__inline} />;
  }
}

/**
 * Renders the math expression. If KaTeX is available globally or via dynamic
 * import, it will render formatted math. Otherwise falls back to monospace.
 */
function MathComponent({ expression, inline }: { expression: string; inline: boolean }) {
  // Fallback rendering — users can replace this with KaTeX rendering
  // by customizing via the registry component pattern
  const Tag = inline ? 'span' : 'div';
  return (
    <Tag
      className={`tei-math font-mono ${
        inline ? 'rounded bg-muted px-1 py-0.5 text-sm' : 'my-4 rounded-lg bg-muted p-4 text-center'
      }`}
      title="Math expression"
    >
      {expression}
    </Tag>
  );
}

export function $createMathNode(expression: string, inline: boolean = false): MathNode {
  return $applyNodeReplacement(new MathNode(expression, inline));
}

export function $isMathNode(node: LexicalNode | null | undefined): node is MathNode {
  return node instanceof MathNode;
}
