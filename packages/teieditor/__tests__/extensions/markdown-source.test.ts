import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import {
  $getMarkdownSource,
  alignOffset,
  MarkdownSource,
  markdownText,
} from '../../src/extensions/markdown-source/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string) {
  const editor = createTeiEditor({ extensions: [StarterKit, MarkdownSource], content });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const DOC =
  '<h1>Title</h1><p>Some <b>bold</b> text and <a href="https://x.dev/a">a link</a></p><ul><li>one</li><li>two</li></ul>';

/** The caret at `offset` in the text node whose text is `text`. */
const caret = (editor: TeiEditor, text: string, offset = text.length) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text) as TextNode;
    node.select(offset, offset);
  });

/** The text before the caret, in the caret's text node. */
const beforeCaret = (editor: TeiEditor) =>
  editor.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const node = selection.anchor.getNode();
    return node.getTextContent().slice(0, selection.anchor.offset);
  });

const enter = (editor: TeiEditor) =>
  editor.lexical.update(
    () => {
      editor.lexical.dispatchCommand(
        KEY_ENTER_COMMAND,
        new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
      );
    },
    { discrete: true },
  );

describe('MarkdownSource', () => {
  it('turns the document into its markdown and back, losslessly', () => {
    const editor = make(DOC);
    const html = editor.getHTML();
    const markdown = editor.getMarkdown();
    expect(editor.isActive('markdownSource')).toBe(false);
    expect(editor.commands.toggleMarkdownSource()).toBe(true);
    expect(editor.isActive('markdownSource')).toBe(true);
    expect(editor.getText()).toBe(markdown);
    expect(editor.getMarkdown()).toBe(markdown);
    const pre = editor.lexical.getRootElement()?.querySelector('pre[data-tei-markdown-source]');
    // One line of source per line of markdown.
    expect(pre?.querySelectorAll('br').length).toBe(markdown.split('\n').length - 1);
    editor.commands.toggleMarkdownSource();
    expect(editor.isActive('markdownSource')).toBe(false);
    expect(editor.getHTML()).toBe(html);
  });

  it('is one undo step each way', () => {
    const editor = make(DOC);
    const html = editor.getHTML();
    editor.commands.toggleMarkdownSource();
    editor.commands.undo();
    expect(editor.isActive('markdownSource')).toBe(false);
    expect(editor.getHTML()).toBe(html);
    editor.commands.redo();
    expect(editor.isActive('markdownSource')).toBe(true);
    editor.commands.toggleMarkdownSource();
    editor.commands.undo();
    expect(editor.isActive('markdownSource')).toBe(true);
  });

  it('reads edits to the source back as formatting', () => {
    const editor = make('<p>x</p>');
    editor.commands.toggleMarkdownSource();
    editor.update(() => {
      const source = $getMarkdownSource();
      source?.selectEnd();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertRawText('\n\n## Two\n\n**b**');
    });
    editor.commands.toggleMarkdownSource();
    expect(editor.getHTML()).toBe('<p>x</p><h2>Two</h2><p><strong>b</strong></p>');
  });

  it('keeps the caret near where it was, both ways', () => {
    const editor = make(DOC);
    caret(editor, ' text and ', 5);
    editor.commands.toggleMarkdownSource();
    const line = beforeCaret(editor) ?? '';
    expect(line.endsWith('**bold** text')).toBe(true);
    editor.commands.toggleMarkdownSource();
    expect(beforeCaret(editor)).toBe(' text');

    caret(editor, 'two', 2);
    editor.commands.toggleMarkdownSource();
    expect(beforeCaret(editor)).toBe('- tw');
    editor.commands.toggleMarkdownSource();
    expect(beforeCaret(editor)).toBe('tw');
  });

  it('types markdown as text: Enter is a new line, shortcuts and links stay out', () => {
    const editor = make('<p>a</p>');
    editor.commands.toggleMarkdownSource();
    editor.update(() => $getMarkdownSource()?.selectEnd());
    enter(editor);
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText('# **x** https://x.dev');
    });
    expect(editor.read(() => $getRoot().getChildrenSize())).toBe(1);
    expect(editor.getText()).toBe('a\n# **x** https://x.dev');
    // Every piece of it is code-formatted source text, nothing else.
    const types = editor.read(() =>
      ($getMarkdownSource()?.getChildren() ?? []).map((n) => n.getType()),
    );
    expect(new Set(types)).toEqual(new Set(['text', 'linebreak']));
  });

  it('pastes plain text only', () => {
    const editor = make('<p>a</p>');
    editor.commands.toggleMarkdownSource();
    editor.update(() => $getMarkdownSource()?.selectEnd());
    const data = { getData: (type: string) => (type === 'text/plain' ? '\n*b*' : '<h1>no</h1>') };
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: data });
    editor.lexical.update(
      () => {
        editor.lexical.dispatchCommand(PASTE_COMMAND, event);
      },
      { discrete: true },
    );
    expect(event.defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('a\n*b*');
    expect(editor.read(() => $getRoot().getChildrenSize())).toBe(1);
  });

  it('refuses, and greys out, other commands while on', () => {
    const editor = make('<p>a</p>');
    editor.update(() => $getRoot().selectEnd());
    expect(editor.can().toggleBold()).toBe(true);
    editor.commands.toggleMarkdownSource();
    editor.update(() => $getMarkdownSource()?.selectEnd());
    expect(editor.can().toggleBold()).toBe(false);
    expect(editor.can().setHeading('h1')).toBe(false);
    expect(editor.commands.toggleBold()).toBe(false);
    expect(editor.can().toggleMarkdownSource()).toBe(true);
    expect(editor.can().undo()).toBe(true);
    editor.commands.toggleMarkdownSource();
    editor.update(() => $getRoot().selectEnd());
    expect(editor.can().toggleBold()).toBe(true);
  });

  it('offers itself in the document menu', () => {
    const editor = make('<p>a</p>');
    expect(editor.items('document').map((i) => i.id)).toContain('markdownSource');
  });
});

describe('alignOffset', () => {
  it('steps over what the target adds', () => {
    expect(alignOffset('Some bold', 'Some **bold** text')).toBe(11);
    expect(alignOffset('Some bold ', 'Some **bold** text')).toBe(14);
    expect(alignOffset('', 'abc')).toBe(0);
  });

  it('skips what the target lacks', () => {
    expect(alignOffset(markdownText('# Title\n\n- one'), 'Titleone')).toBe(8);
    expect(markdownText('[a link](https://x.dev) **b** `c`')).toBe('a link b c');
  });
});
