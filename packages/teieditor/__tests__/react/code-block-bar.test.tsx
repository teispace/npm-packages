import { $isCodeNode } from '@lexical/code-core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { $getRoot } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock } from '../../src/extensions/code-block/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor, type TeiEditorOptions } from '../../src/index.js';
import { CodeBlockBar } from '../../src/react/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function make(options: Partial<TeiEditorOptions> = {}): TeiEditor {
  const editor = createTeiEditor({
    extensions: [StarterKit],
    content: '<p>Intro</p><pre><code>let x = 1;</code></pre>',
    ...options,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/** The copy button's name. jsdom has no layout, so the bar counts as hidden to role queries. */
const copyLabel = () =>
  document.querySelector('[data-tei-control="code-copy"]')?.getAttribute('aria-label');

const codeElement = (editor: TeiEditor) =>
  editor.lexical.getRootElement()?.querySelector('.tei-code-block') as HTMLElement;

const language = (editor: TeiEditor) =>
  editor.read(() => {
    const code = $getRoot().getChildren().find($isCodeNode);
    return code?.getLanguage() ?? null;
  });

function hover(editor: TeiEditor) {
  act(() => {
    fireEvent.pointerOver(codeElement(editor).firstChild as Node);
  });
}

describe('CodeBlockBar', () => {
  it('shows on the block under the pointer, and goes when it leaves', () => {
    vi.useFakeTimers();
    const editor = make();
    render(<CodeBlockBar editor={editor} />);
    expect(screen.queryByRole('toolbar', { name: 'Code block' })).toBeNull();
    hover(editor);
    const bar = screen.getByRole('toolbar', { name: 'Code block' });
    expect(bar.textContent).toContain('Plain text');
    // Over a paragraph: no bar.
    act(() => {
      fireEvent.pointerOver(editor.lexical.getRootElement()?.querySelector('p') as Element);
    });
    expect(screen.queryByRole('toolbar', { name: 'Code block' })).toBeNull();
    hover(editor);
    act(() => {
      fireEvent.pointerLeave(editor.lexical.getRootElement() as Element);
    });
    // A moment to reach the bar before it goes.
    expect(screen.getByRole('toolbar', { name: 'Code block' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole('toolbar', { name: 'Code block' })).toBeNull();
  });

  it('a tap does not count as a hover', () => {
    const editor = make();
    render(<CodeBlockBar editor={editor} />);
    act(() => {
      fireEvent.pointerOver(codeElement(editor), { pointerType: 'touch' });
    });
    expect(screen.queryByRole('toolbar', { name: 'Code block' })).toBeNull();
  });

  it('changes the language of the block it is on', () => {
    const editor = make();
    render(<CodeBlockBar editor={editor} />);
    hover(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Language: Plain text' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Python' }));
    expect(language(editor)).toBe('py');
    expect(screen.getByRole('button', { name: 'Language: Python' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Language: Python' }));
    expect(screen.getByRole('menuitemradio', { name: 'Python' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Plain text' }));
    expect(language(editor)).toBeNull();
  });

  it('names a language by its alias, or by its id when the list lacks it', () => {
    const editor = make({
      content:
        '<pre data-language="javascript"><code>a</code></pre><pre data-language="elixir"><code>b</code></pre>',
    });
    render(<CodeBlockBar editor={editor} />);
    const [first, second] =
      editor.lexical.getRootElement()?.querySelectorAll('.tei-code-block') ?? [];
    act(() => {
      fireEvent.pointerOver(first as Element);
    });
    expect(screen.getByRole('button', { name: 'Language: JavaScript' })).toBeTruthy();
    act(() => {
      fireEvent.pointerOver(second as Element);
    });
    expect(screen.getByRole('button', { name: 'Language: elixir' })).toBeTruthy();
  });

  it('names a block by its own id before one that normalizes the same (Shiki’s tsx)', () => {
    const editor = make({ content: '<pre data-language="tsx"><code>a</code></pre>' });
    const languages = [
      ['typescript', 'TypeScript'],
      ['tsx', 'TSX'],
    ] as const;
    render(<CodeBlockBar editor={editor} languages={languages} />);
    hover(editor);
    expect(screen.getByRole('button', { name: 'Language: TSX' })).toBeTruthy();
  });

  it('copies the code, and says so for a moment', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const editor = make();
    render(<CodeBlockBar editor={editor} />);
    hover(editor);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    });
    expect(writeText).toHaveBeenCalledWith('let x = 1;');
    expect(copyLabel()).toBe('Copied');
    expect(
      document.querySelector('[data-tei-control="code-bar"] [role="status"]')?.textContent,
    ).toBe('Copied');
    // Its icons come from the editor, with or without a provider round it.
    expect(document.querySelector('[data-tei-control="code-copy"] svg')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(copyLabel()).toBe('Copy code');
  });

  it('falls back to the copy command where the Clipboard API is missing', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;
    const editor = make();
    render(<CodeBlockBar editor={editor} />);
    hover(editor);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    });
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copyLabel()).toBe('Copied');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('read-only: the language as a label, and the copy button', () => {
    const editor = make({ editable: false });
    render(<CodeBlockBar editor={editor} />);
    hover(editor);
    expect(screen.queryByRole('button', { name: /Language/ })).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Code block' }).textContent).toContain('Plain text');
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy();
  });

  it('follows the options: languages, and no copy button', () => {
    const editor = make({
      extensions: [
        StarterKit.configure({
          codeBlock: { languages: [['js', 'JS']], copyButton: false },
        }),
      ],
    });
    render(<CodeBlockBar editor={editor} />);
    hover(editor);
    expect(screen.queryByRole('button', { name: 'Copy code' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Language: Plain text' }));
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'Plain text',
      'JS',
    ]);
  });

  it('leaves Escape to the editor', () => {
    const editor = make();
    render(<CodeBlockBar editor={editor} />);
    hover(editor);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    codeElement(editor).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('renders nothing without CodeBlock', () => {
    const editor = make({
      extensions: [StarterKit.configure({ codeBlock: false, codeHighlight: false })],
      content: '<p>x</p>',
    });
    const { container } = render(<CodeBlockBar editor={editor} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('setCodeLanguage', () => {
  it('targets a block by key, or the selection', () => {
    const editor = make({ extensions: [StarterKit, CodeBlock] });
    const key = editor.read(() => $getRoot().getChildren().find($isCodeNode)?.getKey() as string);
    expect(editor.commands.setCodeLanguage('rust', key)).toBe(true);
    expect(language(editor)).toBe('rust');
    expect(editor.can().setCodeLanguage('rust', 'nope')).toBe(false);
    // The selection is in the paragraph: no block there.
    editor.update(() => $getRoot().getFirstChildOrThrow().selectStart());
    expect(editor.can().setCodeLanguage('rust')).toBe(false);
  });
});
