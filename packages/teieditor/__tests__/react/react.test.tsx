import { RichTextExtension } from '@lexical/rich-text';
import { act, render } from '@testing-library/react';
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { defineTeiExtension, type TeiEditor } from '../../src/index.js';
import { EditorContent, useEditorState, useTeiEditor } from '../../src/react/index.js';

const Bold = defineTeiExtension({
  name: 'test/bold',
  dependencies: [RichTextExtension],
  commands: {
    toggleBold: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        selection.formatText('bold');
      },
    },
  },
  active: {
    bold: () => {
      const selection = $getSelection();
      return $isRangeSelection(selection) && selection.hasFormat('bold');
    },
  },
});

const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

function selectAll(editor: TeiEditor) {
  editor.update(() => {
    $getRoot().select(0, $getRoot().getChildrenSize());
  });
}

describe('useTeiEditor + <EditorContent>', () => {
  it('renders the content on the first render and keeps it editable', async () => {
    let editor!: TeiEditor;
    function App() {
      editor = useTeiEditor({ extensions: [Bold], content: 'Hello', contentFormat: 'text' });
      return <EditorContent editor={editor} placeholder="Write…" className="doc" />;
    }
    const { container } = render(<App />);
    await tick();
    const root = container.querySelector('[data-tei-content]');
    expect(root?.getAttribute('contenteditable')).toBe('true');
    expect(root?.textContent).toBe('Hello');
    expect(root?.hasAttribute('data-tei-empty')).toBe(false);
    expect(root?.getAttribute('aria-placeholder')).toBe('Write…');
    expect(root?.className).toBe('doc');
    expect(editor.lexical.getRootElement()).toBe(root);
  });

  it('marks an empty document, and shows read-only state', async () => {
    let editor!: TeiEditor;
    function App() {
      editor = useTeiEditor({ extensions: [Bold] });
      return <EditorContent editor={editor} placeholder="Write…" />;
    }
    const { container } = render(<App />);
    await tick();
    const root = container.querySelector('[data-tei-content]');
    expect(root?.hasAttribute('data-tei-empty')).toBe(true);
    act(() => editor.setEditable(false));
    expect(root?.getAttribute('contenteditable')).toBe('false');
    expect(root?.hasAttribute('data-tei-readonly')).toBe(true);
    expect(root?.getAttribute('aria-readonly')).toBe('true');
  });

  it('survives StrictMode and is destroyed after a real unmount', async () => {
    const onDestroy = vi.fn();
    let editor!: TeiEditor;
    function App() {
      editor = useTeiEditor({
        extensions: [Bold],
        content: 'Still here',
        contentFormat: 'text',
        onDestroy,
      });
      return <EditorContent editor={editor} />;
    }
    const { container, unmount } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await tick();
    expect(onDestroy).not.toHaveBeenCalled();
    expect(container.textContent).toBe('Still here');
    selectAll(editor);
    expect(editor.commands.toggleBold()).toBe(true);
    unmount();
    await tick();
    expect(onDestroy).toHaveBeenCalledOnce();
  });

  it('rebuilds the editor when deps change, destroying the old one', async () => {
    const destroyed: string[] = [];
    let setLabel!: (label: string) => void;
    function App() {
      const [label, set] = useState('a');
      setLabel = set;
      const editor = useTeiEditor(
        {
          extensions: [Bold],
          content: label,
          contentFormat: 'text',
          onDestroy: () => destroyed.push(label),
        },
        [label],
      );
      return <EditorContent editor={editor} />;
    }
    const { container } = render(<App />);
    await tick();
    act(() => setLabel('b'));
    await tick();
    expect(container.textContent).toBe('b');
    expect(destroyed).toEqual(['a']);
  });
});

describe('useEditorState', () => {
  it('re-renders only when the selected value changes', async () => {
    let editor!: TeiEditor;
    let renders = 0;
    function Indicator() {
      const bold = useEditorState((e) => e.isActive('bold'));
      renders++;
      return <span data-testid="bold">{String(bold)}</span>;
    }
    function App() {
      editor = useTeiEditor({ extensions: [Bold], content: 'abc', contentFormat: 'text' });
      return (
        <EditorContent editor={editor}>
          <Indicator />
        </EditorContent>
      );
    }
    const { getByTestId } = render(<App />);
    await tick();
    const before = renders;
    // Typing changes the document but not the bold state: no re-render.
    act(() => editor.setContent('abcd', 'text'));
    act(() => editor.setContent('abcde', 'text'));
    expect(renders).toBe(before);
    act(() => {
      selectAll(editor);
      editor.commands.toggleBold();
    });
    expect(getByTestId('bold').textContent).toBe('true');
    expect(renders).toBe(before + 1);
  });
});
