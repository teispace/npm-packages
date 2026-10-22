import { act, configure, fireEvent, render, screen } from '@testing-library/react';
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TeiEditor } from '../../src/core/editor.js';
import { Emoji, type EmojiStorage } from '../../src/extensions/emoji/index.js';
import { Mention, type MentionItem } from '../../src/extensions/mention/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import {
  createReactTeiEditor,
  EditorContent,
  EmojiPicker,
  TypeaheadMenu,
} from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
afterAll(() => configure({ defaultHidden: false }));
beforeAll(() => {
  // jsdom has no layout, so floating UI hides a list placed at a caret: query it anyway.
  configure({ defaultHidden: true });
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

const PEOPLE: MentionItem[] = [
  { id: 'u1', label: 'Ada Lovelace', description: 'Analyst', avatar: 'https://example.com/a.png' },
  { id: 'u2', label: 'Alan <b>Turing</b>', avatar: 'javascript:alert(1)' },
];

function setup(children: React.ReactNode) {
  const editor = createReactTeiEditor({
    extensions: [
      StarterKit,
      Emoji,
      Mention.configure({
        debounce: 0,
        search: (q) => PEOPLE.filter((p) => p.label.toLowerCase().startsWith(q.toLowerCase())),
      }),
    ],
    content: '<p><br></p>',
  });
  render(<EditorContent editor={editor}>{children}</EditorContent>);
  const root = editor.lexical.getRootElement() as HTMLElement;
  act(() => {
    root.focus();
    editor.update(() => $getRoot().selectEnd());
  });
  return { editor, root };
}

async function type(editor: TeiEditor, text: string) {
  for (const char of text) {
    await act(async () => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(char);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe('TypeaheadMenu', () => {
  it('lists people for `@`, as text; the document announces the lit row', async () => {
    const { editor, root } = setup(<TypeaheadMenu />);
    await type(editor, '@a');
    const list = screen.getByRole('listbox');
    expect(list.getAttribute('aria-label')).toBe('Mentions');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.querySelector('.tei-menu-item-label')?.textContent)).toEqual([
      'Ada Lovelace',
      'Alan <b>Turing</b>',
    ]);
    expect(options[0]?.querySelector('.tei-menu-item-description')?.textContent).toBe('Analyst');
    expect(list.querySelector('b')).toBeNull();
    // A safe avatar is drawn; an unsafe one falls back to an initial.
    const images = [...list.querySelectorAll('img')];
    expect(images.map((img) => img.getAttribute('src'))).toEqual(['https://example.com/a.png']);
    expect(root.getAttribute('aria-controls')).toBe(list.id);
    expect(root.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');

    act(() => {
      fireEvent.keyDown(root, { key: 'ArrowDown' });
    });
    expect(root.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
    act(() => {
      fireEvent.keyDown(root, { key: 'Enter' });
    });
    // Lexical commits a key's update a microtask later.
    await act(async () => {});
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(editor.getText()).toBe('@Alan <b>Turing</b> ');
    expect(root.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('a click picks; Escape closes for this trigger', async () => {
    const { editor, root } = setup(<TypeaheadMenu />);
    await type(editor, '@ad');
    act(() => {
      fireEvent.click(screen.getByRole('option'));
    });
    expect(editor.getText()).toBe('@Ada Lovelace ');
    await type(editor, '@al');
    expect(screen.getByRole('listbox')).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('listbox')).toBeNull();
    await type(editor, 'a');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(root.hasAttribute('aria-controls')).toBe(false);
  });

  it('says when no one matches', async () => {
    const { editor } = setup(<TypeaheadMenu />);
    await type(editor, '@zz');
    expect(screen.getByRole('listbox').textContent).toBe('No one found');
  });

  it('lists emoji with their glyphs', async () => {
    const { editor } = setup(<TypeaheadMenu />);
    await (editor.extension(Emoji)?.output.storage as EmojiStorage | undefined)?.load();
    await type(editor, ':tada');
    const list = screen.getByRole('listbox');
    expect(list.getAttribute('aria-label')).toBe('Emoji');
    expect(list.querySelector('.tei-typeahead-glyph')?.textContent).toBe('🎉');
    act(() => {
      fireEvent.keyDown(editor.lexical.getRootElement() as HTMLElement, { key: 'Tab' });
    });
    expect(editor.getText()).toBe('🎉');
  });
});

describe('EmojiPicker', () => {
  async function openPicker() {
    const setupResult = setup(<EmojiPicker />);
    const storage = setupResult.editor.extension(Emoji)?.output.storage as EmojiStorage;
    await act(async () => {
      await storage.load();
    });
    act(() => {
      setupResult.editor.commands.openEmojiPicker();
    });
    return { ...setupResult, storage };
  }

  it('opens for openEmojiPicker with the search focused; Enter picks the first match', async () => {
    const { editor } = await openPicker();
    const dialog = screen.getByRole('dialog', { name: 'Emoji' });
    const search = screen.getByRole('searchbox', { name: 'Search emoji' });
    expect(document.activeElement).toBe(search);
    expect(dialog.querySelectorAll('[data-category]').length).toBe(8);
    act(() => {
      fireEvent.change(search, { target: { value: 'rocket' } });
    });
    expect(dialog.querySelector('[data-emoji]')?.textContent).toBe('🚀');
    act(() => {
      fireEvent.keyDown(search, { key: 'Enter' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(editor.getText()).toBe('🚀');
  });

  it('arrow keys move through the grid with one tab stop; recent comes first', async () => {
    const { editor, storage } = await openPicker();
    const search = screen.getByRole('searchbox');
    act(() => {
      fireEvent.keyDown(search, { key: 'ArrowDown' });
    });
    const cells = () => [...document.querySelectorAll<HTMLElement>('[data-emoji]')];
    expect(document.activeElement).toBe(cells()[0]);
    expect(cells().filter((c) => c.tabIndex === 0)).toHaveLength(1);
    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    });
    expect(document.activeElement).toBe(cells()[1]);
    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    });
    expect(document.activeElement).toBe(cells()[9]);
    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
    });
    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
    });
    expect(document.activeElement).toBe(search);
    // Pick from the second category.
    act(() => {
      fireEvent.click(document.querySelector('[data-category="nature"]') as Element);
    });
    const dog = cells()[0] as HTMLElement;
    expect(dog.textContent).toBe('🐶');
    expect(dog.getAttribute('aria-label')).toBe('dog');
    act(() => {
      fireEvent.click(dog);
    });
    expect(editor.getText()).toBe('🐶');
    expect(storage.recent.value).toEqual(['🐶']);
    // Opened again, Recent is the first tab, and shown.
    act(() => {
      editor.commands.openEmojiPicker();
    });
    const tabs = [...document.querySelectorAll('[data-category]')];
    expect(tabs[0]?.getAttribute('data-category')).toBe('recent');
    expect(tabs[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(cells().map((c) => c.textContent)).toEqual(['🐶']);
  });

  it('Escape closes it and gives the document focus back', async () => {
    const { root } = await openPicker();
    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(root);
  });
});
