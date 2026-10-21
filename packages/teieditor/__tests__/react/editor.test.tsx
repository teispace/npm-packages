import { act, render, screen } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bold } from '../../src/extensions/formatting/index.js';
import { RichText } from '../../src/extensions/rich-text/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import type { TeiEditor } from '../../src/index.js';
import {
  createReactTeiEditor,
  Editor,
  EditorToolbar,
  useCurrentEditor,
} from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());

const typeText = (editor: TeiEditor, text: string) =>
  act(() => {
    editor.update(() => {
      $getRoot()
        .clear()
        .append($createParagraphNode().append($createTextNode(text)));
    });
  });

describe('Editor', () => {
  it('is the whole editor with StarterKit by default', () => {
    const { container } = render(<Editor content="<p>Hi</p>" placeholder="Write…" />);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.classList.contains('tei')).toBe(true);
    expect(frame.hasAttribute('data-tei-bordered')).toBe(true);
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeTruthy();
    const doc = screen.getByRole('textbox');
    expect(doc.textContent).toBe('Hi');
    expect(doc.getAttribute('aria-placeholder')).toBe('Write…');
  });

  it('presets and slots choose the parts', () => {
    const { rerender } = render(<Editor preset="notion" />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    rerender(
      <Editor key="b" slots={{ toolbar: <nav>mine</nav>, footer: <footer>42 words</footer> }} />,
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getByText('mine')).toBeTruthy();
    expect(screen.getByText('42 words')).toBeTruthy();
    rerender(<Editor key="c" slots={{ toolbar: false }} bordered={false} colorScheme="dark" />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    const frame = document.querySelector('.tei') as HTMLElement;
    expect(frame.hasAttribute('data-tei-bordered')).toBe(false);
    expect(frame.dataset.theme).toBe('dark');
  });

  it('reports changes in the chosen format, and not selection moves', () => {
    const onChange = vi.fn();
    const editor = createReactTeiEditor({ extensions: [RichText, Bold] });
    render(<Editor editor={editor} onChange={onChange} format="html" />);
    typeText(editor, 'Typed');
    expect(onChange).toHaveBeenLastCalledWith('<p>Typed</p>', editor);
    const calls = onChange.mock.calls.length;
    act(() => editor.update(() => $getRoot().selectEnd()));
    expect(onChange).toHaveBeenCalledTimes(calls);
    editor.destroy();
  });

  it('follows `editable`, and gives children the editor', () => {
    let seen: TeiEditor | null = null;
    function Child() {
      seen = useCurrentEditor();
      return null;
    }
    const { rerender } = render(
      <Editor editable={false}>
        <Child />
      </Editor>,
    );
    const doc = screen.getByRole('textbox');
    expect(doc.getAttribute('contenteditable')).toBe('false');
    expect(seen).not.toBeNull();
    rerender(
      <Editor editable>
        <Child />
      </Editor>,
    );
    expect(doc.getAttribute('contenteditable')).toBe('true');
  });

  it('survives StrictMode and cleans up its own editor', async () => {
    let seen: TeiEditor | null = null;
    function Child() {
      seen = useCurrentEditor();
      return null;
    }
    const { unmount } = render(
      <StrictMode>
        <Editor content="<p>x</p>">
          <Child />
        </Editor>
      </StrictMode>,
    );
    const editor = seen as unknown as TeiEditor;
    expect(editor.getText()).toBe('x');
    const destroy = vi.spyOn(editor, 'destroy');
    unmount();
    await Promise.resolve();
    expect(destroy).toHaveBeenCalled();
  });
});

describe('LinkPopover', () => {
  it('does not open on mount, only on a request', () => {
    const editor = createReactTeiEditor({
      extensions: [StarterKit],
      content: '<p><a href="https://example.com">link</a></p>',
    });
    render(<Editor editor={editor} />);
    act(() => editor.update(() => $getRoot().selectEnd()));
    // A remount with a selection in place: the request signal's current value is old news.
    const { unmount } = render(<Editor editor={editor} slots={{ toolbar: false }} />);
    expect(document.querySelector('[data-tei-control="link-editor"]')).toBeNull();
    unmount();
    editor.destroy();
  });
});

describe('context for the parts', () => {
  it('a toolbar outside any provider still draws its icons', () => {
    const editor = createReactTeiEditor({ extensions: [StarterKit] });
    const { container } = render(<EditorToolbar editor={editor} />);
    const bold = container.querySelector('[data-item="bold"]');
    expect(bold?.querySelector('svg')).not.toBeNull();
    editor.destroy();
  });

  it('slots of your own get the editor', () => {
    let seen: TeiEditor | null = null;
    function Mine() {
      seen = useCurrentEditor();
      return <nav />;
    }
    render(<Editor slots={{ toolbar: <Mine />, footer: <Mine /> }} />);
    expect(seen).not.toBeNull();
  });
});
