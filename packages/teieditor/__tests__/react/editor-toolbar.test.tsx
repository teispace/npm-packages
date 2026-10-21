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

/** What the toolbar shows, in order: entry ids, `|` for separators. */
const ids = (toolbar: HTMLElement) =>
  Array.from(toolbar.querySelectorAll(':scope > [data-tei-slot]:not([hidden]) > *'))
    .filter((el) => !el.matches('[popover]'))
    .map((el) =>
      el.getAttribute('role') === 'separator'
        ? '|'
        : (el.getAttribute('data-item') ?? el.getAttribute('data-tei-control') ?? '?'),
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

describe('EditorToolbar overflow', () => {
  /** Lay every box out 30px wide, in a toolbar `width` wide. */
  function layOut(width: number) {
    const rect = Element.prototype.getBoundingClientRect;
    const client = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
    Element.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 30, 30);
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get(this: Element) {
        return this.getAttribute('role') === 'toolbar' ? width : 0;
      },
    });
    return () => {
      Element.prototype.getBoundingClientRect = rect;
      if (client) Object.defineProperty(Element.prototype, 'clientWidth', client);
    };
  }

  const layout = [['bold', 'italic'], ['blockType'], ['strike', <span key="m" data-item="mine" />]];

  it('moves the least important into a More menu first, keeping elements', () => {
    const restore = layOut(180);
    try {
      const editor = make();
      render(<EditorToolbar editor={editor} layout={layout} />);
      // Six 30px slots: block type and bold outrank italic and strike.
      expect(ids(screen.getByRole('toolbar'))).toEqual([
        'bold',
        '|',
        'blockType',
        '|',
        'mine',
        'more',
      ]);
    } finally {
      restore();
    }
  });

  it('takes priorities from the app', () => {
    const restore = layOut(180);
    try {
      const editor = make();
      render(<EditorToolbar editor={editor} layout={layout} priorities={{ strike: 100 }} />);
      expect(ids(screen.getByRole('toolbar'))).toEqual([
        'blockType',
        '|',
        'strike',
        'mine',
        'more',
      ]);
    } finally {
      restore();
    }
  });

  it('runs the moved items from the menu, with their state, and controls as submenus', () => {
    const restore = layOut(150);
    try {
      const editor = make();
      render(<EditorToolbar editor={editor} layout={layout} priorities={{ blockType: 0 }} />);
      selectFirstBlock(editor);
      act(() => fireEvent.click(screen.getByRole('button', { name: 'More' })));
      const menu = screen.getByRole('menu', { name: 'More' });
      const block = within(menu).getByRole('menuitem', { name: /Block type/ });
      expect(block.getAttribute('aria-haspopup')).toBe('menu');
      const strike = within(menu).getByRole('menuitemcheckbox', { name: /Strikethrough/ });
      expect(strike.getAttribute('aria-checked')).toBe('false');
      act(() => fireEvent.click(strike));
      expect(editor.getHTML()).toBe('<p><s>Hello</s></p>');
      act(() => fireEvent.click(screen.getByRole('button', { name: 'More' })));
      expect(
        within(screen.getByRole('menu', { name: 'More' }))
          .getByRole('menuitemcheckbox', { name: /Strikethrough/ })
          .getAttribute('aria-checked'),
      ).toBe('true');
    } finally {
      restore();
    }
  });

  it('shows everything, with no More, when it all fits or another overflow is chosen', () => {
    const restore = layOut(1000);
    try {
      const editor = make();
      const { unmount } = render(<EditorToolbar editor={editor} layout={layout} />);
      expect(ids(screen.getByRole('toolbar'))).toEqual([
        'bold',
        'italic',
        '|',
        'blockType',
        '|',
        'strike',
        'mine',
      ]);
      unmount();
      render(<EditorToolbar editor={editor} layout={layout} overflow="wrap" />);
      expect(screen.getByRole('toolbar').querySelector('[data-tei-slot="more"]')).toBeNull();
    } finally {
      restore();
    }
  });

  it('skips moved buttons in the arrow-key order', () => {
    const restore = layOut(150);
    try {
      const editor = make();
      render(<EditorToolbar editor={editor} layout={layout} />);
      // Only the block type and More show; the element between them takes no focus.
      const block = screen.getByRole('button', { name: /Block type/ });
      block.focus();
      act(() => fireEvent.keyDown(block, { key: 'ArrowRight' }));
      expect(document.activeElement?.getAttribute('data-tei-control')).toBe('more');
    } finally {
      restore();
    }
  });
});
