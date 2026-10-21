import { $isLinkNode } from '@lexical/link';
import {
  $createTextNode,
  $getRoot,
  type ElementNode,
  KEY_DOWN_COMMAND,
  type LexicalNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanExportedHTML, Html } from '../../src/extensions/html/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor, type TeiEditorOptions } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function make(content?: string, options: Partial<TeiEditorOptions> = {}): TeiEditor {
  const editor = createTeiEditor({ extensions: [StarterKit], content, ...options });
  editors.push(editor);
  // A root element, so DOM-dependent behaviour (placeholders, keys) is real.
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/** Select the whole text of the n-th top-level block. */
function selectBlock(editor: TeiEditor, index = 0) {
  editor.update(() => {
    const block = $getRoot().getChildAtIndex(index) as ElementNode;
    block.select(0, block.getChildrenSize());
  });
}

function selectText(editor: TeiEditor, index: number, from: number, to: number) {
  editor.update(() => {
    const block = $getRoot().getChildAtIndex(index) as ElementNode;
    const text = block.getFirstDescendant();
    if (text && 'select' in text)
      (text as unknown as { select(a: number, b: number): void }).select(from, to);
  });
}

function caretIn(editor: TeiEditor, index = 0) {
  editor.update(() => ($getRoot().getChildAtIndex(index) as ElementNode).selectEnd());
}

const types = (editor: TeiEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .map((n: LexicalNode) => n.getType()),
  );

function press(editor: TeiEditor, key: string, mods: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
  editor.lexical.update(() => editor.lexical.dispatchCommand(KEY_DOWN_COMMAND, event), {
    discrete: true,
  });
  return event;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform ?? '');
const MOD = isMac ? { metaKey: true } : { ctrlKey: true };

describe('formatting marks', () => {
  it('toggles, sets and unsets, with active state and can()', () => {
    const editor = make('<p>Hello world</p>');
    expect(editor.can().toggleBold()).toBe(true);
    selectText(editor, 0, 0, 5);
    editor.commands.toggleBold();
    expect(editor.isActive('bold')).toBe(true);
    editor.commands.setBold();
    expect(editor.isActive('bold')).toBe(true);
    editor.commands.unsetBold();
    expect(editor.isActive('bold')).toBe(false);
    editor.chain().toggleItalic().toggleUnderline().toggleStrike().run();
    expect(['italic', 'underline', 'strike'].map((n) => editor.isActive(n as 'italic'))).toEqual([
      true,
      true,
      true,
    ]);
    const html = editor.getHTML();
    expect(html).toMatch(/^<p>(<(em|s|u)>){3}Hello(<\/(em|s|u)>){3} world<\/p>$/);
    expect(html).not.toContain('tei-');
  });

  it('clears formatting on the selection only', () => {
    const editor = make('<p><strong>Bold</strong> <em>and</em> plain</p>');
    selectBlock(editor);
    editor.commands.clearFormatting();
    expect(editor.getHTML()).toBe('<p>Bold and plain</p>');
  });

  it('formats through the keyboard, by the keymap', () => {
    const editor = make('<p>Hello</p>');
    selectBlock(editor);
    const event = press(editor, 'b', MOD);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.isActive('bold')).toBe(true);
  });

  it('lets the app remap or disable a key', () => {
    const editor = make('<p>Hello</p>', {
      keymap: { bold: null, italic: { key: 'Mod-b', command: 'toggleItalic' } },
    });
    selectBlock(editor);
    press(editor, 'b', MOD);
    expect(editor.isActive('bold')).toBe(false);
    expect(editor.isActive('italic')).toBe(true);
  });
});

describe('blocks', () => {
  it('sets and toggles headings, refusing levels that are not offered', () => {
    const editor = make('<p>Title</p>');
    caretIn(editor);
    editor.commands.setHeading(2);
    expect(editor.isActive('heading', 2)).toBe(true);
    expect(editor.isActive('heading')).toBe(true);
    editor.commands.toggleHeading(2);
    expect(editor.isActive('paragraph')).toBe(true);

    const limited = make('<p>Title</p>', {
      extensions: [StarterKit.configure({ heading: { levels: [1, 2] } })],
    });
    caretIn(limited);
    expect(limited.can().setHeading(3)).toBe(false);
    expect(limited.commands.setHeading(3)).toBe(false);
    expect(limited.items('blockType').map((i) => i.id)).not.toContain('heading3');
    expect(limited.items('blockType').map((i) => i.id)).toContain('heading2');
  });

  it('turns blocks into quotes and back', () => {
    const editor = make('<p>Wise words</p>');
    caretIn(editor);
    editor.commands.toggleBlockquote();
    expect(types(editor)).toEqual(['quote']);
    editor.commands.toggleBlockquote();
    expect(types(editor)).toEqual(['paragraph']);
  });

  it('toggles the three kinds of list, and indents items', () => {
    const editor = make('<p>One</p>');
    selectBlock(editor, 0);
    editor.commands.toggleBulletList();
    expect(editor.isActive('bulletList')).toBe(true);
    expect(editor.isActive('list')).toBe(true);
    editor.commands.toggleOrderedList();
    expect(editor.isActive('orderedList')).toBe(true);
    expect(editor.isActive('bulletList')).toBe(false);
    editor.commands.toggleCheckList();
    expect(editor.isActive('checkList')).toBe(true);
    editor.commands.toggleCheckList();
    expect(editor.isActive('list')).toBe(false);
  });

  it('nests a list item with Tab and lifts it with Shift-Tab', () => {
    const editor = make('<ul><li>One</li><li>Two</li></ul>');
    editor.update(() => {
      const list = $getRoot().getFirstChild() as ElementNode;
      (list.getLastChild() as ElementNode).selectEnd();
    });
    const nested = '<ul><li>One<ul><li>Two</li></ul></li></ul>';
    press(editor, 'Tab');
    expect(editor.getHTML()).toBe(nested);
    press(editor, 'Tab', { shiftKey: true });
    expect(editor.getHTML()).toBe('<ul><li>One</li><li>Two</li></ul>');
  });

  it('makes code blocks from blocks and back, keeping lines', () => {
    const editor = make('<p>const a = 1;</p>');
    caretIn(editor);
    editor.commands.toggleCodeBlock();
    expect(types(editor)).toEqual(['code']);
    expect(editor.isActive('codeBlock')).toBe(true);
    editor.commands.setCodeLanguage('python');
    expect(editor.isActive('codeBlock', 'python')).toBe(true);
    editor.commands.toggleCodeBlock();
    expect(types(editor)).toEqual(['paragraph']);
    expect(editor.getText()).toBe('const a = 1;');
  });

  it('inserts a divider', () => {
    const editor = make('<p>Above</p>');
    caretIn(editor);
    editor.commands.insertHorizontalRule();
    expect(types(editor)).toContain('horizontalrule');
  });

  it('aligns and indents blocks', () => {
    const editor = make('<p>Text</p>');
    caretIn(editor);
    expect(editor.isActive('textAlign', 'left')).toBe(true);
    editor.commands.setTextAlign('center');
    expect(editor.isActive('textAlign', 'center')).toBe(true);
    expect(editor.getHTML()).toContain('text-align: center');
    editor.commands.unsetTextAlign();
    expect(editor.isActive('textAlign', 'center')).toBe(false);
    expect(editor.can().outdent()).toBe(false);
    editor.commands.indent();
    expect(editor.can().outdent()).toBe(true);
  });
});

describe('links', () => {
  it('links the selection, normalising a bare host, and removes it', () => {
    const editor = make('<p>Go here</p>');
    selectText(editor, 0, 3, 7);
    expect(editor.commands.setLink('example.com')).toBe(true);
    expect(editor.getHTML()).toBe(
      '<p>Go <a href="https://example.com" rel="noopener noreferrer">here</a></p>',
    );
    editor.update(() => ($getRoot().getFirstChild() as ElementNode).selectEnd());
    expect(editor.isActive('link')).toBe(true);
    editor.commands.unsetLink();
    expect(editor.getHTML()).toBe('<p>Go here</p>');
  });

  it('refuses script URLs from a command, from HTML and from JSON', () => {
    const editor = make('<p>x</p>');
    selectBlock(editor);
    expect(editor.commands.setLink('javascript:alert(1)')).toBe(false);
    expect(editor.commands.setLink(' JaVa\tScRiPt:alert(1)')).toBe(false);

    editor.setContent(
      '<p><a href="javascript:alert(1)">bad</a> <a href="https://ok.example">ok</a></p>',
    );
    expect(editor.getHTML()).toBe('<p>bad <a href="https://ok.example">ok</a></p>');

    const json = editor.getJSON() as unknown as {
      root: { children: Array<{ children: Array<Record<string, unknown>> }> };
    };
    const good = json.root.children[0]?.children.find((c) => c.type === 'link');
    if (good) good.url = 'javascript:alert(2)';
    editor.setContent(json);
    const links = editor.read(() =>
      $getRoot()
        .getAllTextNodes()
        .map((t) => t.getParent())
        .filter($isLinkNode),
    );
    expect(links).toHaveLength(0);
  });

  it('inserts a link with its own text at a collapsed caret, and edits a link in place', () => {
    const editor = make('See ', { contentFormat: 'text' });
    caretIn(editor);
    editor.commands.setLink({ url: 'https://a.example', text: 'docs' });
    expect(editor.getText()).toBe('See docs');
    editor.update(() => ($getRoot().getFirstChild() as ElementNode).selectEnd());
    editor.commands.setLink('https://b.example');
    expect(editor.getHTML()).toContain('href="https://b.example"');
  });

  it('opens the link UI only when one is mounted', () => {
    const editor = make('<p>x</p>');
    selectBlock(editor);
    expect(editor.commands.openLinkEditor()).toBe(false);
  });
});

describe('history', () => {
  it('undoes and redoes, with can()', () => {
    const editor = make('<p>a</p>');
    expect(editor.can().undo()).toBe(false);
    caretIn(editor);
    editor.update(() => {
      ($getRoot().getFirstChild() as ElementNode).append($createTextNode('b'));
    });
    expect(editor.getText()).toBe('ab');
    expect(editor.can().undo()).toBe(true);
    editor.commands.undo();
    expect(editor.getText()).toBe('a');
    expect(editor.can().redo()).toBe(true);
    editor.commands.redo();
    expect(editor.getText()).toBe('ab');
  });
});

describe('clipboard and strict-CSP HTML', () => {
  it('drops the break browsers end a copied block with', () => {
    const editor = make('<p>a</p><br class="Apple-interchange-newline">');
    expect(editor.getHTML()).toBe('<p>a</p>');
  });

  it("undoes WebKit's copy artefacts: start alignment and converted spaces", () => {
    const editor = make(
      '<p style="text-align: start;">See<span class="Apple-converted-space">\u00a0</span><b>bold</b>\u00a0text</p><p style="text-align: center">mid</p>',
    );
    expect(editor.getHTML()).toBe(
      '<p>See <strong>bold</strong> text</p><p style="text-align: center;">mid</p>',
    );
  });

  it('keeps NBSP runs and code as written', () => {
    const editor = make('<p>a\u00a0\u00a0b</p>');
    expect(editor.getText()).toBe('a\u00a0\u00a0b');
  });

  it('cleans export by the style attribute, not the CSSOM a strict CSP leaves empty', () => {
    const container = document.createElement('div');
    const span = document.createElement('span');
    span.setAttribute('style', 'color: red; white-space: pre-wrap;');
    span.textContent = 'x';
    container.append(span);
    // Chromium under style-src 'self': the attribute is kept, the CSSOM reads empty.
    Object.defineProperty(span, 'style', { value: document.createElement('i').style });
    cleanExportedHTML(container);
    expect(container.innerHTML).toBe('<span style="color: red;">x</span>');
  });
});

describe('HTML a page can use as it is', () => {
  it('writes code as <pre><code class="language-x"> with real newlines', () => {
    const editor = make('<pre data-language="ts">let a = 1;<br>let  b = 2;</pre>');
    expect(editor.getHTML()).toBe(
      '<pre data-language="ts"><code class="language-ts">let a = 1;\nlet  b = 2;</code></pre>',
    );
  });

  it('reads the language from a class, as GitHub and Markdown renderers write it', () => {
    for (const html of [
      '<pre><code class="language-python">x = 1</code></pre>',
      '<pre class="language-python"><code>x = 1</code></pre>',
      '<pre><code class="hljs lang-python">x = 1</code></pre>',
    ]) {
      const editor = make(html);
      expect(editor.getMarkdown()).toBe('```python\nx = 1\n```');
    }
  });

  it('keeps a code block without a language plain', () => {
    const editor = make('<pre><code>a\nb</code></pre>');
    expect(editor.getHTML()).toBe('<pre><code>a\nb</code></pre>');
    expect(editor.getMarkdown()).toBe('```\na\nb\n```');
  });

  it('numbers list items only where the number says something', () => {
    expect(make('<ol start="3"><li>x</li><li>y</li></ol>').getHTML()).toBe(
      '<ol start="3"><li>x</li><li>y</li></ol>',
    );
    expect(make('<ul><li>a</li><li>b</li></ul>').getHTML()).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('writes check lists as task lists: a disabled checkbox, no widget roles', () => {
    const editor = make(
      '<ul data-lexical-list-type="check"><li aria-checked="true">Done</li>' +
        '<li aria-checked="false">To do<ul data-lexical-list-type="check"><li aria-checked="false">Sub</li></ul></li></ul>',
    );
    const html = editor.getHTML();
    expect(html).toBe(
      '<ul class="contains-task-list">' +
        '<li class="task-list-item"><input type="checkbox" disabled="" checked="">Done</li>' +
        '<li class="task-list-item"><input type="checkbox" disabled="">To do' +
        '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled="">Sub</li></ul>' +
        '</li></ul>',
    );
    expect(html).not.toMatch(/role=|tabindex|aria-checked|__lexical/);
    // A first item indented on its own sits in an item with no box of its own.
    expect(
      make(
        '<ul data-lexical-list-type="check"><li aria-checked="false"><ul data-lexical-list-type="check">' +
          '<li aria-checked="true">Deep</li></ul></li></ul>',
      ).getHTML(),
    ).toBe(
      '<ul class="contains-task-list"><li><ul class="contains-task-list">' +
        '<li class="task-list-item"><input type="checkbox" disabled="" checked="">Deep</li></ul></li></ul>',
    );
    // And reads back as the same check list.
    expect(make(html).getJSON()).toEqual(editor.getJSON());
  });

  it('reads back what it wrote, unchanged', () => {
    const html =
      '<h2>T</h2><ol><li>a<ol><li>b</li></ol></li><li>c</li></ol>' +
      '<pre data-language="ts"><code class="language-ts">x\n  y</code></pre><p>end</p>';
    const once = make(html).getHTML();
    expect(make(once).getHTML()).toBe(once);
    expect(make(once).getJSON()).toEqual(make(html).getJSON());
  });
});

describe('content formats', () => {
  const md = [
    '# Title',
    '',
    'Some **bold**, *italic*, ~~gone~~ and `code`.',
    '',
    '> Quote',
    '',
    '- one',
    '- two',
    '',
    '1. first',
    '2. second',
    '',
    '- [ ] todo',
    '- [x] done',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '***',
    '',
    '[link](https://example.com)',
  ].join('\n');

  it('round-trips markdown through every block the kit has', () => {
    const editor = make();
    editor.setContent(md, 'markdown');
    expect(types(editor)).toEqual([
      'heading',
      'paragraph',
      'quote',
      'list',
      'list',
      'list',
      'code',
      'horizontalrule',
      'paragraph',
    ]);
    expect(editor.getMarkdown()).toBe(md);
  });

  it('reads HTML with only the nodes it knows, dropping script and style', () => {
    const editor = make();
    editor.setContent(
      '<h2>T</h2><script>steal()</script><style>p{color:red}</style><p onclick="x()">a<iframe src="x"></iframe></p>',
    );
    expect(editor.getHTML()).toBe('<h2>T</h2><p>a</p>');
  });

  it('reads initial content at once, without a root element', () => {
    const editor = createTeiEditor({ extensions: [StarterKit], content: '<p>Hi <b>there</b></p>' });
    editors.push(editor);
    // Committed, not just pending: code reading Lexical directly sees it too.
    expect(editor.lexical.getEditorState().read(() => $getRoot().getTextContent())).toBe(
      'Hi there',
    );
    expect(editor.getHTML()).toBe('<p>Hi <strong>there</strong></p>');
    expect(editor.can().undo()).toBe(false);
  });

  it('keeps Lexical output when clean export is off', () => {
    const editor = createTeiEditor({
      extensions: [StarterKit, Html.configure({ clean: false })],
      content: '<p>x</p>',
    });
    editors.push(editor);
    expect(editor.getHTML()).toContain('class="tei-p"');
  });

  it('refuses non-string HTML and markdown', () => {
    const editor = make();
    expect(() => editor.setContent(42, 'html')).toThrow(/must be a string/);
    expect(() => editor.setContent({}, 'markdown')).toThrow(/must be a string/);
  });
});

describe('StarterKit.configure', () => {
  it('leaves out a part: its commands, keys and items go with it', () => {
    const editor = make('<p>x</p>', {
      extensions: [
        StarterKit.configure({ underline: false, codeBlock: false, codeHighlight: false }),
      ],
    });
    expect(editor.hasCommand('toggleUnderline')).toBe(false);
    expect(editor.hasCommand('toggleCodeBlock')).toBe(false);
    expect(editor.items('toolbar').map((i) => i.id)).not.toContain('underline');
    expect(editor.shortcut('underline')).toBeUndefined();
    expect(editor.hasCommand('toggleBold')).toBe(true);
  });

  it('contributes items to every placement, in order', () => {
    const editor = make();
    const toolbar = editor.items('toolbar').map((i) => i.id);
    expect(toolbar).toEqual(
      expect.arrayContaining(['bold', 'italic', 'link', 'undo', 'bulletList']),
    );
    const slash = editor.items('slash').map((i) => i.id);
    expect(slash.slice(0, 3)).toEqual(['paragraph', 'heading1', 'heading2']);
  });
});

describe('placeholder', () => {
  it('labels the empty block under the caret, and only that one', () => {
    const editor = make('<p>Intro</p><h2></h2>');
    editor.update(() => ($getRoot().getLastChild() as ElementNode).selectStart());
    const heading = editor.lexical.getRootElement()?.querySelector('h2');
    expect(heading?.getAttribute('data-tei-placeholder')).toBe('Heading 2');
    editor.update(() => ($getRoot().getFirstChild() as ElementNode).selectEnd());
    expect(heading?.hasAttribute('data-tei-placeholder')).toBe(false);
  });
});

describe('UI contributions', () => {
  it('every item has an icon the editor can draw and a translated label', () => {
    const editor = make();
    const items = (['toolbar', 'bubble', 'slash', 'blockType'] as const).flatMap((p) =>
      editor.items(p as never),
    );
    expect(items.length).toBeGreaterThan(10);
    const missing = items.filter((item) => item.icon && !editor.icon(item.icon)).map((i) => i.id);
    expect(missing).toEqual([]);
    const untranslated = items.filter(
      (item) => editor.t(item.label) === item.label && item.label.includes('.'),
    );
    expect(untranslated.map((i) => i.id)).toEqual([]);
  });
});
