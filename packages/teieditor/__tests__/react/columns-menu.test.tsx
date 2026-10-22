import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Columns } from '../../src/extensions/columns/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { ColumnsMenu, createReactTeiEditor, EditorContent } from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

function open() {
  const editor = createReactTeiEditor({
    extensions: [StarterKit, Columns],
    content:
      '<div data-tei-columns="1fr 1fr"><div data-tei-column="1"><p>Left</p></div><div data-tei-column="1"><p>Right</p></div></div><p>After</p>',
  });
  render(
    <EditorContent editor={editor}>
      <ColumnsMenu />
    </EditorContent>,
  );
  const control = () => document.querySelector('[data-tei-columns-control]') as Element;
  const menu = () => {
    act(() => {
      fireEvent.click(control());
    });
    return screen.getByRole('menu', { name: 'Columns' });
  };
  return { editor, menu };
}

describe('ColumnsMenu', () => {
  it('opens from the control with the layout checked; picking one changes it', () => {
    const { editor, menu } = open();
    expect(screen.queryByRole('menu')).toBeNull();
    const radios = [...menu().querySelectorAll('[role="menuitemradio"]')];
    expect(radios.map((r) => r.textContent)).toEqual([
      '2 columns',
      '2 columns: narrow, wide',
      '2 columns: wide, narrow',
      '3 columns',
      '3 columns: wide middle',
      '4 columns',
    ]);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
    act(() => {
      fireEvent.click(radios[4] as Element);
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(editor.getHTML()).toMatch(/^<div data-tei-columns="1fr 2fr 1fr">/);
  });

  it('adds and deletes columns, and turns them back into blocks', () => {
    const { editor, menu } = open();
    const pick = (name: string) => {
      const item = [...menu().querySelectorAll('[role="menuitem"]')].find(
        (el) => el.textContent === name,
      );
      act(() => {
        fireEvent.click(item as Element);
      });
    };
    // The menu puts the caret in the first column: the new one goes after it.
    pick('Add column');
    expect(editor.getHTML()).toBe(
      '<div data-tei-columns="1fr 1fr 1fr"><div data-tei-column="1"><p>Left</p></div><div data-tei-column="1"><p><br></p></div><div data-tei-column="1"><p>Right</p></div></div><p>After</p>',
    );
    pick('Delete column');
    expect(editor.getHTML()).toMatch(/^<div data-tei-columns="1fr 1fr">.*Left.*Right/);
    pick('Turn into blocks');
    expect(editor.getHTML()).toBe('<p>Left</p><p>Right</p><p>After</p>');
  });
});
