import {
  $getRoot,
  BLUR_COMMAND,
  FOCUS_COMMAND,
  type SerializedLexicalNode,
  type TextNode,
} from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Callout } from '../../src/extensions/callout/index.js';
import { Collapsible } from '../../src/extensions/collapsible/index.js';
import {
  DocumentActions,
  downloadAs,
  exportJSON,
  formatOfFile,
  importFile,
  importJSON,
  openFile,
} from '../../src/extensions/document-actions/index.js';
import { Embed } from '../../src/extensions/embed/index.js';
import { FileAttachment } from '../../src/extensions/file/index.js';
import { Image } from '../../src/extensions/image/index.js';
import { MarkdownSource } from '../../src/extensions/markdown-source/index.js';
import { PageBreak } from '../../src/extensions/page-break/index.js';
import { PullQuote } from '../../src/extensions/pull-quote/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { Table } from '../../src/extensions/table/index.js';
import { TextStyle } from '../../src/extensions/text-style/index.js';
import { createTeiEditor, type TeiEditor, type TeiEditorOptions } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const ALL = [
  StarterKit,
  TextStyle,
  Table,
  Image,
  FileAttachment,
  Embed,
  PullQuote,
  Callout,
  Collapsible,
  PageBreak,
  MarkdownSource,
  DocumentActions,
];

function make(content?: unknown, options: Partial<TeiEditorOptions> = {}) {
  const editor = createTeiEditor({ extensions: ALL, content, ...options });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/** Something of every kind the editor holds. */
const EVERYTHING = [
  '<h1>Title</h1><h2>Sub</h2>',
  '<p dir="rtl" style="text-align: center; padding-inline-start: 40px">Ce<b>n</b><i>t</i><u>e</u><s>r</s><code>c</code><mark>m</mark><sub>s</sub><sup>S</sup> <span style="color: rgb(255, 0, 0); font-size: 20px">red</span><br>next <a href="https://x.dev">link</a> https://auto.dev</p>',
  '<blockquote>Quote</blockquote>',
  '<ul><li>one<ul><li>nested</li></ul></li></ul><ol start="3"><li>three</li></ol>',
  '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" checked>done</li></ul>',
  '<pre data-language="js">let a = 1;\n\tb()</pre>',
  '<hr><hr data-tei-page-break>',
  '<table><tr><th>H</th><td style="background-color: #eee">C</td></tr></table>',
  '<figure data-align="end"><img src="https://x.test/a.png" alt="A" width="200" height="100"><figcaption>Cap</figcaption></figure>',
  '<p>One <img src="https://x.test/b.png" alt="B" width="20" height="20" data-inline=""> two</p>',
  '<a href="https://x.test/report.pdf" download="report.pdf" data-tei-file="" data-size="10">report.pdf</a>',
  '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" data-tei-embed="youtube" data-id="dQw4w9WgXcQ"></iframe>',
  '<aside data-tei-pull-quote="">Pulled</aside>',
  '<div data-tei-callout="warning"><p>Careful</p></div>',
  '<details open><summary>More</summary><p>Inside</p></details>',
].join('');

const typesIn = (node: SerializedLexicalNode): string[] => [
  node.type,
  ...((node as { children?: SerializedLexicalNode[] }).children ?? []).flatMap(typesIn),
];

describe('exportJSON / importJSON', () => {
  it('terse JSON leaves defaults out and reads back to the same document, for every node', () => {
    const editor = make(EVERYTHING);
    const full = exportJSON(editor);
    const terse = exportJSON(editor, { terse: true });
    const text = JSON.stringify(terse);
    expect(text.length).toBeLessThan(JSON.stringify(full).length * 0.75);
    const left = text.match(
      /.{60}(?:"version":1\b|"format":0\b|"style":""|"detail":0|"mode":"normal"|"indent":0|"direction":null|"textStyle":"").{20}/g,
    );
    expect(left).toBeNull();

    // Every kind of node the editor can hold is in the sample, but those only made by code.
    const registered = [...editor.lexical._nodes.keys()];
    const present = new Set(typesIn(full.root));
    const internal = ['artificial', 'markdown-source', 'table-cell-content'];
    const missing = registered.filter((type) => !present.has(type) && !internal.includes(type));
    expect(missing).toEqual([]);

    const copy = make();
    importJSON(copy, terse);
    expect(copy.getJSON()).toEqual(full);
    // From a string too, and full JSON passes through unchanged.
    importJSON(copy, text);
    expect(copy.getJSON()).toEqual(full);
    importJSON(copy, full);
    expect(copy.getJSON()).toEqual(full);

    // The markdown source view's node too.
    editor.commands.toggleMarkdownSource();
    const source = exportJSON(editor);
    importJSON(copy, exportJSON(editor, { terse: true }));
    expect(copy.getJSON()).toEqual(source);
  });

  it('keeps fields that differ from their defaults', () => {
    const editor = make('<p style="padding-inline-start: 80px"><b>x</b></p>');
    const terse = exportJSON(editor, { terse: true });
    const paragraph = terse.root.children?.[0];
    expect(paragraph?.indent).toBe(2);
    expect(paragraph?.children?.[0]?.format).toBe(1);
  });

  it('refuses what is not a document, leaving the current one alone', () => {
    const editor = make('<p>Keep</p>');
    for (const bad of [
      '{',
      {},
      { root: { type: 'paragraph', children: [] } },
      { root: { type: 'root', children: [{ type: 'evil', children: [] }] } },
      { root: { type: 'root', children: 'x' } },
      { root: { type: 'root', children: [null] } },
    ]) {
      expect(() => importJSON(editor, bad)).toThrow();
    }
    let deep: Record<string, unknown> = { type: 'paragraph', children: [] };
    for (let i = 0; i < 300; i++) deep = { type: 'quote', children: [deep] };
    expect(() => importJSON(editor, { root: { type: 'root', children: [deep] } })).toThrow(/deep/);
    expect(editor.getText()).toBe('Keep');
  });
});

describe('DocumentActions commands', () => {
  it('clears the document as one undo step, and only when there is something to clear', () => {
    const editor = make('<h1>A</h1><p>B</p>');
    expect(editor.can().clearDocument()).toBe(true);
    expect(editor.commands.clearDocument()).toBe(true);
    expect(editor.isEmpty).toBe(true);
    expect(editor.can().clearDocument()).toBe(false);
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<h1>A</h1><p>B</p>');
  });

  it('turns read-only on and off, and says so', () => {
    const editor = make('<p>A</p>');
    expect(editor.isActive('readOnly')).toBe(false);
    editor.commands.toggleEditable();
    expect(editor.isEditable).toBe(false);
    expect(editor.isActive('readOnly')).toBe(true);
    expect(editor.can().clearDocument()).toBe(false);
    expect(editor.can().openFile()).toBe(false);
    expect(editor.can().downloadAs('html')).toBe(true);
    editor.commands.setEditable(true);
    expect(editor.isEditable).toBe(true);
  });

  it('offers its items in the document menu, by group', () => {
    const editor = make('<p>A</p>');
    const items = editor.items('document');
    expect(items.map((i) => i.id)).toEqual(
      expect.arrayContaining([
        'readOnly',
        'openFile',
        'export-json',
        'export-markdown',
        'clearDocument',
      ]),
    );
    expect(items.find((i) => i.id === 'clearDocument')?.variant).toBe('danger');
    // Without Markdown, no markdown export.
    const plain = createTeiEditor({
      extensions: [StarterKit.configure({ markdown: false }), DocumentActions],
    });
    editors.push(plain);
    expect(plain.items('document').map((i) => i.id)).not.toContain('export-markdown');
  });
});

describe('downloadAs', () => {
  let blobs: Blob[];
  let clicks: HTMLAnchorElement[];
  beforeEach(() => {
    blobs = [];
    clicks = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return `blob:${blobs.length}`;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
  });

  it('downloads each format through a blob URL, with no inline anything', async () => {
    const editor = make('<h1>Title</h1><p>Body</p>', {});
    expect(downloadAs(editor, 'html')).toBe(true);
    expect(clicks[0]?.download).toBe('document.html');
    expect(clicks[0]?.href).toBe('blob:1');
    expect(clicks[0]?.isConnected).toBe(false);
    const html = await blobs[0]?.text();
    expect(html).toContain('<title>document</title>');
    expect(html).toContain('<h1>Title</h1><p>Body</p>');
    expect(html).not.toMatch(/<script|<style|style=/);
    expect(blobs[0]?.type).toBe('text/html;charset=utf-8');

    editor.commands.downloadAs('markdown', 'notes.md');
    expect(clicks[1]?.download).toBe('notes.md');
    expect(await blobs[1]?.text()).toBe('# Title\n\nBody');

    downloadAs(editor, 'json');
    const json = JSON.parse((await blobs[2]?.text()) ?? '');
    expect(json.root.version).toBeUndefined();
    const copy = make();
    importJSON(copy, json);
    expect(copy.getHTML()).toBe(editor.getHTML());

    downloadAs(editor, 'text');
    expect(await blobs[3]?.text()).toBe('Title\n\nBody');
  });

  it('in the markdown source view, writes only markdown and text', () => {
    const editor = make('<p>A</p>');
    editor.commands.toggleMarkdownSource();
    expect(editor.can().downloadAs('html')).toBe(false);
    expect(editor.can().downloadAs('json')).toBe(false);
    expect(editor.can().downloadAs('markdown')).toBe(true);
    expect(downloadAs(editor, 'html')).toBe(false);
    expect(clicks).toHaveLength(0);
  });
});

describe('opening files', () => {
  const file = (text: string, name: string, type = '') => new File([text], name, { type });

  it('reads each kind of file by its name or type', () => {
    expect(formatOfFile({ name: 'a.MD', type: '' })).toBe('markdown');
    expect(formatOfFile({ name: 'a', type: 'text/html; charset=utf-8' })).toBe('html');
    expect(formatOfFile({ name: 'a.exe', type: 'application/x-msdownload' })).toBeNull();
  });

  it('imports JSON (terse too), markdown, HTML and text', async () => {
    const source = make('<h2>From</h2><p>JSON</p>');
    const editor = make('<p>Old</p>');
    expect(
      await importFile(editor, file(JSON.stringify(exportJSON(source, { terse: true })), 'a.json')),
    ).toBe(true);
    expect(editor.getHTML()).toBe('<h2>From</h2><p>JSON</p>');
    await importFile(editor, file('# Hi\n\n**b**', 'a.md'));
    expect(editor.getHTML()).toBe('<h1>Hi</h1><p><strong>b</strong></p>');
    await importFile(editor, file('<p onclick="x()">Safe<script>alert(1)</script></p>', 'a.html'));
    expect(editor.getHTML()).toBe('<p>Safe</p>');
    await importFile(editor, file('one\ntwo', 'a.txt'));
    expect(editor.getText()).toBe('one\n\ntwo');
  });

  it('refuses hostile and broken files through onError, never by throwing', async () => {
    const onError = vi.fn();
    const editor = make('<p>Keep</p>', {});
    const cases: [File, RegExp][] = [
      [file('x', 'a.exe'), /not a document/],
      [file('x'.repeat(2048), 'big.txt'), /larger than 1 KB/],
      [file('a\u0000b', 'bin.txt'), /could not be read/],
      [file('{"root":', 'bad.json'), /not a valid document/],
      [file('{"root":{"type":"root","children":[{"type":"script"}]}}', 'evil.json'), /not a valid/],
    ];
    for (const [bad, message] of cases) {
      onError.mockClear();
      expect(await importFile(editor, bad, { onError, maxFileSize: 1024 })).toBe(false);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0].message).toMatch(message);
    }
    expect(editor.getText()).toBe('Keep');
  });

  it('reports through the option, and by default announces and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = make('<p>Keep</p>');
    expect(await importFile(editor, file('x', 'a.exe'))).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-tei-live]')?.textContent).toMatch(/a\.exe/);
    const onError = vi.fn();
    const own = make('<p>Keep</p>', {
      extensions: [...ALL, DocumentActions.configure({ onError })],
    });
    await importFile(own, file('x', 'a.exe'));
    expect(onError).toHaveBeenCalledOnce();
  });

  it('openFile asks for a file with a hidden input, and does nothing when cancelled', async () => {
    const editor = make('<p>Old</p>');
    let input: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      input = this;
    });
    const picked = openFile(editor);
    expect(input?.type).toBe('file');
    expect(input?.accept).toContain('.md');
    Object.defineProperty(input, 'files', { value: [file('New', 'n.txt')] });
    input?.dispatchEvent(new Event('change'));
    expect(await picked).toBe(true);
    expect(editor.getText()).toBe('New');

    const cancelled = openFile(editor);
    input?.dispatchEvent(new Event('cancel'));
    expect(await cancelled).toBe(false);
  });
});

describe('keepSelection', () => {
  it('draws the selection as a highlight while the editor is blurred', () => {
    class FakeHighlight extends Set<AbstractRange> {}
    const registry = new Map<string, FakeHighlight>();
    vi.stubGlobal('Highlight', FakeHighlight);
    vi.stubGlobal('CSS', { highlights: registry });
    try {
      const editor = make('<p>Hello world</p>');
      editor.update(() => {
        const text = $getRoot().getAllTextNodes()[0] as TextNode;
        text.select(0, 5);
      });
      const fire = (command: typeof BLUR_COMMAND | typeof FOCUS_COMMAND) =>
        editor.lexical.update(
          () => {
            editor.lexical.dispatchCommand(command, new FocusEvent('blur'));
          },
          { discrete: true },
        );
      fire(BLUR_COMMAND);
      const kept = [...(registry.get('tei-kept-selection') ?? [])];
      expect(kept).toHaveLength(1);
      expect((kept[0] as Range).toString()).toBe('Hello');
      fire(FOCUS_COMMAND);
      expect(registry.has('tei-kept-selection')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
