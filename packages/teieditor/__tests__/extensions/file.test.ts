import { DRAG_DROP_PASTE } from '@lexical/rich-text';
import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $setSelection,
  type LexicalNode,
} from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $isFileNode,
  FILE,
  FileAttachment,
  type FileNode,
  type FileUploadError,
  fileKind,
  formatFileSize,
} from '../../src/extensions/file/index.js';
import { $isImageNode, Image } from '../../src/extensions/image/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, setExtensionOptions, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
beforeEach(() => {
  let next = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${next++}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: unknown = '<p>Hello</p>', options: { image?: boolean } = {}) {
  const editor = createTeiEditor({
    extensions: options.image ? [StarterKit, Image, FileAttachment] : [StarterKit, FileAttachment],
    content,
    contentFormat: typeof content === 'string' ? undefined : 'json',
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const PDF =
  '<a href="https://x.test/report.pdf" download="report.pdf" data-tei-file="" data-ext="PDF" data-size="2516582" title="2.4 MB" type="application/pdf">report.pdf</a>';
const $files = () => $getRoot().getChildren().filter($isFileNode) as FileNode[];
const files = (editor: TeiEditor) =>
  editor.read(() =>
    $files().map((node) => ({
      src: node.getSrc(),
      name: node.getName(),
      size: node.getSize(),
      type: node.getMimeType(),
    })),
  );
const endOf = (editor: TeiEditor) => editor.update(() => $getRoot().selectEnd());
function selectFile(editor: TeiEditor) {
  editor.update(() => {
    const selection = $createNodeSelection();
    selection.add(($files()[0] as LexicalNode).getKey());
    $setSelection(selection);
  });
}
const blob = (name: string, size = 8, type = 'application/pdf') =>
  new File([new Uint8Array(size)], name, { type });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('file: helpers', () => {
  it('fileKind reads the extension; formatFileSize reads like people do', () => {
    expect(fileKind('Report.final.PDF')).toBe('PDF');
    expect(fileKind('notes')).toBe('FILE');
    expect(fileKind('weird.toolongext')).toBe('FILE');
    expect(formatFileSize(820, 'en')).toBe('820 B');
    expect(formatFileSize(2516582, 'en')).toBe('2.4 MB');
    expect(formatFileSize(15 * 1024, 'en')).toBe('15 KB');
    expect(formatFileSize(3 * 1024 ** 4, 'en')).toBe('3 TB');
  });
});

describe('file: JSON, HTML, Markdown', () => {
  it('saves as <a download data-tei-file>, and reads it back', () => {
    const editor = make(PDF);
    expect(files(editor)).toEqual([
      {
        src: 'https://x.test/report.pdf',
        name: 'report.pdf',
        size: 2516582,
        type: 'application/pdf',
      },
    ]);
    expect(editor.getHTML()).toBe(PDF);
    expect(make(editor.getJSON(), {}).getHTML()).toBe(PDF);
  });

  it('JSON holds only what is set', () => {
    const editor = make('<a href="/a.zip" download="a.zip" data-tei-file="">a.zip</a>');
    const json = editor.getJSON() as { root: { children: Record<string, unknown>[] } };
    expect(json.root.children[0]).toMatchObject({ type: 'file', src: '/a.zip', name: 'a.zip' });
    expect(json.root.children[0]).not.toHaveProperty('size');
    expect(json.root.children[0]).not.toHaveProperty('mimeType');
  });

  it('a plain link stays a link; a script URL is never a file', () => {
    expect(make('<p><a href="https://x.test">x</a></p>').getHTML()).toContain(
      '<a href="https://x.test"',
    );
    expect(make('<a href="javascript:alert(1)" data-tei-file="">x</a>').getHTML()).not.toContain(
      'data-tei-file',
    );
    const json = {
      root: {
        type: 'root',
        version: 1,
        children: [{ type: 'file', version: 1, src: 'javascript:alert(1)', name: 'x' }],
      },
    };
    expect(files(make(json))[0]?.src).toBe('');
  });

  it('JSON: a size that is not a byte count is unknown', () => {
    const node = (size: unknown) => ({ type: 'file', version: 1, src: '/a', name: 'a', size });
    const json = {
      root: { type: 'root', version: 1, children: [-1, 'big', 1.6, Infinity].map(node) },
    };
    expect(files(make(json)).map((file) => file.size)).toEqual([null, null, 2, null]);
  });

  it('inside a paragraph, it splits it', () => {
    expect(make(`<p>One ${PDF} two</p>`).getHTML()).toBe(`<p>One</p>${PDF}<p>two</p>`);
  });

  it('the DOM: its kind, name and size; a link that downloads it', () => {
    const editor = make(PDF);
    const card = editor.lexical.getRootElement()?.querySelector('.tei-file') as HTMLElement;
    expect(card.getAttribute('data-ext')).toBe('PDF');
    expect(card.querySelector('.tei-file-name')?.textContent).toBe('report.pdf');
    expect(card.querySelector('.tei-file-meta')?.textContent).toBe('2.4 MB');
    const link = card.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://x.test/report.pdf');
    expect(link.getAttribute('download')).toBe('report.pdf');
    expect(card.hasAttribute('style')).toBe(false);
  });

  it('Markdown: out as a link', () => {
    expect(make(PDF).getMarkdown()).toBe('[report.pdf](https://x.test/report.pdf)');
    expect(
      FILE.export(
        $fake(),
        () => '',
        () => '',
      ),
    ).toBeNull();
  });

  it('its text is its name', () => {
    expect(make(PDF).getText()).toBe('report.pdf');
  });
});

function $fake(): LexicalNode {
  return { getType: () => 'paragraph' } as unknown as LexicalNode;
}

describe('file: commands', () => {
  it('insertFile at the caret, refusing a script URL', () => {
    const editor = make();
    endOf(editor);
    expect(editor.commands.insertFile({ src: 'javascript:alert(1)', name: 'x' })).toBe(false);
    expect(editor.can().insertFile({ src: 'javascript:alert(1)', name: 'x' })).toBe(false);
    expect(
      editor.commands.insertFile({ src: ' https://x.test/a.zip ', name: 'a.zip', size: 10 }),
    ).toBe(true);
    expect(editor.getHTML()).toBe(
      '<p>Hello</p><a href="https://x.test/a.zip" download="a.zip" data-tei-file="" data-ext="ZIP" data-size="10" title="10 B">a.zip</a><p><br></p>',
    );
  });

  it('rename, and remove, on the selected file or by key', () => {
    const editor = make(`<p>a</p>${PDF}<p>b</p>`);
    expect(editor.can().renameFile('x')).toBe(false);
    selectFile(editor);
    expect(editor.isActive('file')).toBe(true);
    expect(editor.commands.renameFile('   ')).toBe(false);
    editor.commands.renameFile(' Q3 report.pdf ');
    expect(files(editor)[0]?.name).toBe('Q3 report.pdf');
    const key = editor.read(() => ($files()[0] as FileNode).getKey());
    editor.update(() => $getRoot().selectStart());
    editor.commands.removeFile(key);
    expect(editor.getHTML()).toBe('<p>a</p><p>b</p>');
  });

  it('the fileMenu items', () => {
    expect(
      make()
        .items('fileMenu')
        .map((item) => item.id),
    ).toEqual(['fileDownload', 'fileRename', 'fileReplace', 'removeFile']);
  });
});

describe('file: uploads', () => {
  it('shows the file at once with its progress, then its URL; one undo step', async () => {
    const editor = make();
    let progress!: (fraction: number) => void;
    let resolve!: (src: string) => void;
    setExtensionOptions(editor, FileAttachment, {
      upload: (_file, context) => {
        progress = context.onProgress;
        return new Promise((r) => {
          resolve = r;
        });
      },
    });
    endOf(editor);
    editor.commands.insertFiles([blob('deck.pdf', 2048)]);
    expect(files(editor)).toEqual([
      { src: '', name: 'deck.pdf', size: 2048, type: 'application/pdf' },
    ]);
    const card = () => editor.lexical.getRootElement()?.querySelector('.tei-file') as HTMLElement;
    expect(card().hasAttribute('data-tei-uploading')).toBe(true);
    expect(card().querySelector('a')?.hasAttribute('href')).toBe(false);
    progress(0.5);
    expect(card().style.getPropertyValue('--tei-progress')).toBe('0.5');
    resolve('https://cdn.test/deck.pdf');
    await flush();
    expect(files(editor)[0]?.src).toBe('https://cdn.test/deck.pdf');
    expect(card().hasAttribute('data-tei-uploading')).toBe(false);
    editor.commands.undo();
    expect(files(editor)).toHaveLength(0);
  });

  it('without a handler, keeps it as a data URL', async () => {
    const editor = make();
    endOf(editor);
    editor.commands.insertFiles([blob('a.txt', 3, 'text/plain')]);
    await vi.waitFor(() => expect(files(editor)[0]?.src).toMatch(/^data:text\/plain;base64,/));
  });

  it('takes the file out on failure or an unsafe URL, and says why', async () => {
    const errors: FileUploadError[] = [];
    const editor = make();
    setExtensionOptions(editor, FileAttachment, {
      upload: (file) =>
        file.name === 'bad.pdf'
          ? Promise.reject(new Error('offline'))
          : Promise.resolve('javascript:x'),
      onUploadError: (error) => errors.push(error),
    });
    endOf(editor);
    editor.commands.insertFiles([blob('bad.pdf'), blob('evil.pdf')]);
    await flush();
    expect(files(editor)).toHaveLength(0);
    expect(errors.map((e) => e.code).sort()).toEqual(['unsafe', 'upload']);
  });

  it('refuses a file too large, or one outside accept', () => {
    const errors: FileUploadError[] = [];
    const editor = make();
    setExtensionOptions(editor, FileAttachment, {
      maxFileSize: 4,
      accept: '.pdf',
      onUploadError: (error) => errors.push(error),
    });
    endOf(editor);
    expect(editor.commands.insertFiles([blob('big.pdf', 10), blob('a.txt', 1, 'text/plain')])).toBe(
      false,
    );
    expect(errors.map((e) => [e.code, e.file.name])).toEqual([['size', 'big.pdf']]);
  });

  it('replaceFile uploads in place; removing the file aborts its upload', async () => {
    const signals: AbortSignal[] = [];
    const editor = make(PDF);
    setExtensionOptions(editor, FileAttachment, {
      upload: (_file, { signal }) => {
        signals.push(signal);
        return new Promise(() => {});
      },
    });
    selectFile(editor);
    editor.commands.replaceFile(blob('new.docx', 5, 'application/msword'));
    expect(files(editor)).toEqual([
      { src: '', name: 'new.docx', size: 5, type: 'application/msword' },
    ]);
    // Nothing to download while it uploads.
    expect(
      editor.lexical.getRootElement()?.querySelector('.tei-file a')?.hasAttribute('href'),
    ).toBe(false);
    selectFile(editor);
    editor.commands.removeFile();
    expect(signals[0]?.aborted).toBe(true);
    // The only block: an empty line takes its place, with the caret.
    expect(editor.isEmpty).toBe(true);
    expect(editor.read(() => $getRoot().getFirstChild()?.getType())).toBe('paragraph');
    editor.update(() => $getSelection()?.insertText('x'));
    expect(editor.getHTML()).toBe('<p>x</p>');
  });

  it('dropped files: images to the Image extension, the rest attached first', () => {
    const editor = make('<p>Hello</p>', { image: true });
    endOf(editor);
    editor.update(() => {
      editor.lexical.dispatchCommand(DRAG_DROP_PASTE, [
        blob('photo.png', 4, 'image/png'),
        blob('notes.pdf', 4),
      ]);
    });
    const kinds = editor.read(() =>
      $getRoot()
        .getChildren()
        .map((node) =>
          $isFileNode(node) ? 'file' : $isImageNode(node) ? 'image' : node.getType(),
        ),
    );
    expect(kinds).toEqual(['paragraph', 'file', 'image', 'paragraph']);
    // Only images: the file extension leaves them be.
    const other = make('<p>Hi</p>', { image: true });
    endOf(other);
    other.update(() => {
      other.lexical.dispatchCommand(DRAG_DROP_PASTE, [blob('a.png', 4, 'image/png')]);
    });
    expect(files(other)).toHaveLength(0);
  });

  it('an image chosen to attach is attached, Image extension or not', () => {
    const editor = make('<p>Hello</p>', { image: true });
    endOf(editor);
    expect(editor.commands.insertFiles([blob('photo.png', 4, 'image/png')])).toBe(true);
    expect(files(editor).map((file) => file.name)).toEqual(['photo.png']);
  });
});
