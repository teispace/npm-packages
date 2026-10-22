import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { $getRoot, CONTROLLED_TEXT_INSERTION_COMMAND, type TextNode } from 'lexical';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Comments, type CommentsOptions } from '../../src/extensions/comments/index.js';
import { Review } from '../../src/extensions/review/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import {
  CommentComposer,
  CommentsPanel,
  createReactTeiEditor,
  EditorContent,
  SuggestionPopover,
} from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

const ALICE = { id: 'alice', name: 'Alice Liddell' };

function open(content: string, options: Partial<CommentsOptions> = {}, review = false) {
  const editor = createReactTeiEditor({
    extensions: [
      StarterKit,
      Comments.configure({ user: ALICE, ...options }),
      ...(review ? [Review.configure({ user: ALICE, suggesting: true })] : []),
    ],
    content,
  });
  render(
    <>
      <EditorContent editor={editor}>
        <CommentComposer />
        {review && <SuggestionPopover />}
      </EditorContent>
      <CommentsPanel editor={editor} />
    </>,
  );
  return editor;
}

const select = (editor: ReturnType<typeof open>, from: number, to: number) =>
  act(() => {
    editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).select(from, to));
  });

const panel = () => document.querySelector('.tei-comments-panel') as HTMLElement;

function post(editor: ReturnType<typeof open>, text: string) {
  act(() => {
    editor.commands.addComment();
  });
  const field = screen.getByRole('textbox', { name: 'Add a comment…' });
  act(() => {
    fireEvent.change(field, { target: { value: text } });
    fireEvent.submit(field.closest('form') as HTMLFormElement);
  });
}

describe('CommentComposer', () => {
  it('opens on the selection with its quote, and posts the comment', () => {
    const editor = open('<p>Hello brave world</p>');
    select(editor, 6, 11);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      editor.commands.addComment();
    });
    const dialog = screen.getByRole('dialog', { name: 'Comment' });
    expect(within(dialog).getByText('brave')).toBeTruthy();
    expect(within(dialog).getByText('Alice Liddell')).toBeTruthy();
    expect(within(dialog).getByText('AL')).toBeTruthy();
    const field = within(dialog).getByRole('textbox');
    expect(document.activeElement).toBe(field);
    // Nothing to post yet.
    expect(within(dialog).getByRole('button', { name: 'Comment' })).toHaveProperty(
      'disabled',
      true,
    );
    act(() => {
      fireEvent.change(field, { target: { value: 'Why brave?' } });
      fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    });
    expect(screen.queryByRole('dialog', { name: 'Comment' })).toBeNull();
    expect(document.querySelector('mark.tei-comment')?.textContent).toBe('brave');
    // The panel opened on it.
    expect(panel().hidden).toBe(false);
    expect(within(panel()).getByText('Why brave?')).toBeTruthy();
  });

  it('Escape closes it and posts nothing', () => {
    const editor = open('<p>Hello</p>');
    select(editor, 0, 5);
    act(() => {
      editor.commands.addComment();
    });
    act(() => {
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Add a comment…' }), {
        key: 'Escape',
      });
    });
    expect(screen.queryByRole('dialog', { name: 'Comment' })).toBeNull();
    expect(document.querySelector('mark')).toBeNull();
  });

  it('says when a comment is too long', () => {
    const editor = open('<p>Hello</p>', { maxLength: 3 });
    select(editor, 0, 5);
    act(() => {
      editor.commands.addComment();
    });
    const field = screen.getByRole('textbox', { name: 'Add a comment…' });
    act(() => {
      fireEvent.change(field, { target: { value: 'four' } });
    });
    expect(screen.getByText('Comments are limited to 3 characters.')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('CommentsPanel', () => {
  it('is hidden until opened, and Escape closes it', () => {
    const editor = open('<p>Hello</p>');
    expect(panel().hidden).toBe(true);
    act(() => {
      editor.commands.toggleCommentsPanel();
    });
    expect(panel().hidden).toBe(false);
    expect(within(panel()).getByText(/No comments yet/)).toBeTruthy();
    act(() => {
      fireEvent.keyDown(within(panel()).getByRole('button', { name: 'Close comments' }), {
        key: 'Escape',
      });
    });
    expect(panel().hidden).toBe(true);
  });

  it('replies, resolves and reopens, filtering open and resolved threads', () => {
    const editor = open('<p>Hello brave world</p>');
    select(editor, 6, 11);
    post(editor, 'First');
    const reply = within(panel()).getByRole('textbox', { name: 'Reply…' });
    act(() => {
      fireEvent.change(reply, { target: { value: 'Second' } });
    });
    act(() => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Reply' }));
    });
    expect(within(panel()).getByText('Second')).toBeTruthy();
    expect(within(panel()).getAllByRole('listitem').length).toBeGreaterThan(2);

    act(() => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Resolve' }));
    });
    expect(document.querySelector('mark')?.dataset.teiComment).toBe('resolved');
    expect(
      within(panel()).getByText('No comments yet. Select text and press Comment to start one.'),
    ).toBeTruthy();
    act(() => {
      fireEvent.click(within(panel()).getByRole('button', { name: /^Resolved/ }));
    });
    expect(within(panel()).getByText('First')).toBeTruthy();
    act(() => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Reopen' }));
    });
    act(() => {
      fireEvent.click(within(panel()).getByRole('button', { name: /^Open/ }));
    });
    expect(within(panel()).getByText('First')).toBeTruthy();
  });

  it('a click on the quote goes to the text and marks the thread', () => {
    const editor = open('<p>Hello brave world</p>');
    select(editor, 0, 5);
    post(editor, 'On hello');
    select(editor, 0, 0);
    act(() => {
      editor.update(() => $getRoot().selectEnd());
    });
    const quote = within(panel()).getByRole('button', { name: 'Hello' });
    act(() => {
      fireEvent.click(quote);
    });
    expect(quote.getAttribute('aria-current')).toBe('true');
    expect(document.querySelector('mark')?.dataset.teiComment).toBe('active');
  });

  it('deletes a thread after a confirmation, keeping the text', () => {
    const editor = open('<p>Hello brave world</p>');
    select(editor, 6, 11);
    post(editor, 'Gone soon');
    act(() => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Delete thread' }));
    });
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    expect(within(dialog).getByText('Delete this thread and all its replies?')).toBeTruthy();
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    });
    expect(document.querySelector('mark')).toBeNull();
    expect(editor.getText()).toBe('Hello brave world');
    expect(within(panel()).queryByText('Gone soon')).toBeNull();
  });

  it('offers to delete only your own comments', () => {
    const editor = open('<p>Hello</p>');
    select(editor, 0, 5);
    post(editor, 'Mine');
    const storage = (
      editor.extension('@teispace/teieditor/comments') as {
        output: {
          storage: {
            store: { addComment: (t: string, c: object) => void };
            threads: { peek(): { id: string }[] };
          };
        };
      }
    ).output.storage;
    const threadId = storage.threads.peek()[0]?.id as string;
    act(() => {
      storage.store.addComment(threadId, {
        id: 'b',
        author: { id: 'bob', name: 'Bob' },
        content: 'Not yours',
        createdAt: Date.now() - 3 * 60_000,
      });
    });
    expect(within(panel()).getAllByRole('button', { name: 'Delete comment' })).toHaveLength(1);
    expect(within(panel()).getByText('3 minutes ago')).toBeTruthy();
  });

  it('lists suggestions to accept or reject, with Review', () => {
    const editor = open('<p>Hello</p>', {}, true);
    select(editor, 5, 5);
    act(() => {
      editor.update(() => {
        editor.lexical.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, '!');
      });
    });
    act(() => {
      editor.commands.toggleCommentsPanel(true);
    });
    act(() => {
      fireEvent.click(within(panel()).getByRole('button', { name: /^Suggestions/ }));
    });
    expect(within(panel()).getByText('Added')).toBeTruthy();
    act(() => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Accept' }));
    });
    expect(editor.getHTML()).toBe('<p>Hello!</p>');
    expect(within(panel()).getByText('No suggestions.')).toBeTruthy();
  });
});

describe('SuggestionPopover', () => {
  it('shows who suggested the change at the caret, with Accept and Reject', () => {
    const editor = open('<p>Hello</p>', {}, true);
    select(editor, 5, 5);
    act(() => {
      editor.update(() => {
        editor.lexical.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, '!');
      });
      editor.focus();
    });
    const bar = screen.getByRole('group', { name: 'Suggestion' });
    expect(within(bar).getByText('Alice Liddell')).toBeTruthy();
    expect(within(bar).getByText('Added')).toBeTruthy();
    act(() => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Reject' }));
    });
    expect(editor.getText()).toBe('Hello');
    expect(screen.queryByRole('group', { name: 'Suggestion' })).toBeNull();
  });
});
