import { act, fireEvent, render, screen } from '@testing-library/react';
import { $getSelection } from 'lexical';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FindReplace, type FindReplaceStorage } from '../../src/extensions/find-replace/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createReactTeiEditor, EditorContent, FindReplaceBar } from '../../src/react/index.js';

class FakeHighlight extends Set<Range> {
  priority = 0;
}

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  const g = globalThis as Record<string, unknown>;
  g.Highlight = FakeHighlight;
  g.CSS = { ...((g.CSS as object) ?? {}), highlights: new Map() };
});

function setup(content = '<p>one cat, two cats</p><p>cat</p>', editable = true) {
  const editor = createReactTeiEditor({ extensions: [StarterKit, FindReplace], content, editable });
  render(
    <EditorContent editor={editor}>
      <FindReplaceBar />
    </EditorContent>,
  );
  const storage = editor.extension(FindReplace)?.output.storage as FindReplaceStorage;
  const bar = () => document.querySelector('[data-tei-control="find-replace"]');
  const field = () => screen.getByLabelText('Find') as HTMLInputElement;
  const status = () => document.querySelector('.tei-find-status')?.textContent;
  return { editor, storage, bar, field, status };
}

const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    fireEvent.change(input, { target: { value } });
  });

describe('FindReplaceBar', () => {
  it('opens for ⌘F with the field focused, and counts as you type', () => {
    const { editor, bar, field, status } = setup();
    expect(bar()).toBeNull();
    act(() => {
      editor.commands.openFind();
    });
    expect(bar()?.getAttribute('role')).toBe('search');
    expect(document.activeElement).toBe(field());
    type(field(), 'cat');
    expect(status()).toBe('1 of 3');
    expect(document.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    type(field(), 'dog');
    expect(status()).toBe('No results');
  });

  it('Enter and ⇧Enter step, and focus stays in the field', () => {
    const { editor, field, status } = setup();
    act(() => {
      editor.commands.openFind();
    });
    type(field(), 'cat');
    act(() => {
      fireEvent.keyDown(field(), { key: 'Enter' });
    });
    expect(status()).toBe('2 of 3');
    act(() => {
      fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
      fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    });
    expect(status()).toBe('3 of 3');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    });
    expect(status()).toBe('1 of 3');
    expect(document.activeElement).toBe(field());
  });

  it('toggles are pressed buttons, by click or ⌥C ⌥W ⌥R', () => {
    const { editor, storage, field, status } = setup('<p>Cat cat concat</p>');
    act(() => {
      editor.commands.openFind();
    });
    type(field(), 'cat');
    expect(status()).toBe('1 of 3');
    const matchCase = screen.getByRole('button', { name: 'Match case' });
    expect(matchCase.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      fireEvent.click(matchCase);
    });
    expect(matchCase.getAttribute('aria-pressed')).toBe('true');
    expect(status()).toBe('1 of 2');
    act(() => {
      fireEvent.keyDown(field(), { key: 'ω', code: 'KeyW', altKey: true });
    });
    expect(
      screen.getByRole('button', { name: 'Match whole word' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(status()).toBe('1 of 1');
    act(() => {
      fireEvent.keyDown(field(), { key: '®', code: 'KeyR', altKey: true });
    });
    expect(storage.options.value.regex).toBe(true);
    type(field(), 'c(');
    expect(status()).toBe('Invalid regular expression');
    expect(field().getAttribute('aria-invalid')).toBe('true');
  });

  it('the replace row: expand, replace one, replace all', () => {
    const { editor, field, status } = setup();
    act(() => {
      editor.commands.openFind();
    });
    type(field(), 'cat');
    const toggle = screen.getByRole('button', { name: 'Toggle replace' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const replace = screen.getByLabelText('Replace with') as HTMLInputElement;
    expect(document.activeElement).toBe(replace);
    type(replace, 'dog');
    act(() => {
      fireEvent.keyDown(replace, { key: 'Enter' });
    });
    expect(editor.getText()).toBe('one dog, two cats\n\ncat');
    expect(status()).toBe('1 of 2');
    expect(document.activeElement).toBe(replace);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
    });
    expect(editor.getText()).toBe('one dog, two dogs\n\ndog');
    expect(status()).toBe('No results');
  });

  it('⌘⌥F opens the replace row; ⌘F in the bar selects the field', () => {
    const { editor, field } = setup();
    act(() => {
      editor.commands.openFind();
    });
    type(field(), 'cat');
    act(() => {
      fireEvent.keyDown(field(), { key: 'ƒ', code: 'KeyF', metaKey: true, altKey: true });
    });
    expect(document.activeElement).toBe(screen.getByLabelText('Replace with'));
    const event = new KeyboardEvent('keydown', {
      key: 'f',
      code: 'KeyF',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      screen.getByLabelText('Replace with').dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field());
  });

  it('Escape closes and selects the current match in the document', () => {
    const { editor, bar, field } = setup();
    act(() => {
      editor.commands.openFind();
    });
    type(field(), 'cats');
    act(() => {
      fireEvent.keyDown(field(), { key: 'Escape' });
    });
    expect(bar()).toBeNull();
    expect(editor.read(() => $getSelection()?.getTextContent())).toBe('cats');
    expect(document.activeElement).toBe(editor.lexical.getRootElement());
  });

  it('the close button closes it', () => {
    const { editor, bar } = setup();
    act(() => {
      editor.commands.openFind();
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(bar()).toBeNull();
  });

  it('read-only: no replace row', () => {
    const { editor } = setup('<p>cat</p>', false);
    act(() => {
      editor.commands.openReplace();
    });
    expect(screen.queryByRole('button', { name: 'Toggle replace' })).toBeNull();
    expect(screen.queryByLabelText('Replace with')).toBeNull();
  });

  it('warns and renders nothing without the extension', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = createReactTeiEditor({ extensions: [StarterKit] });
    render(
      <EditorContent editor={editor}>
        <FindReplaceBar />
      </EditorContent>,
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
