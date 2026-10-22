import { act, fireEvent, render, screen } from '@testing-library/react';
import { $getRoot } from 'lexical';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Card } from '../../src/extensions/card/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { StickyNote } from '../../src/extensions/sticky-note/index.js';
import {
  ContextMenu,
  createReactTeiEditor,
  EditorContent,
  StickyMenu,
} from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

function open() {
  const editor = createReactTeiEditor({
    extensions: [StarterKit, StickyNote],
    content: '<aside data-tei-sticky="pink"><p>Call Sam</p></aside><p>After</p>',
  });
  render(
    <EditorContent editor={editor}>
      <StickyMenu />
    </EditorContent>,
  );
  const swatch = () => document.querySelector('[data-tei-sticky-swatch]') as Element;
  const color = () => document.querySelector('.tei-sticky')?.getAttribute('data-color');
  return { editor, swatch, color };
}

describe('StickyMenu', () => {
  it('opens from the swatch with the colour checked, each row with its swatch', () => {
    const { swatch, color } = open();
    expect(screen.queryByRole('menu')).toBeNull();
    act(() => {
      fireEvent.click(swatch());
    });
    const menu = screen.getByRole('menu', { name: 'Note colour' });
    const radios = [...menu.querySelectorAll('[role="menuitemradio"]')];
    expect(radios.map((r) => r.textContent)).toEqual(['Yellow', 'Pink', 'Green', 'Blue', 'Purple']);
    expect(radios[1]?.getAttribute('aria-checked')).toBe('true');
    expect(
      radios.map((r) => r.querySelector('.tei-menu-swatch')?.getAttribute('data-tei-sticky-color')),
    ).toEqual(['yellow', 'pink', 'green', 'blue', 'purple']);
    act(() => {
      fireEvent.click(radios[3] as Element);
    });
    expect(color()).toBe('blue');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('takes the note away, keeping its lines', () => {
    const { editor, swatch } = open();
    act(() => {
      fireEvent.click(swatch());
    });
    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove sticky note' }));
    });
    expect(editor.getHTML()).toBe('<p>Call Sam</p><p>After</p>');
  });
});

describe('ContextMenu in cards and notes', () => {
  it('has the card’s looks and the note’s colours as submenus, only where they apply', () => {
    const editor = createReactTeiEditor({
      extensions: [StarterKit, StickyNote, Card],
      content:
        '<div data-tei-card="default"><aside data-tei-sticky="yellow"><p>In</p></aside></div><p>Out</p>',
    });
    render(
      <EditorContent editor={editor}>
        <ContextMenu />
      </EditorContent>,
    );
    const rightClick = (text: string) => {
      const target = [...document.querySelectorAll('[data-tei-content] p')].find(
        (p) => p.textContent === text,
      ) as Element;
      act(() => {
        // The caret in the text, as a right-click there leaves it.
        editor.update(() => {
          $getRoot()
            .getAllTextNodes()
            .find((t) => t.getTextContent() === text)
            ?.select(1, 1);
        });
        fireEvent.contextMenu(target, { clientX: 0, clientY: 0 });
      });
      return [...document.querySelectorAll('[role="menu"] [data-id]')].map((el) =>
        el.getAttribute('data-id'),
      );
    };
    const inside = rightClick('In');
    expect(inside).toContain('cardMenu');
    expect(inside).toContain('stickyMenu');
    act(() => {
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    });
    const outside = rightClick('Out');
    expect(outside).not.toContain('cardMenu');
    expect(outside).not.toContain('stickyMenu');
  });
});
