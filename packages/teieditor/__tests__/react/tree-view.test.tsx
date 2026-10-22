import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import {
  getTreeViewStorage,
  TreeView as TreeViewExtension,
  type TreeViewOptions,
  type TreeViewStorage,
} from '../../src/extensions/tree-view/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';
import { TreeViewPanel } from '../../src/react/components/tree-view.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function make(options: Partial<TreeViewOptions> = { open: true }, withExtension = true) {
  const editor = createTeiEditor({
    extensions: withExtension ? [StarterKit, TreeViewExtension.configure(options)] : [StarterKit],
    content: '<p>One</p>',
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return { editor, storage: getTreeViewStorage(editor) as TreeViewStorage };
}

const add = (editor: TeiEditor, text: string) =>
  act(() => {
    editor.update(() => {
      $getRoot().append($createParagraphNode().append($createTextNode(text)));
    });
  });

const output = () => document.querySelector('.tei-tree-view-output')?.textContent ?? '';

describe('<TreeViewPanel>', () => {
  it('shows only while open, and opens from the command', async () => {
    const { editor } = make({ open: false });
    render(<TreeViewPanel editor={editor} />);
    expect(screen.queryByRole('region', { name: 'Node tree' })).toBeNull();
    act(() => {
      editor.commands.toggleTreeView();
    });
    expect(screen.getByRole('region', { name: 'Node tree' })).toBeTruthy();
    await waitFor(() => expect(output()).toContain('root'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Node tree' })).toBeNull();
    expect(editor.isActive('treeView')).toBe(false);
  });

  it('draws the live tree, with the selection and the commands run', async () => {
    const { editor } = make();
    render(<TreeViewPanel editor={editor} />);
    await waitFor(() => expect(output()).toContain('"One"'));
    add(editor, 'Two');
    await waitFor(() => expect(output()).toContain('"Two"'));
    expect(output()).toContain('selection');
    expect(output()).toContain('commands:');
  });

  it('switches views by tab, by click and by arrow keys', async () => {
    const { editor } = make();
    render(<TreeViewPanel editor={editor} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Tree', 'JSON', 'HTML']);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.tabIndex).toBe(0);
    expect(tabs[1]?.tabIndex).toBe(-1);
    fireEvent.click(tabs[1] as HTMLElement);
    await waitFor(() => expect(JSON.parse(output())).toEqual(editor.getJSON()));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'JSON' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'HTML' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'HTML' }));
    await waitFor(() => expect(output()).toBe('<p>One</p>'));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'HTML' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Tree' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Tree' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'HTML' }).getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(
      screen.getByRole('tab', { name: 'HTML' }).id,
    );
    expect(panel.tabIndex).toBe(0);
  });

  it('travels through the updates and back to now', async () => {
    const { editor, storage } = make();
    render(<TreeViewPanel editor={editor} defaultMode="html" />);
    add(editor, 'Two');
    add(editor, 'Three');
    fireEvent.click(screen.getByRole('button', { name: 'Time travel' }));
    expect(editor.isEditable).toBe(false);
    const slider = screen.getByRole('slider', { name: 'Update' }) as HTMLInputElement;
    const last = storage.history.value.length - 1;
    expect(Number(slider.value)).toBe(last);
    expect(slider.getAttribute('aria-valuetext')).toMatch(
      /^Update \d+ of \d+, \d\d:\d\d:\d\d\.\d{3}$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous update' }));
    expect(storage.travelling.value).toBe(last - 1);
    expect(editor.getText()).toBe('One\n\nTwo');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(storage.travelling.value).toBe(0);
    expect(screen.getByRole('button', { name: 'Previous update' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next update' }));
    expect(storage.travelling.value).toBe(1);
    await waitFor(() => expect(output()).toBe('<p>One</p>\n<p>Two</p>'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to now' }));
    expect(storage.travelling.value).toBeNull();
    expect(editor.isEditable).toBe(true);
    expect(editor.getText()).toBe('One\n\nTwo\n\nThree');
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('plays the updates back to the end', async () => {
    vi.useFakeTimers();
    try {
      const { editor, storage } = make();
      render(<TreeViewPanel editor={editor} defaultMode="json" />);
      add(editor, 'Two');
      add(editor, 'Three');
      fireEvent.click(screen.getByRole('button', { name: 'Time travel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      // At the end, so from the start.
      expect(storage.travelling.value).toBe(0);
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          vi.advanceTimersByTime(1_000);
        });
      }
      expect(storage.travelling.value).toBe(storage.history.value.length - 1);
      expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks before drawing a large tree', async () => {
    const { editor } = make({ open: true, largeTree: 2 });
    render(<TreeViewPanel editor={editor} />);
    await waitFor(() => expect(screen.getByText(/drawing its tree may be slow/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Show the tree' }));
    await waitFor(() => expect(output()).toContain('root'));
  });

  it('copies the view', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { editor } = make();
    render(<TreeViewPanel editor={editor} defaultMode="html" />);
    await waitFor(() => expect(output()).toBe('<p>One</p>'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith('<p>One</p>');
    expect(document.querySelector('.tei-tree-view [role="status"]')?.textContent).toBe('Copied');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('renders nothing without the extension', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { editor } = make({}, false);
    const { container } = render(<TreeViewPanel editor={editor} />);
    expect(container.innerHTML).toBe('');
    expect(warn).toHaveBeenCalled();
  });
});
