import {
  $getHtmlContent,
  $getLexicalContent,
  $insertDataTransferForRichText,
} from '@lexical/clipboard';
import { $dfs } from '@lexical/utils';
import katex from 'katex';
import {
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  KEY_ENTER_COMMAND,
  type TextNode,
} from 'lexical';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { $selectNode } from '../../src/core/slot-host.js';
import { holdUi } from '../../src/core/ui-request.js';
import {
  $getEquation,
  $isEquationNode,
  cleanTeX,
  Equation,
  type EquationOptions,
  type EquationStorage,
  type KatexLike,
  MAX_EQUATION_LENGTH,
  sanitizeMath,
} from '../../src/extensions/equation/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

// jsdom gives MathML elements no `style` (browsers and happy-dom do), and
// Lexical's check for a VS Code paste reads it on every element.
beforeAll(() => {
  const math = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'math');
  if (!('style' in math)) {
    Object.defineProperty(Element.prototype, 'style', {
      configurable: true,
      get() {
        return document.createElement('span').style;
      },
    });
  }
});

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(
  content: string | object = '<p>Hi</p>',
  { markdown = false, options = { katex: null } as Partial<EquationOptions>, mount = true } = {},
) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Equation.configure(options)],
    content,
    contentFormat: markdown ? 'markdown' : undefined,
  });
  editors.push(editor);
  if (mount) {
    const root = document.createElement('div');
    root.contentEditable = 'true';
    document.body.append(root);
    editor.lexical.setRootElement(root);
  }
  return editor;
}

const equations = (editor: TeiEditor) =>
  editor.read(() =>
    $dfs()
      .map(({ node }) => node)
      .filter($isEquationNode)
      .map((n) => ({ key: n.getKey(), equation: n.getEquation(), inline: n.isInline() })),
  );
const storage = (editor: TeiEditor) =>
  editor.extension(Equation)?.output.storage as EquationStorage;
const caret = (editor: TeiEditor, text: string, offset = text.length) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text) as TextNode;
    node.select(offset, offset);
  });
const type = (editor: TeiEditor, text: string) => {
  for (const char of text) {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(char);
    });
  }
};
const select = (editor: TeiEditor, key: string) =>
  editor.update(() => {
    const node = $getEquation(key);
    if (node) $selectNode(node);
  });

const INLINE_JSON = (equation: unknown, inline: unknown = true) => ({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        textFormat: 0,
        textStyle: '',
        children: [
          {
            type: 'text',
            version: 1,
            text: 'E = ',
            format: 0,
            mode: 'normal',
            style: '',
            detail: 0,
          },
          { type: 'equation', version: 1, equation, inline },
        ],
      },
    ],
  },
});

describe('Equation: the node', () => {
  it('keeps TeX and inline in JSON, as Lexical’s playground writes them', () => {
    const editor = make(INLINE_JSON('mc^2'));
    expect(equations(editor)).toMatchObject([{ equation: 'mc^2', inline: true }]);
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"equation"');
    expect(json).toContain('"equation":"mc^2","inline":true');
    const again = make(JSON.parse(json));
    expect(equations(again)).toMatchObject([{ equation: 'mc^2', inline: true }]);
  });

  it('reads malformed JSON safely: no string is no TeX, anything but true is a block', () => {
    const editor = make(INLINE_JSON(42, 'yes'));
    expect(equations(editor)).toMatchObject([{ equation: '', inline: false }]);
    // A block lifts out of the paragraph it was saved in.
    expect(
      editor.read(() =>
        $getRoot()
          .getChildren()
          .map((n) => n.getType()),
      ),
    ).toEqual(['paragraph', 'equation']);
  });

  it('refuses TeX that is too long, and strips control characters', () => {
    expect(cleanTeX('a\u0000b\u0007c\nd')).toBe('abc\nd');
    expect(cleanTeX('x'.repeat(MAX_EQUATION_LENGTH))).toHaveLength(MAX_EQUATION_LENGTH);
    expect(cleanTeX('x'.repeat(MAX_EQUATION_LENGTH + 1))).toBeNull();
    expect(cleanTeX(null)).toBeNull();
    const editor = make(INLINE_JSON('x'.repeat(MAX_EQUATION_LENGTH + 1)));
    expect(equations(editor)[0]?.equation).toBe('');
  });

  it('draws its TeX in a <code> without KaTeX, labelled for screen readers', () => {
    make(INLINE_JSON('a^2'));
    const el = document.querySelector('[data-tei-equation]') as HTMLElement;
    expect(el.tagName).toBe('SPAN');
    expect(el.getAttribute('data-tei-equation')).toBe('inline');
    expect(el.getAttribute('role')).toBe('math');
    expect(el.getAttribute('aria-label')).toBe('a^2');
    expect(el.getAttribute('contenteditable')).toBe('false');
    expect(el.innerHTML).toBe('<code>a^2</code>');
  });

  it('an empty one shows the placeholder, in the editor’s words', () => {
    const editor = make('<p>Hi</p>');
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertEquation({ equation: '', inline: true, edit: false });
    const el = document.querySelector('[data-tei-equation]') as HTMLElement;
    expect(el.hasAttribute('data-empty')).toBe(true);
    expect(el.getAttribute('data-placeholder')).toBe('New equation');
    expect(el.getAttribute('aria-label')).toBe('New equation');
  });
});

describe('Equation: KaTeX', () => {
  it('renders MathML at once when given the module, with no style attribute', () => {
    make(INLINE_JSON('\\frac{a}{b}'), { options: { katex } });
    const el = document.querySelector('[data-tei-equation]') as HTMLElement;
    expect(el.hasAttribute('data-rendered')).toBe(true);
    expect(el.querySelector('math')).not.toBeNull();
    expect(el.querySelector('mfrac')).not.toBeNull();
    expect(el.innerHTML).not.toContain('style=');
    expect(el.querySelector('annotation')?.textContent).toBe('\\frac{a}{b}');
  });

  it('loads KaTeX once an equation is in the page, and draws every one again', async () => {
    let loads = 0;
    const loader = async () => {
      loads++;
      return { default: katex as unknown as KatexLike };
    };
    // The loader is the only way it can come; another test may have loaded the module.
    make(INLINE_JSON('x'), { options: { katex: loader } });
    await vi.waitFor(() => expect(document.querySelector('math')).not.toBeNull());
    expect(loads).toBe(1);
  });

  it('does not load KaTeX without equations, or without a page', async () => {
    const loader = vi.fn(async () => katex as unknown as KatexLike);
    make('<p>Plain</p>', { options: { katex: loader } });
    make(INLINE_JSON('x'), { options: { katex: loader }, mount: false });
    await Promise.resolve();
    expect(loader).not.toHaveBeenCalled();
  });

  it('shows a mistake as the TeX, marked, with KaTeX’s complaint', () => {
    make(INLINE_JSON('\\frac{a'), { options: { katex } });
    const el = document.querySelector('[data-tei-equation]') as HTMLElement;
    expect(el.hasAttribute('data-error')).toBe(true);
    expect(el.getAttribute('title')).toMatch(/Expected|Unexpected end/);
    expect(el.querySelector('code')?.textContent).toBe('\\frac{a');
    expect(el.querySelector('math')).toBeNull();
  });

  it('runs untrusted: no \\href, \\url or \\htmlStyle reaches the page', () => {
    const editor = make(INLINE_JSON('x'), { options: { katex } });
    for (const tex of [
      '\\href{javascript:alert(1)}{x}',
      '\\url{javascript:alert(1)}',
      '\\htmlStyle{color:red}{x}',
      '\\htmlClass{evil}{x}',
      '\\includegraphics{https://evil.test/a.png}',
    ]) {
      editor.commands.setEquation(tex, equations(editor)[0]?.key);
      const out = document.createElement('div');
      out.innerHTML = editor.getHTML();
      // The TeX is kept as text (data-tex, the annotation); nothing of it acts.
      expect(out.querySelector('[href], [style], [src], a, img, .evil')).toBeNull();
      expect(
        document.querySelector('[data-tei-equation] :is([href], [style], [src], a, img)'),
      ).toBeNull();
    }
  });

  it('bounds expansion: a macro bomb is an error, not a hang', () => {
    const editor = make(INLINE_JSON('x'), { options: { katex } });
    const started = Date.now();
    editor.commands.setEquation(
      '\\def\\a{\\b\\b}\\def\\b{\\c\\c}\\def\\c{\\d\\d}\\def\\d{xx}\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a',
      equations(editor)[0]?.key,
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(document.querySelector('[data-tei-equation]')?.hasAttribute('data-error')).toBe(true);
  });

  it('keeps only MathML from whatever a renderer gives', () => {
    const box = document.createElement('span');
    box.innerHTML =
      '<span class="katex" style="color:red" onclick="x()"><math xmlns="http://www.w3.org/1998/Math/MathML" href="javascript:alert(1)" style="x" display="block">' +
      '<mi onmouseover="x()" mathcolor="red">a</mi><a href="javascript:alert(1)">b</a>' +
      '<img src=x onerror="alert(1)"><mtext><script>alert(1)</script>c</mtext></math></span>';
    sanitizeMath(box);
    const html = box.innerHTML;
    expect(html).not.toMatch(/style=|onclick|onmouseover|onerror|href|<a|<img|<script/);
    expect(html).toContain('display="block"');
    expect(html).toContain('mathcolor="red"');
    expect(box.textContent).toBe('abalert(1)c');
  });

  it('asks KaTeX for MathML only, untrusted, bounded, throwing on mistakes', () => {
    const seen: Record<string, unknown>[] = [];
    const spy: KatexLike = {
      render: (tex, el, options) => {
        seen.push(options ?? {});
        katex.render(tex, el, options);
      },
    };
    make(INLINE_JSON('x'), { options: { katex: spy } });
    expect(seen[0]).toMatchObject({
      output: 'mathml',
      trust: false,
      throwOnError: true,
      displayMode: false,
      globalGroup: false,
    });
    expect(seen[0]?.maxExpand).toBeLessThanOrEqual(1000);
    expect(seen[0]?.maxSize).toBeLessThanOrEqual(20);
  });

  it('a hostile renderer cannot put script in the page', () => {
    const evil: KatexLike = {
      render: (_tex, el) => {
        el.innerHTML =
          '<span class="katex"><math><mi href="javascript:alert(1)" onclick="x()">x</mi></math>' +
          '<iframe src="javascript:alert(1)"></iframe></span>';
      },
    };
    const editor = make(INLINE_JSON('x'), { options: { katex: evil } });
    expect(document.body.innerHTML).not.toMatch(/href|onclick|iframe/);
    expect(editor.getHTML()).not.toMatch(/href|onclick|iframe/);
  });
});

describe('Equation: HTML', () => {
  it('saves the TeX in data-tex and a <code> without KaTeX, and reads it back', () => {
    const editor = make(INLINE_JSON('x < y & "z"'));
    const html = editor.getHTML();
    expect(html).toBe(
      '<p>E = <span data-tei-equation="inline" data-tex="x < y &amp; &quot;z&quot;" role="math" aria-label="x < y &amp; &quot;z&quot;"><code>x &lt; y &amp; "z"</code></span></p>',
    );
    expect(equations(make(html))).toMatchObject([{ equation: 'x < y & "z"', inline: true }]);
  });

  it('saves MathML with KaTeX, which needs no stylesheet, and reads it back exactly', () => {
    const editor = make('<p>a</p>', { options: { katex } });
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertEquation({ equation: '\\sum_{i=1}^n i', inline: false, edit: false });
    const html = editor.getHTML();
    expect(html).toContain('<div data-tei-equation="block" data-tex="\\sum_{i=1}^n i">');
    expect(html).toContain('<math');
    expect(html).toContain('display="block"');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('role="math"');
    const again = make(html, { options: { katex } });
    expect(equations(again)).toMatchObject([{ equation: '\\sum_{i=1}^n i', inline: false }]);
    expect(again.getHTML()).toBe(html);
  });

  it('reads Lexical’s data-lexical-equation (UTF-8 base64)', () => {
    const tex = '\\text{α} + 😀';
    const bytes = new TextEncoder().encode(tex);
    const encoded = btoa(String.fromCharCode(...bytes));
    const editor = make(
      `<p>a <span data-lexical-equation="${encoded}" data-lexical-inline="true">x</span></p>` +
        `<div data-lexical-equation="${btoa('y^2')}" data-lexical-inline="false"></div>`,
    );
    expect(equations(editor)).toMatchObject([
      { equation: tex, inline: true },
      { equation: 'y^2', inline: false },
    ]);
  });

  it('reads KaTeX markup and MathML from other pages by their TeX', () => {
    const rendered = katex.renderToString('a+b', { output: 'htmlAndMathml' });
    const display = katex.renderToString('c', { output: 'htmlAndMathml', displayMode: true });
    const editor = make(
      `<p>see ${rendered} and <math alttext="{\\displaystyle x_1}"><mi>x</mi></math></p>${display}`,
    );
    expect(equations(editor)).toMatchObject([
      { equation: 'a+b', inline: true },
      { equation: 'x_1', inline: true },
      { equation: 'c', inline: false },
    ]);
    // No stray text from KaTeX's HTML half.
    expect(editor.getText()).not.toContain('a+ba+b');
  });

  it('leaves MathML that does not say its TeX as text', () => {
    const editor = make('<p><math><mi>q</mi></math></p>');
    expect(equations(editor)).toEqual([]);
    expect(editor.getText()).toBe('q');
  });
});

describe('Equation: Markdown', () => {
  it('reads $…$ in a line and $$…$$ as a block, and writes them back', () => {
    const md = 'Energy $E = mc^2$ here.\n\n$$\\int_0^1 x\\,dx$$\n\n$$\na \\\\\nb\n$$';
    const editor = make(md, { markdown: true });
    expect(equations(editor)).toMatchObject([
      { equation: 'E = mc^2', inline: true },
      { equation: '\\int_0^1 x\\,dx', inline: false },
      { equation: 'a \\\\\nb', inline: false },
    ]);
    expect(editor.getMarkdown()).toBe(md);
  });

  it('leaves money alone', () => {
    const editor = make('It costs $5 and $10, or $ 3 $, from $10 to$20.', { markdown: true });
    expect(equations(editor)).toEqual([]);
    expect(editor.getMarkdown()).toBe('It costs $5 and $10, or $ 3 $, from $10 to$20.');
  });

  it('keeps an escaped dollar in the TeX', () => {
    const editor = make('Price $\\$5$ now', { markdown: true });
    expect(equations(editor)).toMatchObject([{ equation: '\\$5', inline: true }]);
  });

  it('an unclosed $$ stays text', () => {
    const editor = make('$$\na\nb', { markdown: true });
    expect(equations(editor)).toEqual([]);
  });

  it('typing $x$ makes an inline equation; $$x$$ alone on a line, a block', () => {
    const editor = make('<p>Say</p>');
    caret(editor, 'Say');
    type(editor, ' $x^2$');
    expect(equations(editor)).toMatchObject([{ equation: 'x^2', inline: true }]);
    const block = make('<p></p>');
    block.update(() => $getRoot().selectEnd());
    type(block, '$$a+b$$');
    expect(equations(block)).toMatchObject([{ equation: 'a+b', inline: false }]);
  });
});

describe('Equation: commands', () => {
  it('insertEquation: in the line where there is text, a block on an empty line', () => {
    const editor = make('<p>Hi</p><p></p>');
    caret(editor, 'Hi');
    expect(editor.can().insertEquation()).toBe(true);
    editor.commands.insertEquation({ equation: 'a' });
    editor.update(() => $getRoot().getLastChild()?.selectEnd());
    editor.commands.insertEquation({ equation: 'b' });
    expect(equations(editor)).toMatchObject([
      { equation: 'a', inline: true },
      { equation: 'b', inline: false },
    ]);
    // The caret goes on after each.
    expect(editor.read(() => $isRangeSelection($getSelection()))).toBe(true);
  });

  it('turns the selected text into the TeX', () => {
    const editor = make('<p>let x^2 be</p>');
    editor.update(() => {
      const text = $getRoot().getAllTextNodes()[0] as TextNode;
      text.select(4, 7);
    });
    editor.commands.insertEquation();
    expect(equations(editor)).toMatchObject([{ equation: 'x^2', inline: true }]);
    expect(editor.getText()).toBe('let x^2 be');
  });

  it('refuses TeX over maxLength', () => {
    const editor = make('<p>Hi</p>', { options: { katex: null, maxLength: 5 } });
    caret(editor, 'Hi');
    expect(editor.can().insertEquation({ equation: '123456' })).toBe(false);
    expect(editor.commands.insertEquation({ equation: '123456' })).toBe(false);
    editor.commands.insertEquation({ equation: '12345' });
    const [eq] = equations(editor);
    expect(editor.commands.setEquation('abcdef', eq?.key)).toBe(false);
    expect(equations(editor)[0]?.equation).toBe('12345');
  });

  it('opens the editor on a new empty one, where there is a UI', () => {
    const editor = make('<p></p>');
    editor.update(() => $getRoot().selectEnd());
    // No UI: it goes in, nothing opens.
    editor.commands.insertEquation({ inline: false });
    expect(storage(editor).editFor.peek()).toBeNull();
    holdUi(storage(editor).editor);
    let requests = 0;
    storage(editor).editor.requests.subscribe(() => requests++);
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertEquation({ inline: true });
    const fresh = equations(editor).at(-1);
    expect(storage(editor).editFor.peek()).toBe(fresh?.key);
    expect(requests).toBe(2);
    expect(editor.isActive('equation')).toBe(true);
  });

  it('a click, or Enter with it selected, opens the editor', () => {
    const editor = make(INLINE_JSON('x'));
    const ui = storage(editor);
    holdUi(ui.editor);
    const key = equations(editor)[0]?.key as string;
    (document.querySelector('[data-tei-equation]') as HTMLElement).click();
    expect(ui.editFor.peek()).toBe(key);
    ui.editFor.value = null;
    select(editor, key);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    editor.lexical.dispatchCommand(KEY_ENTER_COMMAND, enter);
    expect(ui.editFor.peek()).toBe(key);
    expect(enter.defaultPrevented).toBe(true);
  });

  it('no UI: openEquationEditor cannot run', () => {
    const editor = make(INLINE_JSON('x'));
    select(editor, equations(editor)[0]?.key as string);
    expect(editor.can().openEquationEditor()).toBe(false);
    expect(editor.commands.openEquationEditor()).toBe(false);
  });

  it('setEquationInline moves it between the line and a block of its own', () => {
    const editor = make(INLINE_JSON('x'));
    const key = equations(editor)[0]?.key as string;
    editor.commands.setEquationInline(false, key);
    expect(
      editor.read(() =>
        $getRoot()
          .getChildren()
          .map((n) => n.getType()),
      ),
    ).toEqual(['paragraph', 'equation']);
    expect(editor.isActive('equationInline')).toBe(false);
    editor.commands.setEquationInline(undefined, key);
    expect(equations(editor)[0]?.inline).toBe(true);
    // In a line of its own, a paragraph round it.
    expect(
      editor.read(() => {
        const parent = $getEquation(key)?.getParent();
        return $isParagraphNode(parent);
      }),
    ).toBe(true);
    expect(editor.isActive('equationInline')).toBe(true);
  });

  it('removeEquation, and undo brings it back', () => {
    const editor = make('<p>Hi</p>');
    caret(editor, 'Hi');
    editor.commands.insertEquation({ equation: 'z', edit: false });
    const key = equations(editor)[0]?.key as string;
    editor.commands.removeEquation(key);
    expect(equations(editor)).toEqual([]);
    editor.commands.undo();
    expect(equations(editor)).toMatchObject([{ equation: 'z' }]);
    editor.commands.undo();
    expect(equations(editor)).toEqual([]);
  });

  it('setEquation is one undo step', () => {
    const editor = make(INLINE_JSON('a'));
    const key = equations(editor)[0]?.key as string;
    editor.commands.setEquation('b', key);
    expect(document.querySelector('[data-tei-equation]')?.textContent).toBe('b');
    editor.commands.undo();
    expect(equations(editor)[0]?.equation).toBe('a');
  });

  it('copies and pastes: Lexical’s own data, and HTML from elsewhere', () => {
    const editor = make(INLINE_JSON('\\alpha'));
    select(editor, equations(editor)[0]?.key as string);
    const copied = editor.read(() => ({
      lexical: $getLexicalContent(editor.lexical),
      html: $getHtmlContent(editor.lexical),
      text: $getSelection()?.getTextContent(),
    }));
    expect(copied.text).toBe('\\alpha');
    expect(copied.html).toContain('data-tex="\\alpha"');
    const paste = (types: Record<string, string>) => {
      const target = make('<p>x</p>');
      target.update(() => $getRoot().selectEnd());
      const data = { getData: (type: string) => types[type] ?? '', types: Object.keys(types) };
      target.lexical.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection))
            $insertDataTransferForRichText(
              data as unknown as DataTransfer,
              selection,
              target.lexical,
            );
        },
        { discrete: true },
      );
      return target;
    };
    expect(
      equations(paste({ 'application/x-lexical-editor': copied.lexical ?? '' })),
    ).toMatchObject([{ equation: '\\alpha', inline: true }]);
    expect(equations(paste({ 'text/html': copied.html }))).toMatchObject([
      { equation: '\\alpha', inline: true },
    ]);
  });
});
