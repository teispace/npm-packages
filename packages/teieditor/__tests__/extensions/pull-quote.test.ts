import { $getRoot, $isElementNode, type LexicalNode, type TextNode } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { PullQuote } from '../../src/extensions/pull-quote/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function make(content: string | object) {
  const editor = createTeiEditor({ extensions: [StarterKit, PullQuote], content });
  editors.push(editor);
  return editor;
}

const types = (editor: TeiEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .map((n: LexicalNode) => n.getType()),
  );

const caret = (editor: TeiEditor, index: number) =>
  editor.update(() => {
    const block = $getRoot().getChildAtIndex(index);
    if ($isElementNode(block)) (block.getFirstChild() as TextNode).select(1, 1);
  });

describe('PullQuote', () => {
  it('saves as <aside data-tei-pull-quote>, and reads it back, in HTML and JSON', () => {
    const saved = '<aside data-tei-pull-quote="">Big <strong>words</strong></aside>';
    const editor = make(saved);
    expect(types(editor)).toEqual(['pull-quote']);
    expect(editor.getHTML()).toBe(saved);
    const again = make(editor.getJSON());
    expect(types(again)).toEqual(['pull-quote']);
    expect(again.getHTML()).toBe(saved);
  });

  it('reads the web’s pull quotes: the class on an aside or a quote; a plain quote stays one', () => {
    const editor = make(
      '<aside class="pullquote"><p>One</p><p>line</p></aside><blockquote class="pull-quote">Two</blockquote><blockquote>Three</blockquote>',
    );
    expect(types(editor)).toEqual(['pull-quote', 'pull-quote', 'quote']);
    // Its paragraphs became lines.
    expect(editor.getHTML()).toContain('<aside data-tei-pull-quote="">One<br>line</aside>');
  });

  it('is in markdown as a plain quote', () => {
    expect(make('<aside data-tei-pull-quote>Big</aside>').getMarkdown()).toBe('> Big');
  });

  it('sets, toggles and is active apart from a plain quote', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 0);
    editor.commands.setPullQuote();
    expect(types(editor)).toEqual(['pull-quote']);
    expect(editor.isActive('pullQuote')).toBe(true);
    expect(editor.isActive('blockquote')).toBe(false);
    editor.commands.togglePullQuote();
    expect(types(editor)).toEqual(['paragraph']);
    editor.commands.setBlockquote();
    expect(editor.isActive('blockquote')).toBe(true);
    expect(editor.isActive('pullQuote')).toBe(false);
    editor.commands.togglePullQuote();
    expect(types(editor)).toEqual(['pull-quote']);
  });

  it('is in the block type, slash and block menus', () => {
    const editor = make('<p>x</p>');
    for (const menu of ['blockType', 'slash', 'blockMenu'] as const) {
      expect(editor.items(menu).some((i) => i.id === 'pullQuote')).toBe(true);
    }
  });
});

describe('quotes and headings from HTML', () => {
  it('keep text, not blocks: their paragraphs become lines', () => {
    const editor = make(
      '<blockquote><p>a</p><p>b</p></blockquote><h2><p>Title</p></h2><blockquote>x<p>y</p><ul><li>z</li></ul></blockquote>',
    );
    expect(editor.getHTML()).toBe(
      '<blockquote>a<br>b</blockquote><h2>Title</h2><blockquote>x<br>y<br>z</blockquote>',
    );
  });
});
