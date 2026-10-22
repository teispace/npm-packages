import { act, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import type { TeiEditor } from '../../src/index.js';
import { Editor, useTeiEditor } from '../../src/react/index.js';
import { renderToHTML } from '../../src/server/index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTENT = '<h2>Notes</h2><p>Hello <strong>world</strong></p>';

let editor: TeiEditor | undefined;
let bump: () => void = () => {};

function App() {
  const [count, setCount] = useState(0);
  bump = () => setCount((n) => n + 1);
  editor = useTeiEditor({ extensions: [StarterKit], content: CONTENT });
  return (
    <>
      <output>{count}</output>
      <Editor editor={editor} initialHTML={renderToHTML(CONTENT, { extensions: [StarterKit] })} />
    </>
  );
}

const content = (container: Element) =>
  container.querySelector('[data-tei-content]') as HTMLElement;

afterEach(() => {
  editor = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('initialHTML', () => {
  it('the server renders the document, styled as saved HTML', () => {
    const html = renderToString(<App />);
    const container = document.createElement('div');
    container.innerHTML = html;
    const root = content(container);
    expect(root.classList.contains('tei-prose')).toBe(true);
    expect(root.innerHTML).toBe('<h2>Notes</h2><p>Hello <strong>world</strong></p>');
  });

  it('holds back styles and drops handlers, which a strict CSP would report', () => {
    const html = renderToString(
      <Editor
        content=""
        initialHTML={'<p><span style="color: red;" onclick="alert(1)">red</span></p>'}
      />,
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(content(container).innerHTML).toBe(
      '<p><span data-tei-style="color: red;">red</span></p>',
    );
  });

  it('hydrates without a mismatch, then the editor draws the document, once', async () => {
    const html = renderToString(<App />);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const errors = vi.spyOn(console, 'error');
    const recoverable: unknown[] = [];
    let app: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      app = hydrateRoot(container, <App />, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });
    expect(recoverable).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    const root = content(container);
    expect(root.classList.contains('tei-prose')).toBe(false);
    // The editor's own DOM, not the server's: one heading, one paragraph.
    expect(root.querySelectorAll('h2')).toHaveLength(1);
    expect(root.querySelectorAll('p')).toHaveLength(1);
    expect(root.querySelector('h2')?.className).toContain('tei-h2');
    expect(editor?.getHTML()).toBe(CONTENT);
    // A later render leaves the editor's DOM alone.
    await act(async () => bump());
    expect(container.querySelector('output')?.textContent).toBe('1');
    expect(root.querySelector('h2')?.className).toContain('tei-h2');
    expect(root.textContent).toBe('NotesHello world');
    await act(async () => app?.unmount());
  });

  it('a page rendered in the browser never writes it', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const writes: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function (
      this: Element,
      value: string,
    ) {
      if (this.hasAttribute('data-tei-content')) writes.push(value);
      descriptor?.set?.call(this, value);
    });
    const app = createRoot(container);
    await act(async () => app.render(<App />));
    expect(writes).toEqual([]);
    expect(content(container).classList.contains('tei-prose')).toBe(false);
    expect(content(container).querySelectorAll('h2')).toHaveLength(1);
    await act(async () => app.unmount());
  });
});
