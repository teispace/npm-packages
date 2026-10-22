import { $isOverflowNode } from '@lexical/overflow';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setCompositionKey,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { setExtensionOptions } from '../../src/core/define.js';
import {
  CharacterCount,
  type CharacterCountOptions,
  type CharacterCountStorage,
  countText,
  graphemes,
} from '../../src/extensions/character-count/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string, options: Partial<CharacterCountOptions> = {}, rooted = true) {
  const editor = createTeiEditor({
    extensions: [StarterKit, CharacterCount.configure(options)],
    content,
  });
  editors.push(editor);
  if (rooted) {
    const root = document.createElement('div');
    root.contentEditable = 'true';
    document.body.append(root);
    editor.lexical.setRootElement(root);
  }
  return editor;
}

const storage = (editor: TeiEditor) =>
  editor.extension(CharacterCount)?.output.storage as CharacterCountStorage;

const stats = (editor: TeiEditor) => {
  storage(editor).flush();
  return storage(editor).stats.peek();
};

/** The caret at the end of the text node whose text is `text` (or the last one). */
const caretAtEnd = (editor: TeiEditor, text?: string) =>
  editor.update(() => {
    const nodes = $getRoot().getAllTextNodes();
    const node = (text ? nodes.find((t) => t.getTextContent() === text) : nodes.at(-1)) as TextNode;
    node.select();
  });

/** Type or paste `text` at the selection, as one edit. */
const type = (editor: TeiEditor, text: string) =>
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.insertText(text);
  });

const paragraphs = (editor: TeiEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .map((p) => p.getTextContent()),
  );

const overflowText = (editor: TeiEditor) =>
  editor.read(() => {
    const found: string[] = [];
    const visit = (node: LexicalNode) => {
      if ($isOverflowNode(node)) found.push(node.getTextContent());
      else if ('getChildren' in node)
        for (const c of (node as never as { getChildren(): LexicalNode[] }).getChildren()) visit(c);
    };
    visit($getRoot());
    return found;
  });

describe('countText', () => {
  it('counts characters as graphemes, words, and blank-line paragraphs', () => {
    expect(countText('Hello world')).toEqual({
      characters: 11,
      charactersNoSpaces: 10,
      words: 2,
      paragraphs: 1,
    });
    // A skin-toned emoji, a family (ZWJ) and an accent made of two code points.
    expect(countText('👍🏽 👨\u200d👩\u200d👧 e\u0301')).toMatchObject({
      characters: 5,
      charactersNoSpaces: 3,
    });
    expect(countText('One.\n\nTwo three\nfour\n\n\n\n')).toMatchObject({
      characters: 17,
      words: 4,
      paragraphs: 2,
    });
    // Paragraph breaks are not characters, in any script.
    expect(countText('Über\n\nça va\nmerci')).toMatchObject({
      characters: 14,
      charactersNoSpaces: 13,
      paragraphs: 2,
    });
    expect(countText('')).toEqual({
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      paragraphs: 0,
    });
    // Japanese has no spaces; the segmenter still finds its words.
    expect(countText('私は猫です').words).toBeGreaterThan(1);
  });

  it('splits graphemes without Intl.Segmenter too', () => {
    const real = Intl.Segmenter;
    try {
      (Intl as { Segmenter?: unknown }).Segmenter = undefined;
      expect(graphemes('ae\u0301👍🏽', 'xx-nosegmenter').map((g) => g.segment)).toEqual([
        'a',
        'e\u0301',
        '👍🏽',
      ]);
      expect(countText('naïve café, déjà vu', 'xx-nosegmenter').words).toBe(4);
    } finally {
      (Intl as { Segmenter?: unknown }).Segmenter = real;
    }
  });
});

describe('CharacterCount: counts', () => {
  it('counts the document: blocks, list items, empty lines', () => {
    const editor = make(
      '<h1>A title</h1><p>Hello <b>big</b> world</p><ul><li>One</li><li>Two</li></ul><p></p>',
    );
    expect(stats(editor)).toEqual({
      characters: 7 + 15 + 3 + 3,
      charactersNoSpaces: 6 + 13 + 6,
      words: 2 + 3 + 2,
      paragraphs: 4,
      readingMinutes: 1,
    });
  });

  it('follows edits, block by block', () => {
    const editor = make('<p>one two</p><p>three</p>');
    expect(stats(editor).words).toBe(3);
    caretAtEnd(editor, 'three');
    type(editor, ' four');
    // A small edit is counted at once, with no flush.
    expect(storage(editor).stats.peek().words).toBe(4);
    editor.update(() => $getRoot().getFirstChild()?.remove());
    expect(storage(editor).stats.peek()).toMatchObject({ words: 2, paragraphs: 1 });
    editor.update(() => {
      $getRoot().append($createParagraphNode().append($createTextNode('five six seven')));
    });
    expect(storage(editor).stats.peek().words).toBe(5);
  });

  it('starts again for a whole new state, and without a root element', () => {
    const editor = make('<p>a b c</p>', {}, false);
    expect(stats(editor).words).toBe(3);
    const other = make('<p>one</p><p>two three four five</p>');
    editor.lexical.setEditorState(other.lexical.getEditorState());
    expect(stats(editor)).toMatchObject({ words: 5, paragraphs: 2 });
    editor.setContent('<p>x</p>');
    expect(stats(editor).words).toBe(1);
  });

  it('counts a 10,000-paragraph document right, and an edit in it at once', () => {
    const editor = make('<p>start</p>');
    editor.update(() => {
      const root = $getRoot().clear();
      for (let i = 0; i < 10_000; i++)
        root.append($createParagraphNode().append($createTextNode(`Line ${i} has five words`)));
    });
    // So many changed blocks are counted when idle…
    expect(storage(editor).stats.peek().words).toBe(1);
    // …or now, when asked.
    const counted = stats(editor);
    const characters = Array.from(
      { length: 10_000 },
      (_, i) => `Line ${i} has five words`.length,
    ).reduce((a, b) => a + b, 0);
    expect(counted).toEqual({
      characters,
      charactersNoSpaces: characters - 40_000,
      words: 50_000,
      paragraphs: 10_000,
      readingMinutes: Math.ceil(50_000 / 230),
    });
    // One more word in one paragraph: counted at once, not by walking the rest.
    caretAtEnd(editor);
    const started = performance.now();
    type(editor, ' more');
    const took = performance.now() - started;
    expect(storage(editor).stats.peek().words).toBe(50_001);
    expect(took).toBeLessThan(200);
  });

  it('waits for an idle moment for big changes', async () => {
    const editor = make('<p>x</p>');
    editor.update(() => {
      const root = $getRoot().clear();
      for (let i = 0; i < 1000; i++)
        root.append($createParagraphNode().append($createTextNode('a b')));
    });
    expect(storage(editor).stats.peek().words).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(storage(editor).stats.peek().words).toBe(2000);
  });

  it('counts the selection with countSelection', () => {
    const editor = make('<p>one two three</p><p>four</p>', { countSelection: true });
    expect(storage(editor).selection.peek()).toBeNull();
    editor.update(() => {
      const text = $getRoot().getAllTextNodes()[0] as TextNode;
      text.select(0, 7);
    });
    expect(storage(editor).selection.peek()).toMatchObject({ words: 2, characters: 7 });
    editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).select(3, 3));
    expect(storage(editor).selection.peek()).toBeNull();
    setExtensionOptions(editor, CharacterCount, { countSelection: false });
    editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).select(0, 7));
    expect(storage(editor).selection.peek()).toBeNull();
  });

  it('reading time follows wordsPerMinute', () => {
    const editor = make(`<p>${'word '.repeat(100)}</p>`, { wordsPerMinute: 30 });
    expect(stats(editor).readingMinutes).toBe(4);
    setExtensionOptions(editor, CharacterCount, { wordsPerMinute: 100 });
    expect(storage(editor).stats.peek().readingMinutes).toBe(1);
  });
});

describe('CharacterCount: limit', () => {
  it('stops typing at the limit', () => {
    const editor = make('<p>abcd</p>', { limit: 5 });
    caretAtEnd(editor);
    type(editor, 'e');
    type(editor, 'f');
    expect(paragraphs(editor)).toEqual(['abcde']);
    // Typing in the middle at the limit takes nothing that was there.
    editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).select(2, 2));
    type(editor, 'X');
    expect(paragraphs(editor)).toEqual(['abcde']);
    expect(stats(editor).characters).toBe(5);
  });

  it('cuts a paste to fit, and never inside a character', () => {
    const editor = make('<p>ab</p>', { limit: 5 });
    caretAtEnd(editor);
    type(editor, 'cdefgh');
    expect(paragraphs(editor)).toEqual(['abcde']);

    const emoji = make('<p>abcd</p>', { limit: 5 });
    caretAtEnd(emoji);
    type(emoji, '👍🏽👍🏽');
    expect(paragraphs(emoji)).toEqual(['abcd👍🏽']);

    const marks = make('<p>abc</p>', { limit: 5 });
    caretAtEnd(marks);
    type(marks, 'e\u0301e\u0301e\u0301');
    expect(paragraphs(marks)).toEqual(['abce\u0301e\u0301']);
  });

  it('cuts a pasted paragraph run to fit, across blocks', () => {
    const editor = make('<p>ab</p>', { limit: 6 });
    caretAtEnd(editor);
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      selection.insertText('cd');
      selection.insertParagraph();
      selection.insertText('efgh');
      selection.insertParagraph();
      selection.insertText('ijk');
    });
    expect(paragraphs(editor).join('|')).toBe('abcd|ef');
    expect(stats(editor).characters).toBe(6);
  });

  it('leaves a composition alone until it ends, then cuts at a grapheme', () => {
    const editor = make('<p>abcd</p>', { limit: 5 });
    caretAtEnd(editor);
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setCompositionKey(selection.anchor.key);
      selection.insertText('👍🏽e\u0301');
    });
    expect(editor.lexical.isComposing()).toBe(true);
    expect(paragraphs(editor)).toEqual(['abcd👍🏽e\u0301']);
    // The composition ends with the caret after it: what is over goes, whole.
    editor.update(() => {
      $setCompositionKey(null);
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      // The input method held its text selected; it ends with a caret after it.
      const end = selection.isBackward() ? selection.anchor : selection.focus;
      selection.anchor.set(end.key, end.offset, end.type);
      selection.focus.set(end.key, end.offset, end.type);
      selection.anchor.getNode().markDirty();
    });
    expect(paragraphs(editor)).toEqual(['abcd👍🏽']);
  });

  it('counts words with mode: words, and keeps words already there', () => {
    const editor = make('<p>one two</p>', { limit: 3, mode: 'words' });
    caretAtEnd(editor);
    type(editor, ' three four five');
    expect(paragraphs(editor)).toEqual(['one two three ']);
    // A space that would split a word at the limit is taken back; the word stays.
    editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).select(2, 2));
    type(editor, ' ');
    expect(paragraphs(editor)).toEqual(['one two three ']);
    // Spaces and punctuation still go in.
    caretAtEnd(editor);
    type(editor, '!');
    expect(paragraphs(editor)).toEqual(['one two three !']);
  });

  it('marks content over the limit, cuts none of it, and lets it shrink', () => {
    const editor = make('<p>abcdefgh</p>', { limit: 5 });
    expect(paragraphs(editor)).toEqual(['abcdefgh']);
    expect(overflowText(editor)).toEqual(['fgh']);
    expect(
      editor.lexical.getRootElement()?.querySelector('.tei-character-limit')?.textContent,
    ).toBe('fgh');
    // Saved without the mark.
    expect(editor.getHTML()).toBe('<p>abcdefgh</p>');
    // More typing is refused while over; deleting is fine.
    editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).select(2, 2));
    type(editor, 'X');
    expect(editor.getText()).toBe('abcdefgh');
    editor.update(() => {
      const text = $getRoot().getAllTextNodes().at(-1) as TextNode;
      text.setTextContent('f');
    });
    expect(editor.getText()).toBe('abcdef');
    expect(overflowText(editor)).toEqual(['f']);
    editor.update(() => ($getRoot().getAllTextNodes().at(-1) as TextNode).remove());
    expect(overflowText(editor)).toEqual([]);
  });

  it('with enforce: false lets text in and marks what is over', () => {
    const editor = make('<p>abc</p>', { limit: 4, enforce: false });
    caretAtEnd(editor);
    type(editor, 'defg');
    expect(editor.getText()).toBe('abcdefg');
    expect(overflowText(editor)).toEqual(['efg']);
    // Lifting the limit takes the marks away.
    setExtensionOptions(editor, CharacterCount, { limit: null });
    expect(overflowText(editor)).toEqual([]);
    expect(editor.getText()).toBe('abcdefg');
  });

  it('never stops undo', () => {
    const editor = make('<p>abc</p>', { limit: 10 });
    caretAtEnd(editor);
    type(editor, 'defgh');
    editor.commands.undo();
    setExtensionOptions(editor, CharacterCount, { limit: 2 });
    editor.commands.redo();
    expect(editor.getText()).toBe('abcdefgh');
  });
});
