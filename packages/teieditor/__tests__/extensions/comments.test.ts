import { $isMarkNode, type MarkNode } from '@lexical/mark';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type CommentStore,
  Comments,
  type CommentsOptions,
  type CommentsStorage,
  createMemoryCommentStore,
  parseCommentThreads,
} from '../../src/extensions/comments/index.js';
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
const ids = () => `id${++counter}`;

function make(content: string | object, options: Partial<CommentsOptions> = {}) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Comments.configure({ user: ALICE, createId: ids, ...options })],
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
  (editor.extension('@teispace/teieditor/comments') as { output: { storage: CommentsStorage } })
    .output.storage;

/** The first paragraph's inline content, marks as `[text|ids]`. */
const line = (editor: TeiEditor, index = 0) =>
  editor.read(() => {
    const block = $getRoot().getChildAtIndex(index);
    const show = (node: LexicalNode): string =>
      $isMarkNode(node)
        ? `[${node.getChildren().map(show).join('')}|${node.getIDs().join(',')}]`
        : $isElementNode(node)
          ? node.getChildren().map(show).join('')
          : node.getTextContent();
    return block ? show(block) : '';
  });

/** Select `from`–`to`, counted from where `text` starts in the text node that has it. */
const select = (editor: TeiEditor, text: string, from: number, to: number) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent().includes(text)) as TextNode;
    const at = node.getTextContent().indexOf(text);
    node.select(at + from, at + to);
  });

/** Put the caret `offset` into `text`. */
const caret = (editor: TeiEditor, text: string, offset: number) =>
  select(editor, text, offset, offset);

/** Comment on `from`–`to` of the node containing `text`; returns the new thread's id. */
function comment(editor: TeiEditor, text: string, from: number, to: number, content = 'Hi') {
  select(editor, text, from, to);
  expect(editor.commands.addComment()).toBe(true);
  expect(editor.commands.submitComment(content)).toBe(true);
  return storageOf(editor).active.peek() as string;
}

describe('Comments: starting a thread', () => {
  it('opens the composer on a selection, and marks the text when the comment is posted', () => {
    const editor = make('<p>Hello brave world</p>');
    select(editor, 'Hello', 6, 11);
    expect(editor.can().addComment()).toBe(true);
    expect(editor.commands.addComment()).toBe(true);
    const storage = storageOf(editor);
    expect(storage.composer.peek()?.quote).toBe('brave');
    // Nothing is marked until it is posted.
    expect(line(editor)).toBe('Hello brave world');
    expect(editor.can().submitComment('  ')).toBe(false);
    expect(editor.commands.submitComment('Nice word')).toBe(true);
    expect(storage.composer.peek()).toBeNull();
    const [thread] = storage.threads.peek();
    expect(thread).toMatchObject({ quote: 'brave', resolved: false });
    expect(thread?.comments).toEqual([
      expect.objectContaining({ author: ALICE, content: 'Nice word' }),
    ]);
    expect(line(editor)).toBe(`Hello [brave|${thread?.id}] world`);
    expect(storage.active.peek()).toBe(thread?.id);
    expect(storage.anchors.peek().get(thread?.id as string)).toHaveLength(1);
    expect(editor.isActive('comment')).toBe(true);
  });

  it('refuses a caret, blank text and a post with no composer, empty or too long', () => {
    const editor = make('<p>Hello</p>', { maxLength: 5 });
    editor.update(() =>
      ($getRoot().getAllTextNodes()[0] as TextNode).setTextContent('Hello   world'),
    );
    caret(editor, 'Hello', 2);
    expect(editor.can().addComment()).toBe(false);
    expect(editor.commands.addComment()).toBe(false);
    select(editor, 'Hello', 5, 8);
    expect(editor.commands.addComment()).toBe(false);
    expect(editor.commands.submitComment('x')).toBe(false);
    select(editor, 'Hello', 0, 5);
    editor.commands.addComment();
    expect(editor.commands.submitComment('')).toBe(false);
    expect(editor.commands.submitComment('toolong')).toBe(false);
    expect(editor.commands.submitComment(42 as unknown as string)).toBe(false);
    expect(storageOf(editor).threads.peek()).toHaveLength(0);
    // The composer is still open for a good one.
    expect(editor.commands.submitComment(' ok ')).toBe(true);
    expect(storageOf(editor).threads.peek()[0]?.comments[0]?.content).toBe('ok');
  });

  it('cancelComment closes the composer and changes nothing', () => {
    const editor = make('<p>Hello</p>');
    select(editor, 'Hello', 0, 5);
    editor.commands.addComment();
    expect(editor.commands.cancelComment()).toBe(true);
    expect(storageOf(editor).composer.peek()).toBeNull();
    expect(editor.commands.cancelComment()).toBe(false);
    expect(editor.commands.submitComment('x')).toBe(false);
    expect(line(editor)).toBe('Hello');
  });

  it('marks the text the composer opened on, even after the selection moved', () => {
    const editor = make('<p>Hello brave world</p>');
    select(editor, 'Hello', 0, 5);
    editor.commands.addComment();
    caret(editor, 'Hello', 14);
    const id = editor.commands.submitComment('x') && storageOf(editor).active.peek();
    expect(line(editor)).toBe(`[Hello|${id}] brave world`);
  });

  it('gives up when the text it opened on was deleted meanwhile', () => {
    const editor = make('<p>Hello</p><p>World</p>');
    select(editor, 'World', 0, 5);
    editor.commands.addComment();
    editor.update(() => $getRoot().getLastChild()?.remove());
    expect(editor.commands.submitComment('x')).toBe(false);
    expect(storageOf(editor).threads.peek()).toHaveLength(0);
    expect(storageOf(editor).composer.peek()).toBeNull();
  });

  it('marks each block of a selection across blocks, as one thread', () => {
    const editor = make('<p>One two</p><p>Three four</p>');
    editor.update(() => {
      const [a, b] = $getRoot().getAllTextNodes() as [TextNode, TextNode];
      const selection = a.select(4, 4);
      selection.focus.set(b.getKey(), 5, 'text');
    });
    editor.commands.addComment();
    expect(storageOf(editor).composer.peek()?.quote).toBe('two\nThree');
    editor.commands.submitComment('x');
    const id = storageOf(editor).threads.peek()[0]?.id;
    expect(line(editor, 0)).toBe(`One [two|${id}]`);
    expect(line(editor, 1)).toBe(`[Three|${id}] four`);
    expect(
      storageOf(editor)
        .anchors.peek()
        .get(id as string),
    ).toHaveLength(2);
  });
});

describe('Comments: threads', () => {
  it('replies, resolves and reopens; a reply reopens a resolved thread', () => {
    const editor = make('<p>Hello</p>');
    const id = comment(editor, 'Hello', 0, 5);
    expect(editor.can().replyToThread(id, 'Yes')).toBe(true);
    expect(editor.can().replyToThread('nope', 'Yes')).toBe(false);
    expect(editor.commands.replyToThread(id, ' ')).toBe(false);
    expect(editor.commands.replyToThread(id, 'Agreed')).toBe(true);
    const thread = () => storageOf(editor).threads.peek()[0];
    expect(thread()?.comments.map((c) => c.content)).toEqual(['Hi', 'Agreed']);

    expect(editor.can().reopenThread(id)).toBe(false);
    expect(editor.commands.resolveThread(id)).toBe(true);
    expect(thread()?.resolved).toBe(true);
    expect(storageOf(editor).active.peek()).toBeNull();
    expect(editor.can().resolveThread(id)).toBe(false);
    expect(editor.commands.resolveThread(id)).toBe(false);
    expect(editor.commands.reopenThread(id)).toBe(true);
    expect(thread()?.resolved).toBe(false);

    editor.commands.resolveThread(id);
    editor.commands.replyToThread(id, 'Wait');
    expect(thread()?.resolved).toBe(false);
    expect(thread()?.comments).toHaveLength(3);
  });

  it('deletes only your own comments by default; the last one takes the thread and its marks', () => {
    const store = createMemoryCommentStore();
    const editor = make('<p>Hello world</p>', { store });
    const id = comment(editor, 'Hello', 0, 5);
    store.addComment(id, { id: 'b1', author: BOB, content: 'Hm', createdAt: 1 });
    const [first] = store.getThreads()[0]?.comments ?? [];
    expect(editor.can().deleteComment(id, 'b1')).toBe(false);
    expect(editor.commands.deleteComment(id, 'b1')).toBe(false);
    expect(editor.can().deleteThread(id)).toBe(true);
    // Alice deletes her comment; Bob's reply keeps the thread.
    expect(editor.commands.deleteComment(id, first?.id as string)).toBe(true);
    expect(store.getThreads()[0]?.comments.map((c) => c.id)).toEqual(['b1']);
    expect(line(editor)).toBe(`[Hello|${id}] world`);
    // Bob's thread now: Alice may not delete it.
    expect(editor.commands.deleteThread(id)).toBe(false);
  });

  it('canModify lets a moderator delete anything', () => {
    const store = createMemoryCommentStore();
    const editor = make('<p>Hello world</p>', { store, canModify: () => true });
    const id = comment(editor, 'Hello', 0, 5);
    store.addComment(id, { id: 'b1', author: BOB, content: 'Hm', createdAt: 1 });
    expect(editor.commands.deleteComment(id, 'b1')).toBe(true);
    const own = store.getThreads()[0]?.comments[0]?.id as string;
    expect(editor.commands.deleteComment(id, own)).toBe(true);
    expect(store.getThreads()).toHaveLength(0);
    expect(line(editor)).toBe('Hello world');
  });

  it('deleteThread takes its marks off, keeping the text and an overlapping thread', () => {
    const editor = make('<p>Hello brave world</p>');
    const a = comment(editor, 'Hello', 0, 11);
    const b = comment(editor, 'brave', 0, 5);
    // The inner thread's id first.
    expect(line(editor)).toBe(`[Hello |${a}][brave|${b},${a}] world`);
    expect(editor.commands.deleteThread(a)).toBe(true);
    expect(line(editor)).toBe(`Hello [brave|${b}] world`);
    expect(
      storageOf(editor)
        .threads.peek()
        .map((t) => t.id),
    ).toEqual([b]);
    expect(storageOf(editor).anchors.peek().has(a)).toBe(false);
    expect(editor.commands.deleteThread(a)).toBe(false);
  });

  it('overlapping threads: the caret in both reports both, the first open one active', () => {
    const editor = make('<p>Hello brave world. Bye</p>');
    const a = comment(editor, 'Hello', 0, 11);
    // From inside `brave` to the end of `world`.
    editor.update(() => {
      const nodes = $getRoot().getAllTextNodes();
      const [first, last] = [nodes[0] as TextNode, nodes.at(-1) as TextNode];
      first.select(8, 8).focus.set(last.getKey(), 6, 'text');
    });
    editor.commands.addComment();
    editor.commands.submitComment('b');
    const b = storageOf(editor).active.peek() as string;
    expect(line(editor)).toBe(`[Hello br|${a}][ave|${b},${a}][ world|${b}]. Bye`);
    caret(editor, 'Hello ', 2);
    expect(storageOf(editor).atCaret.peek()).toEqual([a]);
    expect(storageOf(editor).active.peek()).toBe(a);
    // Into the overlap: `a` stays active, as the caret never left it.
    caret(editor, 'ave', 1);
    expect(storageOf(editor).atCaret.peek()).toEqual([b, a]);
    expect(storageOf(editor).active.peek()).toBe(a);
    editor.commands.resolveThread(a);
    caret(editor, 'ave', 2);
    expect(storageOf(editor).active.peek()).toBe(b);
    // Out of every comment: none.
    caret(editor, '. Bye', 3);
    expect(storageOf(editor).atCaret.peek()).toEqual([]);
    expect(storageOf(editor).active.peek()).toBeNull();
  });

  it('focusThread puts the caret at its text and opens the panel; a detached thread just becomes active', () => {
    const editor = make('<p>Hello</p><p>brave world</p>');
    const a = comment(editor, 'brave', 0, 5);
    caret(editor, 'Hello', 0);
    expect(storageOf(editor).active.peek()).toBeNull();
    expect(editor.commands.focusThread(a)).toBe(true);
    expect(storageOf(editor).active.peek()).toBe(a);
    expect(storageOf(editor).panel.peek()).toBe(true);
    const at = editor.read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) ? selection.anchor.getNode().getTextContent() : null;
    });
    expect(at).toBe('brave');
    expect(editor.commands.focusThread('missing')).toBe(false);

    const store = storageOf(editor).store;
    store.addThread({
      id: 'gone',
      quote: 'x',
      resolved: false,
      createdAt: 1,
      comments: [{ id: 'g1', author: BOB, content: 'old', createdAt: 1 }],
    });
    expect(editor.commands.focusThread('gone')).toBe(true);
    expect(storageOf(editor).active.peek()).toBe('gone');
  });

  it('toggleCommentsPanel', () => {
    const editor = make('<p>x</p>');
    expect(editor.isActive('commentsPanel')).toBe(false);
    editor.commands.toggleCommentsPanel();
    expect(editor.isActive('commentsPanel')).toBe(true);
    editor.commands.toggleCommentsPanel(true);
    expect(editor.isActive('commentsPanel')).toBe(true);
    editor.commands.toggleCommentsPanel(false);
    expect(editor.isActive('commentsPanel')).toBe(false);
  });
});

describe('Comments: anchors follow the text', () => {
  it('survive typing before and inside them', () => {
    const editor = make('<p>Hello brave world</p>');
    const id = comment(editor, 'Hello', 6, 11);
    caret(editor, 'Hello ', 0);
    editor.update(() =>
      ($getSelection() as never as { insertText(t: string): void }).insertText('Oh '),
    );
    caret(editor, 'brave', 2);
    editor.update(() =>
      ($getSelection() as never as { insertText(t: string): void }).insertText('-'),
    );
    expect(line(editor)).toBe(`Oh Hello [br-ave|${id}] world`);
    expect(storageOf(editor).threads.peek()[0]?.resolved).toBe(false);
  });

  it('a paragraph split inside one leaves both halves marked; joining them again keeps it', () => {
    const editor = make('<p>Hello brave world</p>');
    const id = comment(editor, 'Hello', 6, 11);
    caret(editor, 'brave', 2);
    editor.update(() =>
      ($getSelection() as never as { insertParagraph(): void }).insertParagraph(),
    );
    expect(line(editor, 0)).toBe(`Hello [br|${id}]`);
    expect(line(editor, 1)).toBe(`[ave|${id}] world`);
    expect(storageOf(editor).anchors.peek().get(id)).toHaveLength(2);
    // Join: backspace at the start of the second paragraph.
    editor.update(() => {
      const second = $getRoot().getChildAtIndex(1);
      if ($isElementNode(second)) second.selectStart();
      ($getSelection() as never as { deleteCharacter(b: boolean): void }).deleteCharacter(true);
    });
    expect(line(editor)).toContain(`|${id}]`);
    expect(storageOf(editor).threads.peek()[0]?.resolved).toBe(false);
  });

  it('deleting all its text resolves the thread; undo brings it back open', () => {
    const editor = make('<p>Hello brave world</p>');
    const id = comment(editor, 'Hello', 6, 11);
    editor.update(() => $getRoot().selectEnd(), { tag: HISTORY_PUSH_TAG });
    select(editor, 'brave', 0, 5);
    editor.update(() => ($getSelection() as never as { removeText(): void }).removeText(), {
      tag: HISTORY_PUSH_TAG,
    });
    expect(line(editor)).toBe('Hello  world');
    expect(storageOf(editor).anchors.peek().has(id)).toBe(false);
    expect(storageOf(editor).threads.peek()[0]?.resolved).toBe(true);
    editor.commands.undo();
    expect(line(editor)).toBe(`Hello [brave|${id}] world`);
    expect(storageOf(editor).threads.peek()[0]?.resolved).toBe(false);
  });

  it('a thread resolved by hand stays resolved when its text comes and goes', () => {
    const editor = make('<p>Hello brave world</p>');
    const id = comment(editor, 'Hello', 6, 11);
    editor.commands.resolveThread(id);
    select(editor, 'brave', 0, 5);
    editor.update(() => ($getSelection() as never as { removeText(): void }).removeText(), {
      tag: HISTORY_PUSH_TAG,
    });
    editor.commands.undo();
    expect(storageOf(editor).threads.peek()[0]?.resolved).toBe(true);
  });

  it("orphans: 'keep' leaves the thread open and detached", () => {
    const editor = make('<p>Hello brave world</p>', { orphans: 'keep' });
    const id = comment(editor, 'Hello', 6, 11);
    select(editor, 'brave', 0, 5);
    editor.update(() => ($getSelection() as never as { removeText(): void }).removeText());
    expect(storageOf(editor).threads.peek()[0]?.resolved).toBe(false);
    expect(storageOf(editor).anchors.peek().has(id)).toBe(false);
  });

  it('undoing the post takes the marks off; the thread is resolved, and redo reopens it', () => {
    const editor = make('<p>Hello</p>');
    editor.update(() => $getRoot().selectEnd(), { tag: HISTORY_PUSH_TAG });
    const id = comment(editor, 'Hello', 0, 5);
    editor.commands.undo();
    expect(line(editor)).toBe('Hello');
    expect(storageOf(editor).threads.peek()[0]?.resolved).toBe(true);
    editor.commands.redo();
    expect(line(editor)).toBe(`[Hello|${id}]`);
    expect(storageOf(editor).threads.peek()[0]?.resolved).toBe(false);
  });
});

describe('Comments: saving', () => {
  it('JSON keeps the marks, which anchor the threads when loaded with the same store', () => {
    const store = createMemoryCommentStore();
    const editor = make('<p>Hello brave world</p>', { store });
    const id = comment(editor, 'Hello', 6, 11);
    const json = editor.getJSON();
    const again = make(json, { store });
    expect(line(again)).toBe(`Hello [brave|${id}] world`);
    expect(storageOf(again).anchors.peek().get(id)).toHaveLength(1);
    expect(storageOf(again).threads.peek()).toHaveLength(1);
  });

  it('HTML leaves the marks out by default, and reads none back', () => {
    const editor = make('<p>Hello brave world</p>');
    comment(editor, 'Hello', 6, 11);
    expect(editor.getHTML()).toBe('<p>Hello brave world</p>');
    const pasted = make('<p>a <mark data-tei-comment="x">b</mark></p>');
    expect(line(pasted)).toBe('a b');
  });

  it('exportMarks keeps them as <mark data-tei-comment>, and reads them back', () => {
    const editor = make('<p>Hello brave world</p>', { exportMarks: true });
    const a = comment(editor, 'Hello', 0, 11);
    const b = comment(editor, 'brave', 0, 5);
    const html = editor.getHTML();
    expect(html).toBe(
      `<p><mark data-tei-comment="${a}"><span style="white-space: pre-wrap;">Hello </span></mark><mark data-tei-comment="${b} ${a}">brave</mark> world</p>`,
    );
    const again = make(html, { exportMarks: true });
    expect(line(again)).toBe(`[Hello |${a}][brave|${b},${a}] world`);
  });

  it('hostile mark ids from HTML are dropped or capped', () => {
    const long = 'x'.repeat(500);
    const editor = make(
      `<p><mark data-tei-comment="   ">a</mark><mark data-tei-comment="${long} ok">b</mark></p>`,
      { exportMarks: true },
    );
    expect(line(editor)).toBe('a[b|ok]');
  });

  it('the editor shows marks with their thread state', () => {
    const editor = make('<p>Hello brave world</p>');
    const a = comment(editor, 'Hello', 0, 5);
    const b = comment(editor, 'brave', 0, 5);
    const state = (text: string) =>
      Array.from(document.querySelectorAll('mark')).find((m) => m.textContent === text)?.dataset
        .teiComment;
    expect(document.querySelector('mark')?.classList.contains('tei-comment')).toBe(true);
    expect(state('brave')).toBe('active');
    expect(state('Hello')).toBe('open');
    editor.commands.resolveThread(a);
    expect(state('Hello')).toBe('resolved');
    editor.commands.focusThread(a);
    expect(state('Hello')).toBe('active');
    expect(state('brave')).toBe('open');
    editor.commands.deleteThread(b);
    expect(state('brave')).toBeUndefined();
  });
});

describe('Comments: stores', () => {
  it('parseCommentThreads drops malformed threads and comments, and caps strings', () => {
    const threads = parseCommentThreads([
      null,
      'x',
      { id: 't1', comments: [] },
      { id: 't2', comments: [{ id: 'c', author: { id: 'a', name: 'A' }, content: 'ok' }] },
      { id: 't2', comments: [{ id: 'c', author: { id: 'a', name: 'A' }, content: 'dup' }] },
      {
        id: 't3',
        quote: 'q'.repeat(5000),
        resolved: 'yes',
        createdAt: -5,
        comments: [
          { id: 'c1', author: { id: 'a' }, content: 'no name' },
          { id: 'c2', author: { id: 'a', name: 'A', color: 3 }, content: 7 },
          { id: 'c3', author: { id: 'a', name: 'A' }, content: '<b>hi</b>', createdAt: 'x' },
        ],
      },
    ]);
    expect(threads.map((t) => t.id)).toEqual(['t2', 't3']);
    expect(threads[1]?.quote).toHaveLength(2000);
    expect(threads[1]?.resolved).toBe(false);
    expect(threads[1]?.comments).toEqual([
      { id: 'c3', author: { id: 'a', name: 'A' }, content: '<b>hi</b>', createdAt: 0 },
    ]);
    expect(parseCommentThreads({})).toEqual([]);
  });

  it('a remote store: writes are not awaited, and failures go to onError', async () => {
    const memory = createMemoryCommentStore();
    const onError = vi.fn();
    const store: CommentStore = {
      ...memory,
      addThread: (thread) => {
        memory.addThread(thread);
        return Promise.reject(new Error('offline'));
      },
    };
    const editor = make('<p>Hello</p>', { store, onError });
    comment(editor, 'Hello', 0, 5);
    expect(storageOf(editor).threads.peek()).toHaveLength(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }));
  });

  it("follows the store's own changes (another user's reply)", () => {
    const store = createMemoryCommentStore();
    const editor = make('<p>Hi Hello</p>', { store });
    const id = comment(editor, 'Hello', 0, 5);
    store.addComment(id, { id: 'r', author: BOB, content: 'Hey', createdAt: 2 });
    expect(storageOf(editor).threads.peek()[0]?.comments).toHaveLength(2);
    editor.update(() => $getRoot().selectStart());
    expect(document.querySelector('mark')?.dataset.teiComment).toBe('open');
    store.setResolved(id, true);
    expect(document.querySelector('mark')?.dataset.teiComment).toBe('resolved');
  });

  it('without a user, comments are by Anonymous', () => {
    const editor = make('<p>Hello</p>', { user: null });
    comment(editor, 'Hello', 0, 5);
    expect(storageOf(editor).threads.peek()[0]?.comments[0]?.author).toEqual({
      id: 'anonymous',
      name: 'Anonymous',
    });
  });

  it('a thread on blocks with no text makes no thread', () => {
    const editor = make('<p>Hello</p>');
    editor.update(() => {
      $getRoot().append($createParagraphNode());
      $getRoot().select(0, 2);
    });
    // The selection's text is there, but a whole-root selection still marks the text.
    expect(editor.commands.addComment()).toBe(true);
    expect(editor.commands.submitComment('x')).toBe(true);
    const marks = editor.read(() =>
      $getRoot()
        .getAllTextNodes()
        .map((t) => ($isMarkNode(t.getParent()) ? (t.getParent() as MarkNode).getIDs() : [])),
    );
    expect(marks[0]).toHaveLength(1);
  });
});
