import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentActions } from '../../src/extensions/document-actions/index.js';
import { MarkdownSource } from '../../src/extensions/markdown-source/index.js';
import { Pages } from '../../src/extensions/pages/index.js';
import { ShowInvisibles } from '../../src/extensions/show-invisibles/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import type { TeiEditor } from '../../src/index.js';
import {
  createReactTeiEditor,
  DocumentMenu,
  type DocumentMenuProps,
  EditorContent,
} from '../../src/react/index.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const VIEWS = [MarkdownSource, ShowInvisibles, Pages, DocumentActions];

function open(extensions: unknown[] = VIEWS, props: Partial<DocumentMenuProps> = {}) {
  const editor = createReactTeiEditor({
    extensions: [StarterKit, ...(extensions as never[])],
    content: '<h1>Title</h1><p>Body</p>',
  });
  render(
    <EditorContent editor={editor}>
      <DocumentMenu {...props} />
    </EditorContent>,
  );
  return editor;
}

const button = () => screen.getByRole('button', { name: 'Document' });
const menu = () => screen.getByRole('menu', { name: 'Document' });
const row = (id: string) => menu().querySelector(`[data-id="${id}"]`) as HTMLElement;

describe('DocumentMenu', () => {
  it('lists the views as checkboxes, then import and export, then clearing', () => {
    open();
    fireEvent.click(button());
    expect(button().getAttribute('aria-expanded')).toBe('true');
    const sections = [...menu().querySelectorAll(':scope > [role="group"]')].map((group) =>
      [...group.querySelectorAll('[data-tei-part="menu-item"]')].map((r) =>
        r.getAttribute('data-id'),
      ),
    );
    expect(sections).toEqual([
      ['markdownSource', 'invisibles', 'pages', 'readOnly'],
      ['openFile', 'export'],
      ['clearDocument'],
    ]);
    expect(row('pages').getAttribute('role')).toBe('menuitemcheckbox');
    expect(row('pages').getAttribute('aria-checked')).toBe('false');
    expect(row('export').getAttribute('aria-haspopup')).toBe('menu');
    expect(row('clearDocument').getAttribute('data-variant')).toBe('danger');
  });

  it('toggles a view and shows it checked the next time', () => {
    const editor = open();
    fireEvent.click(button());
    fireEvent.click(row('markdownSource'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(editor.isActive('markdownSource')).toBe(true);
    fireEvent.click(button());
    expect(row('markdownSource').getAttribute('aria-checked')).toBe('true');
    // In the source, the rich exports are off; markdown is on.
    fireEvent.click(row('export'));
    const formats = screen.getByRole('menu', { name: 'Export' });
    expect(formats.querySelector('[data-id="export-html"]')?.getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(
      formats.querySelector('[data-id="export-markdown"]')?.hasAttribute('aria-disabled'),
    ).toBe(false);
  });

  it('read only keeps its own row and export usable, and greys out the rest', () => {
    const editor = open();
    act(() => editor.setEditable(false));
    fireEvent.click(button());
    expect(row('readOnly').getAttribute('aria-checked')).toBe('true');
    expect(row('readOnly').hasAttribute('aria-disabled')).toBe(false);
    expect(row('export').hasAttribute('aria-disabled')).toBe(false);
    expect(row('clearDocument').getAttribute('aria-disabled')).toBe('true');
    expect(row('openFile').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row('readOnly'));
    expect(editor.isEditable).toBe(true);
  });

  it('asks before clearing; Cancel keeps the document', () => {
    const editor = open();
    fireEvent.click(button());
    fireEvent.click(row('clearDocument'));
    const dialog = screen.getByRole('alertdialog', { name: 'Clear the whole document?' });
    expect(document.activeElement?.textContent).toBe('Cancel');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(dialog.isConnected).toBe(false);
    expect(editor.isEmpty).toBe(false);

    fireEvent.click(button());
    fireEvent.click(row('clearDocument'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear document' }));
    expect(editor.isEmpty).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows only what is installed, and nothing without document items', () => {
    open([ShowInvisibles]);
    fireEvent.click(button());
    expect(
      [...menu().querySelectorAll('[data-tei-part="menu-item"]')].map((r) =>
        r.getAttribute('data-id'),
      ),
    ).toEqual(['invisibles']);
    document.body.replaceChildren();
    open([]);
    expect(screen.queryByRole('button', { name: 'Document' })).toBeNull();
  });

  it('takes changes to its sections', () => {
    const run = vi.fn();
    open(VIEWS, {
      groups: (groups) => [
        { id: 'mine', items: [{ id: 'hello', label: 'Hello', onSelect: run }] },
        ...groups,
      ],
    });
    fireEvent.click(button());
    fireEvent.click(row('hello'));
    expect(run).toHaveBeenCalledOnce();
  });

  it('runs an export from its submenu', () => {
    const editor: TeiEditor = open();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(button());
    fireEvent.click(row('export'));
    fireEvent.click(
      screen
        .getByRole('menu', { name: 'Export' })
        .querySelector('[data-id="export-markdown"]') as Element,
    );
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('document.md');
  });
});
