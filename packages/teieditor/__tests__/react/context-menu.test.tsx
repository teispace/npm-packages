import { act, fireEvent, render, screen } from '@testing-library/react';
import { $getRoot } from 'lexical';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { Table } from '../../src/extensions/table/index.js';
import type { TeiEditor } from '../../src/index.js';
import {
  ContextMenu,
  type ContextMenuProps,
  createReactTeiEditor,
  EditorContent,
} from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
// jsdom lays nothing out: ranges have no box of their own.
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

function App({ editor, groups }: { editor: TeiEditor; groups?: ContextMenuProps['groups'] }) {
  return (
    <EditorContent editor={editor}>
      <ContextMenu groups={groups} />
    </EditorContent>
  );
}

function open(groups?: ContextMenuProps['groups']) {
  const editor = createReactTeiEditor({ extensions: [StarterKit, Table], content: '<p>Hello</p>' });
  render(<App editor={editor} groups={groups} />);
  const root = screen.getByRole('textbox');
  return { editor, root };
}

const rightClick = (target: Element, init: MouseEventInit = {}) => {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

describe('ContextMenu', () => {
  it('opens on right-click instead of the browser’s, with the clipboard first', () => {
    const { root } = open();
    expect(screen.queryByRole('menu')).toBeNull();
    const event = rightClick(root.querySelector('p') as Element, { clientX: 4, clientY: 4 });
    expect(event.defaultPrevented).toBe(true);
    const menu = screen.getByRole('menu', { name: 'Edit' });
    const rows = [...menu.querySelectorAll('[data-tei-part="menu-item"]')].map((row) =>
      row.getAttribute('data-id'),
    );
    expect(rows.slice(0, 4)).toEqual(['cut', 'copy', 'paste', 'pastePlain']);
    // Nothing selected: nothing to cut or copy, greyed rather than gone.
    expect(menu.querySelector('[data-id="copy"]')?.getAttribute('aria-disabled')).toBe('true');
    // Not in a link or a table: those stay out.
    expect(menu.querySelector('[data-id="unsetLink"]')).toBeNull();
    expect(menu.querySelector('[data-id="table"]')).toBeNull();
    expect(menu.querySelector('[data-id="turnInto"]')).not.toBeNull();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('leaves Shift-right-click, and a read-only editor, to the browser', () => {
    const { editor, root } = open();
    expect(rightClick(root, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
    act(() => editor.setEditable(false));
    expect(rightClick(root).defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('in a table: its rows and columns, in a submenu of their own', () => {
    const { editor, root } = open();
    act(() => {
      editor.update(() => $getRoot().selectEnd());
      editor.commands.insertTable(2, 2);
    });
    rightClick(root.querySelector('td') as Element);
    const table = screen.getByRole('menu', { name: 'Edit' }).querySelector('[data-id="table"]');
    expect(table?.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(table as Element);
    const sub = screen.getByRole('menu', { name: 'Table' });
    expect(sub.querySelectorAll('[role="group"]').length).toBeGreaterThan(1);
    expect(sub.querySelector('[data-id="deleteTable"]')?.getAttribute('data-variant')).toBe(
      'danger',
    );
  });

  it('is yours to change as it opens', () => {
    const { root } = open((groups) => [
      { id: 'mine', items: [{ id: 'hello', label: 'Say hello' }] },
      ...groups.filter((group) => group.id !== 'clipboard'),
    ]);
    rightClick(root);
    const menu = screen.getByRole('menu', { name: 'Edit' });
    expect(menu.querySelector('[data-id="hello"]')?.textContent).toContain('Say hello');
    expect(menu.querySelector('[data-id="cut"]')).toBeNull();
  });
});
