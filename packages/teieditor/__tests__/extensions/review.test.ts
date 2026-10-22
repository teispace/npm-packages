import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $setSelection,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DELETE_CHARACTER_COMMAND,
  DELETE_WORD_COMMAND,
  HISTORY_PUSH_TAG,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  type LexicalCommand,
  type LexicalNode,
  PASTE_COMMAND,
  REMOVE_TEXT_COMMAND,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import {
  $isSuggestionNode,
  Review,
  type ReviewOptions,
  type ReviewStorage,
} from '../../src/extensions/review/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

const ALICE = { id: 'alice', name: 'Alice' };
const BOB = { id: 'bob', name: 'Bob' };
let counter = 0;

function make(content: string | object, options: Partial<ReviewOptions> = {}) {
  const editor = createTeiEditor({
    extensions: [
      StarterKit,
      Review.configure({
        user: ALICE,
        suggesting: true,
        createId: () => `s${++counter}`,
        ...options,
      }),
    ],
    content,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const storageOf = (editor: TeiEditor) =>
  (editor.extension('@teispace/teieditor/review') as { output: { storage: ReviewStorage } }).output
    .storage;

/** A block's inline content: insertions `{+text}`, deletions `{-text}`, line breaks `⏎`. */
const line = (editor: TeiEditor, index = 0) =>
  editor.read(() => {
    const show = (node: LexicalNode): string => {
      if ($isSuggestionNode(node)) {
        const who = node.getAuthor().id === 'alice' ? '' : `@${node.getAuthor().id}`;
        return `{${node.getKind() === 'insert' ? '+' : '-'}${node.getChildren().map(show).join('')}${who}}`;
      }
      if ($isLineBreakNode(node)) return '⏎';
      return $isElementNode(node) ? node.getChildren().map(show).join('') : node.getTextContent();
    };
    const block = $getRoot().getChildAtIndex(index);
    return block ? show(block) : '';
  });

/** Put the caret `offset` into the text node holding `text` (counted from where `text` starts). */
const caret = (editor: TeiEditor, text: string, offset: number, to = offset) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent().includes(text)) as TextNode;
    const at = node.getTextContent().indexOf(text);
    node.select(at + offset, at + to);
  });

/** Dispatch a Lexical command as one finished update, as a key press is. */
const send = <P>(editor: TeiEditor, command: LexicalCommand<P>, payload: P) =>
  editor.update(() => {
    editor.lexical.dispatchCommand(command, payload);
  });

const type = (editor: TeiEditor, text: string) => {
  for (const char of text) send(editor, CONTROLLED_TEXT_INSERTION_COMMAND, char);
};
const backspace = (editor: TeiEditor, times = 1) => {
  for (let i = 0; i < times; i++) send(editor, DELETE_CHARACTER_COMMAND, true);
};
const del = (editor: TeiEditor) => send(editor, DELETE_CHARACTER_COMMAND, false);

/** Where the caret is: the text around it, `|` at the caret. */
const caretAt = (editor: TeiEditor) =>
  editor.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const node = selection.focus.getNode();
    const text = node.getTextContent();
    return selection.focus.type === 'text'
      ? `${text.slice(0, selection.focus.offset)}|${text.slice(selection.focus.offset)}`
      : `element ${node.getType()}@${selection.focus.offset}`;
  });

describe('Review: suggest mode off', () => {
  it('typing and deleting change the text as usual', () => {
    const editor = make('<p>Hello</p>', { suggesting: false });
    caret(editor, 'Hello', 5);
    type(editor, '!');
    caret(editor, 'Hello', 0, 2);
    send(editor, REMOVE_TEXT_COMMAND, null as never);
    expect(line(editor)).toBe('llo!');
    expect(storageOf(editor).suggestions.peek()).toEqual([]);
  });

  it('setSuggesting and toggleSuggesting switch it', () => {
    const editor = make('<p>x</p>', { suggesting: false });
    expect(editor.isActive('suggesting')).toBe(false);
    editor.commands.toggleSuggesting();
    expect(editor.isActive('suggesting')).toBe(true);
    editor.commands.setSuggesting(false);
    expect(editor.isActive('suggesting')).toBe(false);
    editor.commands.setSuggesting(true);
    expect(storageOf(editor).suggesting.peek()).toBe(true);
  });
});

describe('Review: suggesting insertions', () => {
  it('typed text is one insertion, by the user, timed', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 3);
    type(editor, 'XY');
    expect(line(editor)).toBe('Hel{+XY}lo');
    // Wherever the caret settled at the run's end, typing goes on in the same run.
    type(editor, 'Z');
    expect(line(editor)).toBe('Hel{+XYZ}lo');
    const [suggestion] = storageOf(editor).suggestions.peek();
    expect(suggestion).toMatchObject({ kind: 'insert', author: ALICE, text: 'XYZ' });
    expect(suggestion?.createdAt).toBeGreaterThan(0);
    expect(storageOf(editor).suggestions.peek()).toHaveLength(1);
    expect(storageOf(editor).active.peek()).toBe(suggestion?.id);
    expect(editor.isActive('suggestion')).toBe(true);
  });

  it('typing on after the caret left and came back extends the same insertion', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 5);
    type(editor, 'ab');
    caret(editor, 'Hel', 0);
    // Right after the insertion, as the caret lands when it leaves the run's end.
    editor.update(() => {
      const ins = $getRoot().getAllTextNodes().at(-1) as TextNode;
      ins.getParentOrThrow().selectNext();
    });
    type(editor, 'c');
    expect(line(editor)).toBe('Hello{+abc}');
    expect(storageOf(editor).suggestions.peek()).toHaveLength(1);
  });

  it('typing over a selection strikes it and puts the new text after', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 1, 4);
    type(editor, 'i');
    expect(line(editor)).toBe('H{-ell}{+i}o');
    const kinds = storageOf(editor)
      .suggestions.peek()
      .map((s) => s.kind);
    expect(kinds).toEqual(['delete', 'insert']);
  });

  it('Enter suggests a line break; pasted lines become one insertion with breaks', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 5);
    send(editor, INSERT_PARAGRAPH_COMMAND, undefined);
    expect(line(editor)).toBe('Hello{+⏎}');
    expect(editor.read(() => $getRoot().getChildrenSize())).toBe(1);
    const paste = {
      clipboardData: { getData: (kind: string) => (kind === 'text/plain' ? 'one\r\ntwo' : '') },
      preventDefault() {},
    } as unknown as ClipboardEvent;
    send(editor, PASTE_COMMAND, paste);
    expect(line(editor)).toBe('Hello{+⏎one⏎two}');
  });

  it("typing inside another author's insertion splits it round the new text", () => {
    const editor = make('<p>Hello</p>', { user: BOB });
    caret(editor, 'Hello', 5);
    type(editor, 'abcd');
    editor.update(() => {}); // settle
    editors.push(editor);
    const alice = make(editor.getJSON());
    caret(alice, 'abcd', 2);
    type(alice, 'X');
    expect(line(alice)).toBe('Hello{+ab@bob}{+X}{+cd@bob}');
    // Bob's two halves are still one suggestion.
    const ids = storageOf(alice)
      .suggestions.peek()
      .map((s) => [s.author.id, s.text]);
    expect(ids).toEqual([
      ['bob', 'abcd'],
      ['alice', 'X'],
    ]);
  });

  it('typing in struck text goes after it', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 1, 4);
    backspace(editor);
    caret(editor, 'ell', 1);
    type(editor, 'Z');
    expect(line(editor)).toBe('H{-ell}{+Z}o');
  });

  it('typing the browser would do itself goes through suggest mode too', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 5);
    const event = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: '!',
      bubbles: true,
      cancelable: true,
    });
    editor.lexical.getRootElement()?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(line(editor)).toBe('Hello{+!}');
  });
});

describe('Review: suggesting deletions', () => {
  it('Backspace strikes characters one by one into one deletion, the caret before it', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 4);
    backspace(editor);
    expect(line(editor)).toBe('Hel{-l}o');
    backspace(editor, 2);
    expect(line(editor)).toBe('H{-ell}o');
    expect(caretAt(editor)).toMatch(/^(H\||element paragraph@1)$/);
    expect(storageOf(editor).suggestions.peek()).toHaveLength(1);
    // Forward delete strikes after the caret, skipping what is struck already.
    caret(editor, 'o', 0);
    del(editor);
    expect(line(editor)).toBe('H{-ello}');
  });

  it('Backspace in your own insertion really deletes it', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 5);
    type(editor, 'abc');
    backspace(editor);
    expect(line(editor)).toBe('Hello{+ab}');
    backspace(editor, 2);
    expect(line(editor)).toBe('Hello');
    expect(storageOf(editor).suggestions.peek()).toEqual([]);
  });

  it("leaves another author's insertion alone", () => {
    const bob = make('<p>Hi</p>', { user: BOB });
    caret(bob, 'Hi', 2);
    type(bob, 'yo');
    const editor = make(bob.getJSON());
    caret(editor, 'yo', 2);
    backspace(editor);
    expect(line(editor)).toBe('Hi{+yo@bob}');
  });

  it('a selection across blocks is struck in each block; blocks are not joined', () => {
    const editor = make('<p>One</p><p>Two</p>');
    editor.update(() => {
      const [a, b] = $getRoot().getAllTextNodes() as [TextNode, TextNode];
      a.select(1, 1).focus.set(b.getKey(), 2, 'text');
    });
    send(editor, REMOVE_TEXT_COMMAND, null as never);
    expect(line(editor, 0)).toBe('O{-ne}');
    expect(line(editor, 1)).toBe('{-Tw}o');
  });

  it('Backspace at the start of a block moves into the one before', () => {
    const editor = make('<p>One</p><p>Two</p>');
    caret(editor, 'Two', 0);
    backspace(editor);
    expect(editor.read(() => $getRoot().getChildrenSize())).toBe(2);
    expect(caretAt(editor)).toBe('One|');
    backspace(editor);
    expect(line(editor)).toBe('On{-e}');
  });

  it('a word at a time falls back to a character with no native selection to measure', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 5);
    send(editor, DELETE_WORD_COMMAND, true);
    expect(line(editor)).toMatch(/\{-/);
  });

  it('a grapheme at a time: an emoji is struck whole', () => {
    const editor = make('<p>a👍🏽b</p>');
    caret(editor, 'b', 0);
    backspace(editor);
    expect(line(editor)).toBe('a{-👍🏽}b');
  });

  it('a selected block (a rule) is not deleted', () => {
    const editor = make('<p>a</p><hr><p>b</p>');
    editor.update(() => {
      const rule = $getRoot().getChildAtIndex(1);
      const selection = $createNodeSelection();
      if (rule) selection.add(rule.getKey());
      $setSelection(selection);
    });
    send(editor, KEY_BACKSPACE_COMMAND, null as never);
    send(editor, DELETE_CHARACTER_COMMAND, true);
    expect(editor.read(() => $getRoot().getChildrenSize())).toBe(3);
    // Out of suggest mode, it is.
    editor.commands.setSuggesting(false);
    send(editor, KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown'));
    expect(editor.read(() => $getRoot().getChildrenSize())).toBeLessThan(3);
  });

  it('cut copies the text and strikes it', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 0, 2);
    const data: Record<string, string> = {};
    const event = {
      clipboardData: { setData: (k: string, v: string) => (data[k] = v) },
      preventDefault() {},
    } as unknown as ClipboardEvent;
    send(editor, CUT_COMMAND, event);
    expect(data['text/plain']).toBe('He');
    expect(line(editor)).toBe('{-He}llo');
  });
});

describe('Review: accepting and rejecting', () => {
  function reviewed() {
    const editor = make('<p>Hello world</p>');
    caret(editor, 'Hello', 5);
    type(editor, ' big');
    caret(editor, ' world', 1, 6);
    backspace(editor);
    return editor;
  }
  const ids = (editor: TeiEditor) =>
    storageOf(editor)
      .suggestions.peek()
      .map((s) => s.id);

  it('accept: an insertion stays, a deletion goes', () => {
    const editor = reviewed();
    expect(line(editor)).toBe('Hello{+ big} {-world}');
    const [ins, del] = ids(editor) as [string, string];
    expect(editor.can().acceptChange(ins)).toBe(true);
    expect(editor.commands.acceptChange(ins)).toBe(true);
    expect(editor.commands.acceptChange(del)).toBe(true);
    expect(line(editor)).toBe('Hello big ');
    expect(storageOf(editor).suggestions.peek()).toEqual([]);
    expect(editor.can().acceptChange(ins)).toBe(false);
    expect(editor.commands.acceptChange(ins)).toBe(false);
  });

  it('reject: an insertion goes, a deletion stays', () => {
    const editor = reviewed();
    const [ins, del] = ids(editor) as [string, string];
    editor.commands.rejectChange(ins);
    editor.commands.rejectChange(del);
    expect(line(editor)).toBe('Hello world');
  });

  it('without an id, the one at the caret', () => {
    const editor = reviewed();
    caret(editor, ' big', 2);
    expect(editor.commands.acceptChange()).toBe(true);
    expect(line(editor)).toBe('Hello big {-world}');
    caret(editor, 'Hello', 0);
    expect(editor.can().rejectChange()).toBe(false);
  });

  it('all at once, as one undo step', () => {
    const editor = reviewed();
    editor.update(() => {}, { tag: HISTORY_PUSH_TAG });
    expect(editor.commands.acceptAllChanges()).toBe(true);
    expect(line(editor)).toBe('Hello big ');
    editor.commands.undo();
    expect(line(editor)).toBe('Hello{+ big} {-world}');
    expect(editor.commands.rejectAllChanges()).toBe(true);
    expect(line(editor)).toBe('Hello world');
    expect(editor.can().rejectAllChanges()).toBe(false);
  });

  it('canReview can refuse', () => {
    const editor = make('<p>Hi</p>', {
      canReview: (user, suggestion) => user.id !== suggestion.author.id,
    });
    caret(editor, 'Hi', 2);
    type(editor, '!');
    expect(editor.can().acceptChange()).toBe(false);
    expect(editor.commands.acceptAllChanges()).toBe(false);
    expect(line(editor)).toBe('Hi{+!}');
  });

  it('a suggestion across blocks is settled everywhere', () => {
    const editor = make('<p>One</p><p>Two</p>');
    editor.update(() => {
      const [a, b] = $getRoot().getAllTextNodes() as [TextNode, TextNode];
      a.select(1, 1).focus.set(b.getKey(), 2, 'text');
    });
    send(editor, REMOVE_TEXT_COMMAND, null as never);
    expect(storageOf(editor).suggestions.peek()).toHaveLength(1);
    editor.commands.acceptAllChanges();
    expect([line(editor, 0), line(editor, 1)]).toEqual(['O', 'o']);
  });
});

describe('Review: saving', () => {
  function sample(options: Partial<ReviewOptions> = {}) {
    const editor = make('<p>Hello world</p>', options);
    caret(editor, 'Hello', 5);
    type(editor, ' big');
    caret(editor, ' world', 1, 6);
    backspace(editor);
    return editor;
  }

  it('HTML is the original by default: insertions out, deletions in', () => {
    expect(sample().getHTML()).toBe('<p>Hello world</p>');
  });

  it("'proposed' writes it as if every suggestion were accepted", () => {
    expect(sample({ exportMode: 'proposed' }).getHTML()).toBe(
      '<p>Hello big<span style="white-space: pre-wrap;"> </span></p>',
    );
  });

  it("'marked' writes <ins> and <del>, which read back as suggestions", () => {
    const editor = sample({ exportMode: 'marked' });
    const html = editor.getHTML();
    expect(html).toMatch(
      /<ins data-tei-suggestion="s\d+" data-author="alice" data-author-name="Alice" datetime="[^"]+">/,
    );
    expect(html).toMatch(/<del data-tei-suggestion="s\d+"[^>]*>world<\/del>/);
    const again = make(html, { exportMode: 'marked' });
    expect(line(again)).toBe('Hello{+ big} {-world}');
    expect(
      storageOf(again)
        .suggestions.peek()
        .map((s) => s.author),
    ).toEqual([ALICE, ALICE]);
    // Plain <ins> and <del> stay what they were.
    expect(line(make('<p><ins>a</ins><del>b</del></p>'))).not.toMatch(/\{/);
  });

  it('JSON keeps suggestions, and hostile values are made safe', () => {
    const editor = sample();
    const again = make(editor.getJSON());
    expect(line(again)).toBe('Hello{+ big} {-world}');
    const hostile = {
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'paragraph',
            version: 1,
            children: [
              {
                type: 'suggestion',
                version: 1,
                kind: 'evil',
                suggestionId: 'x'.repeat(1000),
                author: { id: 7, name: { toString: () => 'pwn' } },
                createdAt: -1,
                children: [{ type: 'text', version: 1, text: 'hi' }],
              },
            ],
          },
        ],
      },
    };
    const bad = make(hostile);
    const [s] = storageOf(bad).suggestions.peek();
    expect(s).toMatchObject({ kind: 'insert', author: { id: '', name: '' }, createdAt: 0 });
    expect(s?.id).toHaveLength(128);
  });

  it('undo takes a suggestion back', () => {
    const editor = make('<p>Hello</p>');
    caret(editor, 'Hello', 5);
    type(editor, '!');
    editor.update(() => {}, { tag: HISTORY_PUSH_TAG });
    caret(editor, 'Hello', 0);
    type(editor, '>');
    expect(line(editor)).toBe('{+>}Hello{+!}');
    editor.commands.undo();
    expect(line(editor)).toBe('Hello{+!}');
    expect(storageOf(editor).suggestions.peek()).toHaveLength(1);
  });

  it('the DOM marks runs as <ins>/<del> with their author', () => {
    const editor = sample();
    const ins = document.querySelector('ins.tei-suggestion');
    expect(ins?.getAttribute('data-author')).toBe('alice');
    expect(ins?.getAttribute('data-kind')).toBe('insert');
    expect(document.querySelector('del.tei-suggestion')?.textContent).toBe('world');
    editor.commands.rejectAllChanges();
    expect(document.querySelector('.tei-suggestion')).toBeNull();
  });
});
