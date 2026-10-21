import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { $getRoot, type ElementNode } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor, type TeiEditorOptions } from '../../src/index.js';
import { EditorProvider, EditorToolbar } from '../../src/react/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(options: Partial<TeiEditorOptions> = {}): TeiEditor {
  const editor = createTeiEditor({ extensions: [StarterKit], content: '<p>Hello</p>', ...options });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const ids = (toolbar: HTMLElement) =>
  Array.from(toolbar.children).map((el) =>
    el.getAttribute('role') === 'separator' ? '|' : (el.getAttribute('data-item') ?? '?'),
  );

function selectFirstBlock(editor: TeiEditor) {
  act(() => {
    editor.update(() => {
      const block = $getRoot().getFirstChild() as ElementNode;
      block.select(0, block.getChildrenSize());
    });
  });
}

describe('EditorToolbar', () => {
  it('lays out what the extensions contribute, by group', () => {
    const editor = make();
    render(<EditorToolbar editor={editor} />);
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    expect(ids(toolbar)).toEqual([
      'undo',
      'redo',
      '|',
      'blockType',
      '|',
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'highlight',
      'subscript',
      'superscript',
      'clearFormatting',
      '|',
      'bulletList',
      'orderedList',
      'checkList',
      '|',
      'link',
      '|',
      'align',
      'outdent',
      'indent',
    ]);
  });

  it('takes the editor from context', () => {
    const editor = make();
    render(
      <EditorProvider editor={editor}>
        <EditorToolbar />
      </EditorProvider>,
    );
    expect(screen.getByRole('toolbar')).toBeTruthy();
  });

  it('follows a layout, with custom controls and elements', () => {
    const editor = make();
    function WordCount({ editor: e }: { editor: TeiEditor }) {
      return <span data-item="words">{e.getText().split(/\s+/).length}</span>;
    }
    render(
      <EditorToolbar
        editor={editor}
        layout={[['bold', false, 'missing'], ['words', <i key="x" data-item="mine" />], []]}
        controls={{ words: WordCount }}
      />,
    );
    expect(ids(screen.getByRole('toolbar'))).toEqual(['bold', '|', 'words', 'mine']);
  });

  it('leaves out items the app hid', () => {
    const editor = make({ items: { bold: null, strike: null } });
    render(<EditorToolbar editor={editor} />);
    const shown = ids(screen.getByRole('toolbar'));
    expect(shown).not.toContain('bold');
    expect(shown).not.toContain('strike');
    expect(shown).toContain('italic');
  });

  it('lights up and disables buttons from the selection, and runs them', () => {
    const editor = make();
    render(<EditorToolbar editor={editor} />);
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold.getAttribute('aria-pressed')).toBe('false');
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    selectFirstBlock(editor);
    act(() => fireEvent.click(bold));
    expect(editor.getHTML()).toBe('<p><strong>Hello</strong></p>');
    expect(bold.getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('disables everything while read-only', () => {
    const editor = make({ editable: false });
    render(<EditorToolbar editor={editor} />);
    const toolbar = screen.getByRole('toolbar');
    const buttons = within(toolbar).getAllByRole('button') as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
    act(() => editor.setEditable(true));
    expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('shows the block type, and changes it from its menu', () => {
    const editor = make();
    render(<EditorToolbar editor={editor} />);
    selectFirstBlock(editor);
    const trigger = screen.getByRole('button', { name: 'Block type: Text' });
    act(() => fireEvent.click(trigger));
    const menu = screen.getByRole('menu', { name: 'Block type' });
    const current = within(menu).getByRole('menuitemcheckbox', { name: /Text/ });
    expect(current.getAttribute('aria-checked')).toBe('true');
    act(() => fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /Heading 2/ })));
    expect(editor.getHTML()).toBe('<h2>Hello</h2>');
    expect(screen.getByRole('button', { name: 'Block type: Heading 2' })).toBeTruthy();
  });

  it('aligns from one menu that shows the current alignment', () => {
    const editor = make();
    render(<EditorToolbar editor={editor} />);
    selectFirstBlock(editor);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Align: Align left' })));
    const menu = screen.getByRole('menu', { name: 'Align' });
    act(() => fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /center/i })));
    expect(editor.getHTML()).toBe('<p style="text-align: center;">Hello</p>');
    expect(screen.getByRole('button', { name: 'Align: Align center' })).toBeTruthy();
  });

  it('translates its own names', () => {
    const editor = make({
      messages: {
        'toolbar.label': 'Format',
        'toolbar.blockType': 'Style',
        'block.paragraph': 'Body',
      },
    });
    render(<EditorToolbar editor={editor} />);
    expect(screen.getByRole('toolbar', { name: 'Format' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Style: Body' })).toBeTruthy();
  });
});
