import { $getRoot, $isElementNode, type LexicalNode, type TextNode } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { $isRubyNode, Ruby, type RubyStorage } from '../../src/extensions/ruby/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string | object, { markdown = false } = {}) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Ruby],
    content,
    contentFormat: markdown ? 'markdown' : undefined,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/** The first paragraph's inline content: text, and rubies as `{base|reading}`. */
const line = (editor: TeiEditor, index = 0) =>
  editor.read(() => {
    const block = $getRoot().getChildAtIndex(index);
    const show = (node: LexicalNode): string =>
      $isRubyNode(node)
        ? `{${node.getChildren().map(show).join('')}|${node.getAnnotation()}}`
        : $isElementNode(node)
          ? node.getChildren().map(show).join('')
          : node.getTextContent();
    return block ? show(block) : '';
  });

/** Select `from`–`to` of the text node whose text is `text`. */
const select = (editor: TeiEditor, text: string, from: number, to: number) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text) as TextNode;
    node.select(from, to);
  });

describe('Ruby: commands', () => {
  it('annotates the selected text, and changes the annotation the caret is in', () => {
    const editor = make('<p>日本語の漢字です</p>');
    select(editor, '日本語の漢字です', 4, 6);
    expect(editor.can().setRuby('かんじ')).toBe(true);
    expect(editor.commands.setRuby('かんじ')).toBe(true);
    expect(line(editor)).toBe('日本語の{漢字|かんじ}です');
    expect(editor.isActive('ruby')).toBe(true);
    // The base stays selected: a second annotation replaces the first.
    expect(editor.commands.setRuby(' カンジ ')).toBe(true);
    expect(line(editor)).toBe('日本語の{漢字|カンジ}です');
    expect(editor.getHTML()).toBe('<p>日本語の<ruby>漢字<rt>カンジ</rt></ruby>です</p>');
  });

  it('refuses a caret outside one, text across blocks, and an empty reading on plain text', () => {
    const editor = make('<p>漢字</p><p>二</p>');
    editor.update(() => $getRoot().getFirstDescendant()?.selectStart());
    expect(editor.can().setRuby('x')).toBe(false);
    expect(editor.commands.setRuby('x')).toBe(false);
    editor.update(() => {
      const [a, b] = $getRoot().getAllTextNodes() as [TextNode, TextNode];
      a.select(0, 1).focus.set(b.getKey(), 1, 'text');
    });
    expect(editor.commands.setRuby('x')).toBe(false);
    select(editor, '漢字', 0, 2);
    expect(editor.commands.setRuby('  ')).toBe(false);
    expect(line(editor)).toBe('漢字');
  });

  it('an empty reading, or unsetRuby, takes it off and keeps the text', () => {
    const editor = make('<p>a<ruby>漢<rt>kan</rt></ruby>b<ruby>字<rt>ji</rt></ruby></p>');
    expect(line(editor)).toBe('a{漢|kan}b{字|ji}');
    editor.update(() => $getRoot().getAllTextNodes()[1]?.select(0, 0));
    expect(editor.commands.setRuby('')).toBe(true);
    expect(line(editor)).toBe('a漢b{字|ji}');
    editor.update(() => $getRoot().selectStart());
    expect(editor.can().unsetRuby()).toBe(false);
    editor.update(() => $getRoot().select(0, 1));
    expect(editor.commands.unsetRuby()).toBe(true);
    expect(editor.getHTML()).toBe('<p>a漢b字</p>');
  });

  it('openRubyEditor asks the UI, only while one is there', () => {
    const editor = make('<p>漢字</p>');
    select(editor, '漢字', 0, 2);
    expect(editor.commands.openRubyEditor()).toBe(false);
    const storage = editor.extension(Ruby)?.output.storage as RubyStorage;
    storage.edit.uis.value = 1;
    const before = storage.edit.requests.value;
    expect(editor.commands.openRubyEditor()).toBe(true);
    expect(storage.edit.requests.value).toBe(before + 1);
  });
});

describe('Ruby: DOM, HTML, markdown and JSON', () => {
  it('draws the reading in an <rt> the caret never enters, after the base', () => {
    const editor = make('<p><ruby>漢字<rt>かんじ</rt></ruby></p>');
    const ruby = editor.lexical.getRootElement()?.querySelector('ruby');
    expect(ruby?.className).toBe('tei-ruby');
    expect(ruby?.lastElementChild?.tagName).toBe('RT');
    expect(ruby?.lastElementChild?.getAttribute('contenteditable')).toBe('false');
    expect(ruby?.textContent).toBe('漢字かんじ');
    editor.update(() => {
      const ruby = $getRoot().getAllTextNodes()[0]?.getParent();
      if ($isRubyNode(ruby)) ruby.setAnnotation('カンジ');
    });
    expect(ruby?.lastElementChild?.textContent).toBe('カンジ');
  });

  it('reads each base and its <rt> as one ruby, leaving out <rp>, and keeps spaces beside it', () => {
    const editor = make(
      '<p>a <ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp>字<rp>(</rp><rt>ji</rt><rp>)</rp></ruby> b</p>',
    );
    expect(line(editor)).toBe('a {漢|kan}{字|ji} b');
    expect(editor.getHTML()).toBe(
      '<p>a <ruby>漢<rt>kan</rt></ruby><ruby>字<rt>ji</rt></ruby> b</p>',
    );
  });

  it('reads a ruby with no reading as its text, and keeps formatting in the base', () => {
    const editor = make('<p><ruby>無</ruby><ruby><strong>太</strong><rt>futo</rt></ruby></p>');
    expect(line(editor)).toBe('無{太|futo}');
    expect(editor.getHTML()).toBe('<p>無<ruby><strong>太</strong><rt>futo</rt></ruby></p>');
  });

  it('round-trips through JSON', () => {
    const editor = make('<p><ruby>漢<rt>kan</rt></ruby></p>');
    const json = editor.getJSON();
    expect(JSON.stringify(json)).toContain('"type":"ruby"');
    expect(line(make(json))).toBe('{漢|kan}');
  });

  it('is inline HTML in markdown, read back, escaped', () => {
    const editor = make('<p>x <ruby>漢<rt>a&lt;b</rt></ruby> y</p>');
    const md = editor.getMarkdown();
    expect(md).toBe('x <ruby>漢<rt>a&lt;b</rt></ruby> y');
    expect(line(make(md, { markdown: true }))).toBe('x {漢|a<b} y');
    expect(line(make('<ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp></ruby>', { markdown: true }))).toBe(
      '{漢|kan}',
    );
  });
});
