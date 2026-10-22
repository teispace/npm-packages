import { $getRoot, KEY_ESCAPE_COMMAND, type TextNode } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_ACTIONS,
  Ai,
  type AiHandler,
  type AiOptions,
  type AiRequest,
  type AiStorage,
} from '../../src/extensions/ai/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string, options: Partial<AiOptions> = {}) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Ai.configure(options)],
    content,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  const storage = editor.extension(Ai)?.output.storage as AiStorage;
  return { editor, storage };
}

/** Select `from`–`to` of the text node whose text is `text`. */
const select = (editor: TeiEditor, text: string, from: number, to = from) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((n) => n.getTextContent() === text) as TextNode;
    node.select(from, to);
  });

const caretAtEnd = (editor: TeiEditor) => editor.update(() => $getRoot().selectEnd());

const settled = (storage: AiStorage) =>
  vi.waitFor(() => expect(storage.state.peek()).not.toBe('streaming'));

/** A stream the test feeds a chunk at a time. */
function controlled() {
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let ended = false;
  let closed = false;
  let signal: AbortSignal | null = null;
  const handler: AiHandler = (_request, ctx) => {
    signal = ctx.signal;
    return (async function* () {
      try {
        while (true) {
          if (queue.length) yield queue.shift() as string;
          else if (ended) return;
          else await new Promise<void>((resolve) => (wake = resolve));
        }
      } finally {
        closed = true;
      }
    })();
  };
  return {
    handler,
    push: (text: string) => {
      queue.push(text);
      wake?.();
    },
    end: () => {
      ended = true;
      wake?.();
    },
    get signal() {
      return signal;
    },
    get closed() {
      return closed;
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('Ai: streaming answers', () => {
  it('streams into a preview without touching the document; accept is one undo step', async () => {
    const stream = controlled();
    const { editor, storage } = make('<p>Hello wrold today</p>', { handler: stream.handler });
    select(editor, 'Hello wrold today', 6, 11);
    const before = editor.getJSON();
    expect(editor.can().aiRun('fix')).toBe(true);
    expect(editor.commands.aiRun('fix')).toBe(true);
    expect(storage.state.peek()).toBe('streaming');
    expect(storage.action.peek()).toBe('fix');
    expect(storage.mode.peek()).toBe('replace');
    stream.push('wor');
    await tick();
    stream.push('ld');
    // Shown a frame at a time: whenever the next frame comes.
    await vi.waitFor(() => expect(storage.output.peek()).toBe('world'));
    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().aiAccept()).toBe(false);
    stream.end();
    await settled(storage);
    expect(storage.state.peek()).toBe('done');
    expect(editor.getJSON()).toEqual(before);
    expect(editor.commands.aiAccept()).toBe(true);
    expect(editor.getHTML()).toBe('<p>Hello world today</p>');
    expect(storage.state.peek()).toBe('idle');
    expect(storage.output.peek()).toBe('');
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>Hello wrold today</p>');
  });

  it('accepting is its own undo step even right after typing', async () => {
    const { editor, storage } = make('<p>Star</p>', { handler: () => '!' });
    caretAtEnd(editor);
    // A typed character: the history merges the next one-character change into it.
    editor.update(() => {
      const text = $getRoot().getAllTextNodes()[0] as TextNode;
      text.setTextContent('Start');
      text.select(5, 5);
    });
    editor.commands.aiRun('continue');
    await settled(storage);
    const tags: string[][] = [];
    const off = editor.lexical.registerUpdateListener((update) => tags.push([...update.tags]));
    editor.commands.aiAccept();
    off();
    // Told to start a new undo step, never merged into the typing before.
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('history-push');
    expect(editor.getText()).toBe('Start!');
    editor.commands.undo();
    expect(editor.getText()).toBe('Start');
  });

  it('reads a ReadableStream of text and bytes', async () => {
    const bytes = new TextEncoder().encode('é!');
    const handler: AiHandler = () =>
      new ReadableStream<string | Uint8Array>({
        start(controller) {
          controller.enqueue('Caf');
          // A character split across chunks still decodes.
          controller.enqueue(bytes.slice(0, 1));
          controller.enqueue(bytes.slice(1));
          controller.close();
        },
      });
    const { editor, storage } = make('<p>x</p>', { handler });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await settled(storage);
    expect(storage.output.peek()).toBe('Café!');
  });

  it('takes a plain promise, or a promise of a stream', async () => {
    const { editor, storage } = make('<p>x</p>', {
      handler: async () => 'Whole answer',
    });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await settled(storage);
    expect(storage.output.peek()).toBe('Whole answer');

    const second = make('<p>y</p>', {
      handler: async () =>
        (async function* () {
          yield 'a';
          yield 'b';
        })(),
    });
    caretAtEnd(second.editor);
    second.editor.commands.aiRun('continue');
    await settled(second.storage);
    expect(second.storage.output.peek()).toBe('ab');
  });

  it('renders the preview at most once a frame while chunks pour in', async () => {
    const handler: AiHandler = async function* () {
      for (let i = 0; i < 200; i++) yield 'x';
    };
    const { editor, storage } = make('<p>x</p>', { handler });
    caretAtEnd(editor);
    let renders = 0;
    const off = storage.output.subscribe(() => renders++);
    editor.commands.aiRun('continue');
    await settled(storage);
    off();
    expect(storage.output.peek()).toHaveLength(200);
    // One for the reset, a few frames, one for the end: far fewer than 200.
    expect(renders).toBeLessThan(20);
  });
});

describe('Ai: errors, stopping and discarding', () => {
  it('surfaces an error with retry, for a throw and a rejection', async () => {
    let calls = 0;
    const handler: AiHandler = () => {
      calls++;
      if (calls === 1) throw new Error('rate limited');
      if (calls === 2)
        return (async function* () {
          yield 'part';
          throw new Error('connection lost');
        })();
      return 'fine';
    };
    const { editor, storage } = make('<p>x</p>', { handler });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await settled(storage);
    expect(storage.state.peek()).toBe('error');
    expect(storage.error.peek()).toBe('rate limited');
    expect(editor.can().aiAccept()).toBe(false);
    expect(editor.can().aiRetry()).toBe(true);
    editor.commands.aiRetry();
    await settled(storage);
    expect(storage.error.peek()).toBe('connection lost');
    expect(storage.output.peek()).toBe('part');
    editor.commands.aiRetry();
    await settled(storage);
    expect(storage.state.peek()).toBe('done');
    expect(storage.error.peek()).toBeNull();
    expect(storage.output.peek()).toBe('fine');
    expect(editor.getText()).toBe('x');
  });

  it('a handler that returns nothing usable is an error', async () => {
    const { editor, storage } = make('<p>x</p>', {
      handler: (() => 42) as unknown as AiHandler,
    });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await settled(storage);
    expect(storage.state.peek()).toBe('error');
  });

  it('stop aborts and keeps what arrived, to accept or discard', async () => {
    const stream = controlled();
    const { editor, storage } = make('<p>Hi</p>', { handler: stream.handler });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    stream.push(' there');
    await tick();
    expect(editor.commands.aiStop()).toBe(true);
    expect(stream.signal?.aborted).toBe(true);
    expect(storage.state.peek()).toBe('done');
    expect(storage.stopped.peek()).toBe(true);
    expect(storage.output.peek()).toBe(' there');
    // Chunks after the stop are dropped.
    stream.push(' late');
    await tick();
    expect(storage.output.peek()).toBe(' there');
    expect(stream.closed).toBe(true);
    expect(editor.commands.aiAccept()).toBe(true);
    expect(editor.getText()).toBe('Hi there');
  });

  it('discard aborts, drops the answer and leaves the document untouched', async () => {
    const stream = controlled();
    const { editor, storage } = make('<p>Keep me</p>', { handler: stream.handler });
    select(editor, 'Keep me', 0, 4);
    const before = editor.getJSON();
    editor.commands.aiRun('rewrite');
    stream.push('Lose');
    await tick();
    expect(editor.commands.aiDiscard()).toBe(true);
    expect(stream.signal?.aborted).toBe(true);
    expect(storage.state.peek()).toBe('idle');
    expect(storage.output.peek()).toBe('');
    stream.push(' more');
    stream.end();
    await tick();
    expect(storage.output.peek()).toBe('');
    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().aiDiscard()).toBe(false);
  });

  it('Escape in the document discards; a new run aborts the one before', async () => {
    const first = controlled();
    let handler: AiHandler = first.handler;
    const { editor, storage } = make('<p>Text</p>', { handler: (r, c) => handler(r, c) });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await tick();
    const second = controlled();
    handler = second.handler;
    editor.commands.aiRun('continue');
    await tick();
    expect(first.signal?.aborted).toBe(true);
    expect(second.signal?.aborted).toBe(false);
    first.push('stale');
    second.push('fresh');
    await vi.waitFor(() => expect(storage.output.peek()).toBe('fresh'));
    const handled = editor.lexical.dispatchCommand(
      KEY_ESCAPE_COMMAND,
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    expect(handled).toBe(true);
    expect(second.signal?.aborted).toBe(true);
    expect(storage.state.peek()).toBe('idle');
    // With nothing running, Escape is someone else's: it is not prevented here.
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    editor.lexical.dispatchCommand(KEY_ESCAPE_COMMAND, event);
    expect(storage.state.peek()).toBe('idle');
  });

  it('a slow handler that ignores the signal is still cut off', async () => {
    let resolve!: (text: string) => void;
    const { editor, storage } = make('<p>x</p>', {
      handler: () => new Promise<string>((r) => (resolve = r)),
    });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await tick();
    editor.commands.aiStop();
    resolve('too late');
    await tick();
    expect(storage.state.peek()).toBe('done');
    expect(storage.output.peek()).toBe('');
    expect(editor.can().aiAccept()).toBe(false);
  });

  it('destroying the editor aborts the request', async () => {
    const stream = controlled();
    const { editor } = make('<p>x</p>', { handler: stream.handler });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await tick();
    editor.destroy();
    expect(stream.signal?.aborted).toBe(true);
  });
});

describe('Ai: what goes into the document', () => {
  it('markdown becomes blocks: headings and lists', async () => {
    const { editor, storage } = make('<p>Intro</p><p></p>', {
      handler: () => '# Plan\n\n- one\n- **two**\n\nDone.',
    });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await settled(storage);
    editor.commands.aiAccept();
    expect(editor.getHTML()).toContain('<h1>Plan</h1>');
    expect(editor.getHTML()).toMatch(
      /<ul><li[^>]*>one<\/li><li[^>]*><strong>two<\/strong><\/li><\/ul>/,
    );
    expect(editor.getHTML()).toContain('<p>Done.</p>');
    expect(editor.getHTML().startsWith('<p>Intro</p>')).toBe(true);
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>Intro</p><p><br></p>');
  });

  it('text format keeps markdown literal and makes paragraphs of blank lines', async () => {
    const { editor, storage } = make('<p></p>', {
      format: 'text',
      handler: () => '# not a heading\n\nsecond\nline',
    });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await settled(storage);
    editor.commands.aiAccept();
    expect(editor.getHTML()).toBe('<p># not a heading</p><p>second<br>line</p>');
  });

  it('neutralises hostile output: no script, no javascript: links, no raw HTML', async () => {
    const hostile =
      'Hi <script>alert(1)</script> <img src=x onerror="alert(2)"> ' +
      '[click](javascript:alert(3)) [ok](https://example.com) ' +
      '[sneaky](JaVa\tScRiPt:alert(4)) ![pic](javascript:alert(5))';
    const { editor, storage } = make('<p></p>', { handler: () => hostile });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await settled(storage);
    editor.commands.aiAccept();
    const html = editor.getHTML();
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/(href|src)="[^"]*script:/i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<a href="https://example.com"');
    // The refused link keeps its text, unlinked.
    expect(editor.getText()).toContain('click');
    const root = editor.lexical.getRootElement() as HTMLElement;
    expect(root.querySelector('script, img[onerror]')).toBeNull();
    for (const a of root.querySelectorAll('a')) expect(a.getAttribute('href')).toMatch(/^https:/);
  });

  it('a rewritten phrase stays in its sentence; a summary goes in a block after', async () => {
    const { editor, storage } = make('<p>One two three</p><p>Next</p>', {
      handler: (request) => (request.action === 'summarize' ? 'In short: numbers.' : 'TWO'),
    });
    select(editor, 'One two three', 4, 7);
    editor.commands.aiRun('rewrite');
    await settled(storage);
    editor.commands.aiAccept();
    expect(editor.getHTML()).toBe('<p>One TWO three</p><p>Next</p>');
    select(editor, 'One TWO three', 0, 13);
    editor.commands.aiRun('summarize');
    expect(storage.mode.peek()).toBe('insert');
    await settled(storage);
    editor.commands.aiAccept();
    expect(editor.getHTML()).toBe('<p>One TWO three</p><p>In short: numbers.</p><p>Next</p>');
  });

  it('never replaces text that changed while the answer arrived', async () => {
    const stream = controlled();
    const { editor, storage } = make('<p>alpha beta</p>', { handler: stream.handler });
    select(editor, 'alpha beta', 0, 5);
    editor.commands.aiRun('rewrite');
    // Someone edits the selected word meanwhile.
    editor.update(() => {
      ($getRoot().getAllTextNodes()[0] as TextNode).setTextContent('ALPHA beta');
    });
    stream.push('Gamma');
    stream.end();
    await settled(storage);
    editor.commands.aiAccept();
    expect(editor.getText()).toContain('ALPHA');
    expect(editor.getText()).toContain('Gamma');
  });

  it('accepting a removed target inserts at the selection instead', async () => {
    const stream = controlled();
    const { editor, storage } = make('<p>gone</p><p>stay</p>', { handler: stream.handler });
    select(editor, 'gone', 0, 4);
    editor.commands.aiRun('rewrite');
    editor.update(() => {
      $getRoot().getFirstChild()?.remove();
      ($getRoot().getAllTextNodes()[0] as TextNode).select(4, 4);
    });
    stream.push('!');
    stream.end();
    await settled(storage);
    expect(editor.commands.aiAccept()).toBe(true);
    expect(editor.getHTML()).toBe('<p>stay!</p>');
  });
});

describe('Ai: requests', () => {
  it('sends the selection as text and markdown, with bounded context', async () => {
    const requests: AiRequest[] = [];
    const before = 'a'.repeat(50);
    const { editor, storage } = make(
      `<p>${before}</p><p>pre <strong>bold</strong> post</p><p>${'z'.repeat(50)}</p>`,
      {
        contextBefore: 10,
        contextAfter: 8,
        documentContext: 12,
        handler: (request) => {
          requests.push(request);
          return 'ok';
        },
      },
    );
    editor.update(() => {
      const nodes = $getRoot().getAllTextNodes();
      const start = nodes.find((n) => n.getTextContent() === 'pre ') as TextNode;
      const end = nodes.find((n) => n.getTextContent() === 'bold') as TextNode;
      const selection = start.select(4, 4);
      selection.focus.set(end.getKey(), 4, 'text');
    });
    editor.commands.aiRun('rewrite');
    await settled(storage);
    const [request] = requests;
    expect(request?.action).toBe('rewrite');
    expect(request?.id).toBe('rewrite');
    expect(request?.format).toBe('markdown');
    expect(request?.prompt).toMatch(/Rewrite/);
    expect(request?.selection).toEqual({ text: 'bold', markdown: '**bold**' });
    expect(request?.context.before).toHaveLength(10);
    expect(request?.context.before.endsWith('pre ')).toBe(true);
    expect(request?.context.after).toHaveLength(8);
    expect(request?.context.after.startsWith(' post')).toBe(true);
    expect(request?.context.document).toBe('a'.repeat(12));
  });

  it('passes choices as options, the first by default', async () => {
    const requests: AiRequest[] = [];
    const { editor, storage } = make('<p>Hello</p>', {
      handler: (request) => {
        requests.push(request);
        return 'Hola';
      },
    });
    select(editor, 'Hello', 0, 5);
    editor.commands.aiRun('translate', { language: 'Spanish' });
    await settled(storage);
    editor.commands.aiRun('translate');
    await settled(storage);
    expect(requests[0]?.options).toEqual({ language: 'Spanish' });
    expect(requests[0]?.prompt).toContain('Spanish');
    expect(requests[1]?.options).toEqual({ language: 'English' });
  });

  it('a custom prompt replaces the selection, or writes at the caret', async () => {
    const requests: AiRequest[] = [];
    const { editor, storage } = make('<p>Hello</p>', {
      handler: (request) => {
        requests.push(request);
        return 'Bonjour';
      },
    });
    expect(editor.can().aiPrompt('')).toBe(false);
    select(editor, 'Hello', 0, 5);
    expect(editor.commands.aiPrompt('  In French  ')).toBe(true);
    await settled(storage);
    expect(requests[0]).toMatchObject({ action: 'custom', id: 'custom', prompt: 'In French' });
    expect(storage.mode.peek()).toBe('replace');
    editor.commands.aiAccept();
    expect(editor.getText()).toBe('Bonjour');
  });

  it('offers each action only where it applies, and refuses a selection too long', () => {
    const { editor } = make('<p>Some text</p><p></p>', { handler: () => '', maxSelection: 5 });
    select(editor, 'Some text', 0, 4);
    expect(editor.can().aiRun('rewrite')).toBe(true);
    expect(editor.can().aiRun('continue')).toBe(false);
    select(editor, 'Some text', 0, 9);
    expect(editor.can().aiRun('rewrite')).toBe(false);
    expect(editor.commands.aiRun('rewrite')).toBe(false);
    select(editor, 'Some text', 3);
    expect(editor.can().aiRun('rewrite')).toBe(false);
    expect(editor.can().aiRun('continue')).toBe(true);
    expect(editor.can().aiRun('nope')).toBe(false);
  });

  it('takes actions from config: added, removed, relabelled', async () => {
    const requests: AiRequest[] = [];
    const { editor, storage } = make('<p></p>', {
      actions: [
        ...AI_ACTIONS.filter((action) => action.id !== 'continue'),
        {
          id: 'brainstorm',
          label: 'Brainstorm ideas',
          when: 'empty',
          prompt: () => 'List ideas.',
        },
      ],
      handler: (request) => {
        requests.push(request);
        return '- a';
      },
    });
    caretAtEnd(editor);
    expect(editor.can().aiRun('continue')).toBe(false);
    expect(editor.can().aiRun('brainstorm')).toBe(true);
    editor.commands.aiRun('brainstorm');
    await settled(storage);
    expect(requests[0]).toMatchObject({
      action: 'custom',
      id: 'brainstorm',
      prompt: 'List ideas.',
    });
  });
});

describe('Ai: availability', () => {
  it('without a handler nothing is offered', () => {
    const { editor } = make('<p>Hi</p>');
    select(editor, 'Hi', 0, 2);
    expect(editor.can().aiRun('rewrite')).toBe(false);
    expect(editor.commands.aiRun('rewrite')).toBe(false);
    expect(editor.can().aiPrompt('x')).toBe(false);
    expect(editor.items('slash').some((item) => item.id === 'ai')).toBe(false);
    expect(editor.items('bubble').some((item) => item.id === 'aiMenu')).toBe(false);
  });

  it('with one, the slash item, bubble item and Mod-j are there', () => {
    const { editor } = make('<p>Hi</p>', { handler: () => '' });
    expect(editor.items('slash').some((item) => item.id === 'ai')).toBe(true);
    expect(editor.items('bubble').some((item) => item.id === 'aiMenu')).toBe(true);
    expect(editor.shortcut('ai')).toBeDefined();
    // No menu mounted: nothing to open.
    expect(editor.can().openAiMenu()).toBe(false);
  });

  it('refuses while read-only, and going read-only discards a run', async () => {
    const stream = controlled();
    const { editor, storage } = make('<p>Hi</p>', { handler: stream.handler });
    caretAtEnd(editor);
    editor.setEditable(false);
    expect(editor.can().aiRun('continue')).toBe(false);
    expect(editor.commands.aiRun('continue')).toBe(false);
    expect(editor.commands.aiPrompt('x')).toBe(false);
    editor.setEditable(true);
    editor.commands.aiRun('continue');
    await tick();
    editor.setEditable(false);
    expect(stream.signal?.aborted).toBe(true);
    expect(storage.state.peek()).toBe('idle');
  });

  it('will not accept into a read-only document', async () => {
    const { editor, storage } = make('<p>Hi</p>', { handler: () => ' there' });
    caretAtEnd(editor);
    editor.commands.aiRun('continue');
    await settled(storage);
    // Read-only discards; nothing is left to accept.
    editor.setEditable(false);
    expect(editor.commands.aiAccept()).toBe(false);
    expect(editor.getText()).toBe('Hi');
  });
});
