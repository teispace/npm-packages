import { act, fireEvent, render, screen } from '@testing-library/react';
import { $getRoot, type TextNode } from 'lexical';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Ai, type AiHandler, type AiRequest } from '../../src/extensions/ai/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import type { TeiEditor } from '../../src/index.js';
import { AiMenu, createReactTeiEditor, EditorContent } from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

/** A stream the test feeds. */
function controlled() {
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let ended = false;
  const state = { signal: null as AbortSignal | null, requests: [] as AiRequest[] };
  const handler: AiHandler = (request, ctx) => {
    state.signal = ctx.signal;
    state.requests.push(request);
    return (async function* () {
      while (true) {
        if (queue.length) yield queue.shift() as string;
        else if (ended) return;
        else await new Promise<void>((resolve) => (wake = resolve));
      }
    })();
  };
  return {
    handler,
    state,
    push: async (text: string) => {
      queue.push(text);
      wake?.();
      await flush();
    },
    end: async () => {
      ended = true;
      wake?.();
      await flush();
    },
  };
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

function open(content: string, handler: AiHandler) {
  const editor = createReactTeiEditor({
    extensions: [StarterKit, Ai.configure({ handler })],
    content,
  });
  render(
    <EditorContent editor={editor}>
      <AiMenu />
    </EditorContent>,
  );
  return editor;
}

const select = (editor: TeiEditor, text: string, from: number, to = from) =>
  act(() => {
    editor.update(() => {
      const node = $getRoot()
        .getAllTextNodes()
        .find((n) => n.getTextContent() === text) as TextNode;
      node.select(from, to);
    });
  });

/** The menu, found by its control name: jsdom's layout hides popovers from role queries. */
const dialog = () =>
  document.querySelector<HTMLElement>(
    '[data-tei-control="ai-menu"][role="dialog"][aria-label="AI assistant"]',
  );
const preview = () =>
  dialog()?.querySelector<HTMLElement>('[role="region"][aria-label="Answer"]') ?? null;
const button = (label: string) =>
  [...(dialog()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label) ?? null;
const field = () =>
  screen.getByRole('combobox', { hidden: true, name: 'Ask AI to write or edit…' });
const options = () =>
  screen.queryAllByRole('option', { hidden: true }).map((option) => option.textContent);

describe('AiMenu', () => {
  it('opens at the selection with the actions that apply, and filters them', () => {
    const editor = open('<p>Hello world</p>', () => '');
    select(editor, 'Hello world', 0, 5);
    expect(dialog()).toBeNull();
    act(() => {
      expect(editor.commands.openAiMenu()).toBe(true);
    });
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(field());
    expect(options()).toContain('Improve writing');
    expect(options()).toContain('Translate');
    // Continue is for a caret.
    expect(options()).not.toContain('Continue writing');
    act(() => {
      fireEvent.change(field(), { target: { value: 'gram' } });
    });
    expect(options()).toEqual(['Ask: gram', 'Fix spelling and grammar']);
    expect(field().getAttribute('aria-activedescendant')).toBe(
      screen.getAllByRole('option', { hidden: true })[0]?.id,
    );
    act(() => {
      fireEvent.keyDown(field(), { key: 'ArrowDown' });
    });
    expect(screen.getAllByRole('option', { hidden: true })[1]?.getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('streams a preview, then Enter accepts it as one change', async () => {
    const stream = controlled();
    const editor = open('<p>Hello wrold</p>', stream.handler);
    select(editor, 'Hello wrold', 6, 11);
    act(() => {
      editor.commands.openAiMenu();
    });
    act(() => {
      fireEvent.change(field(), { target: { value: 'fix' } });
    });
    act(() => {
      fireEvent.keyDown(field(), { key: 'ArrowDown' });
    });
    act(() => {
      fireEvent.keyDown(field(), { key: 'Enter' });
    });
    await flush();
    expect(stream.state.requests[0]?.action).toBe('fix');
    await stream.push('wor');
    await stream.push('ld');
    const answer = preview() as HTMLElement;
    expect(answer.textContent).toBe('world');
    expect(answer.getAttribute('aria-busy')).toBe('true');
    expect(editor.getHTML()).toBe('<p>Hello wrold</p>');
    expect(button('Stop') as HTMLElement).toBeTruthy();
    await stream.end();
    await flush();
    expect(button('Stop')).toBeNull();
    const accept = button('Accept') as HTMLElement;
    expect(document.activeElement).toBe(accept);
    // The live region, throttled, says it is ready.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(document.querySelector('.tei-ai [role="status"]')?.textContent).toMatch(/Answer ready/);
    act(() => {
      fireEvent.keyDown(answer, { key: 'Enter' });
    });
    expect(dialog()).toBeNull();
    expect(editor.getHTML()).toBe('<p>Hello world</p>');
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getHTML()).toBe('<p>Hello wrold</p>');
  });

  it('Escape discards: the request aborts and the document is untouched', async () => {
    const stream = controlled();
    const editor = open('<p>Keep</p>', stream.handler);
    select(editor, 'Keep', 4);
    act(() => {
      editor.commands.openAiMenu();
    });
    act(() => {
      fireEvent.change(field(), { target: { value: 'write a poem' } });
    });
    act(() => {
      fireEvent.keyDown(field(), { key: 'Enter' });
    });
    await flush();
    expect(stream.state.requests[0]).toMatchObject({ action: 'custom', prompt: 'write a poem' });
    await stream.push('Roses');
    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    });
    expect(dialog()).toBeNull();
    expect(stream.state.signal?.aborted).toBe(true);
    expect(editor.getHTML()).toBe('<p>Keep</p>');
  });

  it('an action with choices lists them; the choice reaches the handler', async () => {
    const stream = controlled();
    const editor = open('<p>Hello</p>', stream.handler);
    select(editor, 'Hello', 0, 5);
    act(() => {
      editor.commands.openAiMenu();
    });
    act(() => {
      fireEvent.click(screen.getByRole('option', { hidden: true, name: 'Translate' }));
    });
    expect(options()[0]).toBe('Back');
    expect(options()).toContain('Spanish');
    act(() => {
      fireEvent.change(field(), { target: { value: 'spa' } });
    });
    expect(options()).toEqual(['Back', 'Spanish']);
    act(() => {
      fireEvent.keyDown(field(), { key: 'ArrowDown' });
    });
    act(() => {
      fireEvent.keyDown(field(), { key: 'Enter' });
    });
    await flush();
    expect(stream.state.requests[0]?.options).toEqual({ language: 'Spanish' });
  });

  it('shows an error with Try again; Stop keeps a partial answer', async () => {
    let calls = 0;
    const stream = controlled();
    const handler: AiHandler = (request, ctx) => {
      calls++;
      if (calls === 1) throw new Error('quota exceeded');
      return stream.handler(request, ctx);
    };
    const editor = open('<p>Hi</p>', handler);
    select(editor, 'Hi', 2);
    act(() => {
      editor.commands.aiRun('continue');
    });
    await flush();
    // A run started elsewhere opens the menu too.
    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector('.tei-ai-status')?.textContent).toBe(
      'Something went wrong: quota exceeded',
    );
    expect(button('Accept')).toBeNull();
    act(() => {
      fireEvent.click(button('Try again') as HTMLElement);
    });
    await stream.push(' there');
    act(() => {
      fireEvent.click(button('Stop') as HTMLElement);
    });
    expect(stream.state.signal?.aborted).toBe(true);
    act(() => {
      fireEvent.click(button('Accept') as HTMLElement);
    });
    expect(editor.getText()).toBe('Hi there');
    expect(dialog()).toBeNull();
  });

  it('shows the answer as text, never as markup', async () => {
    const editor = open('<p>x</p>', () => '<img src=x onerror="alert(1)"><b>bold</b>');
    select(editor, 'x', 1);
    act(() => {
      editor.commands.aiRun('continue');
    });
    await flush();
    const answer = preview() as HTMLElement;
    expect(answer.querySelector('img, b')).toBeNull();
    expect(answer.textContent).toContain('<img src=x');
  });

  it('renders nothing without the extension', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = createReactTeiEditor({ extensions: [StarterKit] });
    render(
      <EditorContent editor={editor}>
        <AiMenu />
      </EditorContent>,
    );
    expect(dialog()).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('<AiMenu>'));
    warn.mockRestore();
  });
});
