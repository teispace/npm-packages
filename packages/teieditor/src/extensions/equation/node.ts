import {
  $create,
  $getDocument,
  $getEditor,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type LexicalUpdateJSON,
  type SerializedLexicalNode,
} from 'lexical';
import { getPeerOptions } from '../../core/define.js';
import { type KatexSource, katexNow, paintMath } from './render.js';

/** The extension's name, which the node asks for its options. */
export const EQUATION_EXTENSION = '@teispace/teieditor/equation';

/** The longest TeX an equation holds; longer is refused. */
export const MAX_EQUATION_LENGTH = 10_000;

export interface SerializedEquationNode extends SerializedLexicalNode {
  /** The TeX. */
  equation: string;
  /** In a line of text, rather than a block of its own. */
  inline: boolean;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it strips
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** TeX as an equation keeps it: a string, without control characters; `null` when too long. */
export function cleanTeX(tex: unknown, max = MAX_EQUATION_LENGTH): string | null {
  if (typeof tex !== 'string' || tex.length > max) return null;
  return tex.replace(CONTROL, '');
}

/** The extension's KaTeX, if an editor with it is at hand. */
function $katexSource(): KatexSource | undefined {
  try {
    return getPeerOptions<{ katex: KatexSource }>($getEditor(), EQUATION_EXTENSION)?.katex;
  } catch {
    return undefined;
  }
}

/**
 * A mathematical equation in TeX, in a line of text or a block of its own.
 * It draws its own DOM: MathML from KaTeX once KaTeX has loaded, the TeX
 * until then (and wherever KaTeX is not installed), so it renders the
 * same on a server. Saved as `<span data-tei-equation data-tex>` (or a
 * `<div>` for a block) round that, which reads back exactly.
 */
export class EquationNode extends DecoratorNode<null> {
  __equation = '';
  __inline = false;

  $config() {
    return this.config('equation', { extends: DecoratorNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__equation = prev.__equation;
    this.__inline = prev.__inline;
  }

  getEquation(): string {
    return this.getLatest().__equation;
  }

  /** New TeX; anything not a string, or too long, is refused and the old one kept. */
  setEquation(equation: string): this {
    const self = this.getWritable();
    const tex = cleanTeX(equation);
    if (tex !== null) self.__equation = tex;
    return self;
  }

  isInline(): boolean {
    return this.getLatest().__inline;
  }

  setInline(inline: boolean): this {
    const self = this.getWritable();
    self.__inline = inline === true;
    return self;
  }

  // -- JSON ------------------------------------------------------------------

  updateFromJSON(json: LexicalUpdateJSON<SerializedEquationNode>): this {
    const self = super.updateFromJSON(json);
    const data = json as Partial<SerializedEquationNode>;
    if (typeof data.equation === 'string') self.setEquation(data.equation);
    return self.setInline(data.inline === true);
  }

  exportJSON(): SerializedEquationNode {
    return { ...super.exportJSON(), equation: this.getEquation(), inline: this.isInline() };
  }

  // -- DOM -------------------------------------------------------------------

  createDOM(config: EditorConfig): HTMLElement {
    const el = $getDocument().createElement(this.__inline ? 'span' : 'div');
    el.className = (config.theme.equation as string | undefined) ?? 'tei-equation';
    el.setAttribute('contenteditable', 'false');
    el.setAttribute('data-tei-equation', this.__inline ? 'inline' : 'block');
    el.setAttribute('role', 'math');
    paintEquation(el, this.__equation, !this.__inline, katexNow($katexSource()));
    return el;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (prev.__inline !== this.__inline) return true;
    if (prev.__equation !== this.__equation) {
      paintEquation(dom, this.__equation, !this.__inline, katexNow($katexSource()));
    }
    return false;
  }

  /**
   * `<span data-tei-equation data-tex>` (`<div>` for a block): MathML in it
   * when KaTeX is at hand, the TeX in a `<code>` when not. Either way
   * `data-tex` holds the TeX, which is what reads back.
   */
  exportDOM(): DOMExportOutput {
    const el = $getDocument().createElement(this.isInline() ? 'span' : 'div');
    el.setAttribute('data-tei-equation', this.isInline() ? 'inline' : 'block');
    el.setAttribute('data-tex', this.getEquation());
    const error = paintMath(el, katexNow($katexSource()), this.getEquation(), !this.isInline());
    if (!el.querySelector('math')) {
      el.setAttribute('role', 'math');
      el.setAttribute('aria-label', this.getEquation());
    }
    if (error) el.removeAttribute('title');
    return { element: el };
  }

  decorate(): null {
    return null;
  }

  getTextContent(): string {
    return this.getEquation();
  }
}

/**
 * The editor's view of an equation: its rendering, its TeX for screen
 * readers (MathML is read where the reader supports it; the label is the
 * fallback), and `data-empty` while it has none.
 */
export function paintEquation(
  el: HTMLElement,
  tex: string,
  display: boolean,
  katex: ReturnType<typeof katexNow>,
): void {
  paintMath(el, katex, tex, display);
  el.setAttribute('data-tex', tex);
  el.toggleAttribute('data-empty', tex === '');
  el.toggleAttribute('data-rendered', el.querySelector('math') !== null);
  if (tex) el.setAttribute('aria-label', tex);
  else el.removeAttribute('aria-label');
}

export function $createEquationNode(equation = '', inline = false): EquationNode {
  return $create(EquationNode).setEquation(equation).setInline(inline);
}

export function $isEquationNode(node: LexicalNode | null | undefined): node is EquationNode {
  return node instanceof EquationNode;
}
