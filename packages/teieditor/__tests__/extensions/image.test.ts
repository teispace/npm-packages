import { $dfs } from '@lexical/utils';
import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $setSelection,
  type LexicalNode,
} from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $getImage,
  $isImageNode,
  $isInlineImageNode,
  IMAGE,
  Image,
  type ImageNode,
  type ImageUploadError,
  type ImageUploadHandler,
  INLINE_IMAGE,
} from '../../src/extensions/image/index.js';
import { MARKDOWN_LINK } from '../../src/extensions/link/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, setExtensionOptions, type TeiEditor } from '../../src/index.js';
import { acceptsFile, readAsDataURL } from '../../src/utils/files.js';

const editors: TeiEditor[] = [];
const urls = new Set<string>();
let next = 0;
beforeEach(() => {
  next = 0;
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test/${next++}`;
    urls.add(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => void urls.delete(url));
});
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: unknown = '<p>Hello</p>', contentFormat?: 'markdown' | 'json') {
  const editor = createTeiEditor({ extensions: [StarterKit, Image], content, contentFormat });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const PHOTO = '<img src="https://x.test/a.png" alt="A" width="200" height="100">';
const $images = () => $getRoot().getChildren().filter($isImageNode) as ImageNode[];
const images = (editor: TeiEditor) =>
  editor.read(() =>
    $images().map((node) => ({
      src: node.getSrc(),
      alt: node.getAltText(),
      width: node.getWidth(),
      height: node.getHeight(),
      align: node.getAlign(),
      caption: node.getCaption()?.getTextContent() ?? null,
    })),
  );
const endOf = (editor: TeiEditor) => editor.update(() => $getRoot().selectEnd());
function selectImage(editor: TeiEditor, index = 0) {
  editor.update(() => {
    const selection = $createNodeSelection();
    selection.add(($images()[index] as LexicalNode).getKey());
    $setSelection(selection);
  });
}
const png = (name = 'a.png', size = 4, type = 'image/png') =>
  new File([new Uint8Array(size)], name, { type });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('image: JSON', () => {
  it('writes only what is set, and reads it back', () => {
    const editor = make(`<figure data-align="end">${PHOTO}<figcaption>Hi</figcaption></figure>`);
    const json = editor.getJSON() as { root: { children: Record<string, unknown>[] } };
    const node = json.root.children[0] as Record<string, unknown>;
    expect(node).toMatchObject({
      type: 'image',
      src: 'https://x.test/a.png',
      altText: 'A',
      width: 200,
      height: 100,
      align: 'end',
    });
    const plain = make(PHOTO).getJSON() as { root: { children: Record<string, unknown>[] } };
    expect(Object.keys(plain.root.children[0] as object).sort()).toEqual(
      ['altText', 'height', 'src', 'type', 'version', 'width'].sort(),
    );
    expect(images(make(json, 'json'))).toEqual(images(editor));
  });

  it('reads 4.x images: a string caption and "inherit" for no size', () => {
    const editor = make(
      {
        root: {
          type: 'root',
          version: 1,
          children: [
            {
              type: 'image',
              version: 1,
              src: 'https://x.test/a.png',
              altText: 'Old',
              width: 'inherit',
              height: 'inherit',
              caption: 'From 4.x',
            },
          ],
        },
      },
      'json',
    );
    expect(images(editor)).toEqual([
      {
        src: 'https://x.test/a.png',
        alt: 'Old',
        width: null,
        height: null,
        align: 'center',
        caption: 'From 4.x',
      },
    ]);
  });

  it("reads the Lexical playground's images: a nested caption editor, shown or not", () => {
    const caption = {
      editorState: {
        root: { children: [{ children: [{ text: 'Shown', type: 'text' }], type: 'paragraph' }] },
      },
    };
    const image = (showCaption: boolean) => ({
      type: 'image',
      version: 1,
      src: 'https://x.test/a.png',
      altText: 'P',
      width: 0,
      height: 0,
      maxWidth: 500,
      showCaption,
      caption,
    });
    const editor = make(
      { root: { type: 'root', version: 1, children: [image(true), image(false)] } },
      'json',
    );
    expect(images(editor).map((i) => [i.width, i.caption])).toEqual([
      [null, 'Shown'],
      [null, null],
    ]);
  });

  it('refuses a script URL however it arrives', () => {
    const json = {
      root: {
        type: 'root',
        version: 1,
        children: [{ type: 'image', version: 1, src: 'javascript:alert(1)', altText: '' }],
      },
    };
    expect(images(make(json, 'json'))[0]?.src).toBe('');
    expect(images(make('<img src="javascript:alert(1)"><p>x</p>'))).toEqual([]);
    expect(images(make('<img src="data:text/html,<script>1</script>"><p>x</p>'))).toEqual([]);
    const editor = make();
    endOf(editor);
    expect(editor.can().insertImage({ src: 'javascript:alert(1)' })).toBe(false);
    expect(editor.commands.insertImage({ src: 'javascript:alert(1)' })).toBe(false);
    expect(editor.commands.insertImage({ src: ' https://x.test/b.png ' })).toBe(true);
    selectImage(editor);
    expect(editor.commands.setImageSrc('vbscript:x')).toBe(false);
    expect(images(editor)[0]?.src).toBe('https://x.test/b.png');
  });
});

describe('image: HTML', () => {
  it('a bare <img> for a plain image, a <figure> for a caption or an alignment', () => {
    expect(make(PHOTO).getHTML()).toBe(PHOTO);
    const figure = `<figure data-align="start">${PHOTO}<figcaption>Hi <strong>there</strong></figcaption></figure>`;
    expect(make(figure).getHTML()).toBe(figure);
    expect(make(`<figure>${PHOTO}</figure>`).getHTML()).toBe(PHOTO);
  });

  it('a figure without an image is left to the other rules', () => {
    expect(make('<figure><blockquote>Quote</blockquote></figure>').getHTML()).toBe(
      '<blockquote>Quote</blockquote>',
    );
  });

  it('an image on a line of its own is a block, splitting what it was in', () => {
    expect(make(`<p>${PHOTO}</p>`).getHTML()).toBe(PHOTO);
    expect(make(`<p>One</p>${PHOTO}<div>two</div>`).getHTML()).toBe(`<p>One</p>${PHOTO}<p>two</p>`);
    expect(make(`<p>One<br>${PHOTO}</p>`).getHTML()).toBe(`<p>One</p>${PHOTO}`);
    // The line breaks either side of it go: it is a block.
    expect(make(`<p>One<br>\n${PHOTO}<br>two</p>`).getHTML()).toBe(`<p>One</p>${PHOTO}<p>two</p>`);
    expect(make(`<p>One<br>two</p>`).getHTML()).toBe('<p>One<br>two</p>');
    expect(make(`<ul><li>a</li><li>${PHOTO}</li><li>b</li></ul>`).getHTML()).toBe(
      `<ul><li>a</li></ul>${PHOTO}<ul><li>b</li></ul>`,
    );
  });

  it('a caption is a field of the document: in the DOM inside the figcaption', () => {
    const editor = make(`<figure>${PHOTO}<figcaption>Hi</figcaption></figure>`);
    const root = editor.lexical.getRootElement() as HTMLElement;
    const figcaption = root.querySelector('figure figcaption') as HTMLElement;
    expect(figcaption.querySelector('[data-lexical-slot="caption"] p')?.textContent).toBe('Hi');
    expect(figcaption.getAttribute('data-placeholder')).toBe('Write a caption…');
    // Attributes only: nothing for a strict style-src to report.
    expect(root.querySelector('figure img')?.hasAttribute('style')).toBe(false);
  });
});

describe('image: Markdown', () => {
  it('![alt](src "caption") on a line of its own, both ways', () => {
    const editor = make(
      'Text\n\n![An \\] alt](https://x.test/a.png "A \\"caption\\"")\n\nMore',
      'markdown',
    );
    expect(images(editor)).toMatchObject([
      { src: 'https://x.test/a.png', alt: 'An ] alt', caption: 'A "caption"' },
    ]);
    expect(editor.getMarkdown()).toBe(
      'Text\n\n![An \\] alt](https://x.test/a.png "A \\"caption\\"")\n\nMore',
    );
    expect(make('![](https://x.test/a b.png)', 'markdown').getHTML()).not.toContain('<img');
    expect(
      IMAGE.export(
        $fakeParagraph(),
        () => '',
        () => '',
      ),
    ).toBeNull();
  });

  it('refuses a script URL', () => {
    expect(make('![x](javascript:alert(1))', 'markdown').getHTML()).not.toContain('<img');
  });

  it('a link never takes the [alt](src) of an image', () => {
    expect(MARKDOWN_LINK.regExp.test('![x](https://a.test)')).toBe(false);
    expect(MARKDOWN_LINK.regExp.test('see [x](https://a.test)')).toBe(true);
    expect(MARKDOWN_LINK.importRegExp?.test('![x](https://a.test)')).toBe(false);
    expect(make('[x](https://a.test)', 'markdown').getHTML()).toContain('<a href="https://a.test"');
  });
});

/** A node that is not an image, for the transformer's `export`. */
function $fakeParagraph(): LexicalNode {
  return { getType: () => 'paragraph' } as unknown as LexicalNode;
}

describe('image: commands', () => {
  it('insertImage puts the caret on the line after; with a caption, in the caption', () => {
    const editor = make('<p>Hello</p>');
    endOf(editor);
    expect(editor.commands.insertImage({ src: 'https://x.test/a.png', altText: 'A' })).toBe(true);
    editor.update(() => $getRoot().getLastChild()?.selectEnd());
    expect(editor.getHTML()).toBe(
      '<p>Hello</p><img src="https://x.test/a.png" alt="A"><p><br></p>',
    );
    editor.commands.insertImage({ src: 'https://x.test/b.png', caption: true });
    expect(editor.read(() => $getImage()?.getSrc())).toBe('https://x.test/b.png');
    expect(editor.isActive('imageCaption')).toBe(true);
  });

  it('on an empty line, takes its place', () => {
    const editor = make('<p>Hello</p><p></p>');
    endOf(editor);
    editor.commands.insertImage({ src: 'https://x.test/a.png' });
    expect(editor.getHTML()).toBe('<p>Hello</p><img src="https://x.test/a.png" alt=""><p><br></p>');
  });

  it('with the image selected, after it', () => {
    const editor = make(`${PHOTO}<p>End</p>`);
    selectImage(editor);
    editor.commands.insertImage({ src: 'https://x.test/b.png' });
    expect(images(editor).map((i) => i.src)).toEqual([
      'https://x.test/a.png',
      'https://x.test/b.png',
    ]);
  });

  it('align, alt text, size, caption and remove, on the selected image or by key', () => {
    const editor = make(`<p>a</p>${PHOTO}<p>b</p>`);
    expect(editor.can().setImageAlign('start')).toBe(false);
    selectImage(editor);
    expect(editor.isActive('image')).toBe(true);
    expect(editor.isActive('imageAlign', 'center')).toBe(true);
    editor.commands.setImageAlign('start');
    expect(editor.isActive('imageAlign', 'start')).toBe(true);
    expect(editor.commands.setImageAlign('sideways' as never)).toBe(false);
    editor.commands.setImageAltText('  Trimmed  ');
    // Keeps the proportions of the height given, and never below minWidth.
    editor.commands.setImageSize(150, 75);
    expect(images(editor)[0]).toMatchObject({
      alt: 'Trimmed',
      width: 150,
      height: 75,
      align: 'start',
    });
    editor.commands.setImageSize(10, 5);
    expect(images(editor)[0]).toMatchObject({ width: 64, height: 32 });
    editor.commands.setImageSize(null);
    expect(images(editor)[0]).toMatchObject({ width: null, height: null });
    editor.commands.toggleImageCaption();
    expect(images(editor)[0]?.caption).toBe('');
    expect(editor.isActive('imageCaption')).toBe(true);
    editor.commands.toggleImageCaption();
    expect(images(editor)[0]?.caption).toBeNull();
    // Taking the caption away from inside it selects the image.
    expect(editor.isActive('image')).toBe(true);
    const key = editor.read(() => ($images()[0] as ImageNode).getKey());
    editor.update(() => $getRoot().selectStart());
    editor.commands.setImageAlign('end', key);
    expect(images(editor)[0]?.align).toBe('end');
    editor.commands.removeImage(key);
    expect(editor.getHTML()).toBe('<p>a</p><p>b</p>');
  });

  it('options: no resizing, no captions', () => {
    const editor = make(PHOTO);
    setExtensionOptions(editor, Image, { resizable: false, captions: false });
    selectImage(editor);
    expect(editor.can().setImageSize(100)).toBe(false);
    expect(editor.can().toggleImageCaption()).toBe(false);
    expect(editor.items('imageMenu').some((item) => item.id === 'imageCaption')).toBe(false);
  });

  it('openImageInsert asks a mounted UI, else the browser for files', () => {
    const editor = make();
    endOf(editor);
    const storage = editor.extension(Image)?.output.storage as {
      pickers: { value: number };
      insertRequest: { value: number };
    };
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    editor.commands.openImageInsert();
    expect(click).toHaveBeenCalledTimes(1);
    storage.pickers.value = 1;
    editor.commands.openImageInsert();
    expect(storage.insertRequest.value).toBe(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});

describe('inline image', () => {
  const IMG = '<img src="https://x.test/i.png" alt="I" width="20" height="20"';
  const $inline = () =>
    $dfs()
      .map(({ node }) => node)
      .filter($isInlineImageNode);
  const inlines = (editor: TeiEditor) =>
    editor.read(() =>
      $inline().map((node) => ({
        src: node.getSrc(),
        alt: node.getAltText(),
        float: node.getFloat(),
      })),
    );
  function selectInline(editor: TeiEditor) {
    editor.update(() => {
      const selection = $createNodeSelection();
      selection.add(($inline()[0] as LexicalNode).getKey());
      $setSelection(selection);
    });
  }

  it('HTML: in a line of text it stays there, saved with data-inline and its float', () => {
    const editor = make(`<p>One ${IMG}> two</p>`);
    expect(inlines(editor)).toEqual([{ src: 'https://x.test/i.png', alt: 'I', float: 'none' }]);
    expect(editor.getHTML()).toBe(`<p>One ${IMG} data-inline=""> two</p>`);
    // data-inline keeps it inline even on a line of its own; data-float is read back.
    const floated = `<p>${IMG} data-inline="" data-float="end"></p>`;
    expect(make(floated).getHTML()).toBe(floated);
    expect(make(`<p>${IMG} data-inline="" data-float="up"></p>`).getHTML()).not.toContain(
      'data-float',
    );
    expect(make('<p>a <img src="javascript:alert(1)"> b</p>').getHTML()).toBe('<p>a b</p>');
    // Its spaces, through the spans a copied line comes in.
    expect(make(`<p><span>One </span>${IMG}><span> two</span></p>`).getHTML()).toBe(
      `<p>One ${IMG} data-inline=""> two</p>`,
    );
    // Safari's copy: the spaces in spans of their own.
    expect(
      make(`<span>One<span> </span></span>${IMG}><span><span> </span>two</span>`).getHTML(),
    ).toBe(`<p>One ${IMG} data-inline=""> two</p>`);
    // Indented markup round an image on a line of its own adds nothing.
    expect(make(`<p>\n  ${IMG}>\n</p>`).getHTML()).toBe(`${IMG}>`);
    // Pasted from inside a paragraph, without the paragraph.
    expect(make(`One <span>${IMG}></span> two`).getHTML()).toContain('data-inline');
    // In a list item with text.
    expect(make(`<ul><li>a ${IMG}></li></ul>`).getHTML()).toBe(
      `<ul><li>a ${IMG} data-inline=""></li></ul>`,
    );
  });

  it('JSON: its float, only when set', () => {
    const editor = make(`<p>x ${IMG} data-inline="" data-float="start"></p>`);
    const json = editor.getJSON() as {
      root: { children: { children: Record<string, unknown>[] }[] };
    };
    expect(json.root.children[0]?.children[1]).toMatchObject({
      type: 'inline-image',
      src: 'https://x.test/i.png',
      width: 20,
      float: 'start',
    });
    const plain = make(`<p>x ${IMG}></p>`).getJSON() as typeof json;
    expect(plain.root.children[0]?.children[1]).not.toHaveProperty('float');
    expect(make(json, 'json').getHTML()).toBe(editor.getHTML());
  });

  it('Markdown: ![alt](src) in a line of text, both ways', () => {
    const md = 'Look ![an \\] icon](https://x.test/i.png) here';
    const editor = make(md, 'markdown');
    expect(inlines(editor)).toEqual([
      { src: 'https://x.test/i.png', alt: 'an ] icon', float: 'none' },
    ]);
    expect(editor.getMarkdown()).toBe(md);
    expect(make('a ![x](javascript:alert(1)) b', 'markdown').getHTML()).not.toContain('<img');
    expect(
      INLINE_IMAGE.export?.(
        $fakeParagraph(),
        () => '',
        () => '',
      ),
    ).toBeNull();
  });

  it('insertImage({ inline }) puts it at the caret, the caret after it', () => {
    const editor = make('<p>Hello</p>');
    endOf(editor);
    expect(
      editor.commands.insertImage({ src: 'https://x.test/i.png', inline: true, float: 'end' }),
    ).toBe(true);
    editor.update(() => $getSelection()?.insertText('!'));
    expect(editor.getHTML()).toBe(
      '<p>Hello<img src="https://x.test/i.png" alt="" data-inline="" data-float="end">!</p>',
    );
    // With a block image selected: on a new line after it.
    const other = make(`${PHOTO}<p>End</p>`);
    selectImage(other);
    other.commands.insertImage({ src: 'https://x.test/i.png', inline: true });
    expect(other.getHTML()).toBe(
      `${PHOTO}<p><img src="https://x.test/i.png" alt="" data-inline=""></p><p>End</p>`,
    );
  });

  it('setImageInline turns a block into an inline image and back, keeping what it has', () => {
    const editor = make(
      `<figure data-align="end">${PHOTO}<figcaption>Hi <b>there</b></figcaption></figure>`,
    );
    selectImage(editor);
    expect(editor.isActive('imageInline')).toBe(false);
    editor.commands.setImageInline();
    // The side becomes a float; the caption the line after it.
    expect(editor.getHTML()).toBe(
      '<p><img src="https://x.test/a.png" alt="A" width="200" height="100" data-inline="" data-float="end"></p><p>Hi <strong>there</strong></p>',
    );
    expect(editor.isActive('imageInline')).toBe(true);
    expect(editor.isActive('imageAlign', 'end')).toBe(true);
    editor.commands.setImageInline(true);
    expect(inlines(editor)).toHaveLength(1);
    editor.commands.setImageInline(false);
    expect(images(editor)).toMatchObject([{ align: 'end', width: 200, caption: null }]);
    expect(editor.isActive('image')).toBe(true);
  });

  it('an inline image out of its line of text is lifted to a block of its own', () => {
    const editor = make(`<p>a ${IMG}> b</p>`);
    selectInline(editor);
    editor.commands.setImageInline(false);
    expect(editor.getHTML()).toBe(`<p>a</p>${IMG}><p>b</p>`);
  });

  it('align floats an inline image (again to unfloat); centre or full makes it a block', () => {
    const editor = make(`<p>a ${IMG}> b</p>`);
    selectInline(editor);
    expect(editor.isActive('imageAlign', 'start')).toBe(false);
    editor.commands.setImageAlign('start');
    expect(inlines(editor)[0]?.float).toBe('start');
    expect(editor.isActive('imageAlign', 'start')).toBe(true);
    editor.commands.setImageAlign('start');
    expect(inlines(editor)[0]?.float).toBe('none');
    editor.commands.setImageAlign('full');
    expect(inlines(editor)).toHaveLength(0);
    expect(images(editor)).toMatchObject([{ align: 'full' }]);
  });

  it('a caption makes it a block, the caret in the caption; not without captions', () => {
    const editor = make(`<p>a ${IMG}> b</p>`);
    selectInline(editor);
    expect(editor.isActive('imageCaption')).toBe(false);
    editor.commands.toggleImageCaption();
    expect(images(editor)).toMatchObject([{ caption: '' }]);
    expect(editor.isActive('imageCaption')).toBe(true);
    const off = make(`<p>a ${IMG}> b</p>`);
    setExtensionOptions(off, Image, { captions: false });
    selectInline(off);
    expect(off.can().toggleImageCaption()).toBe(false);
    expect(off.commands.toggleImageCaption()).toBe(false);
  });

  it('size, alt text and remove work on it too', () => {
    const editor = make(`<p>a ${IMG}> b</p>`);
    selectInline(editor);
    editor.commands.setImageSize(40, 40);
    editor.commands.setImageAltText('Icon');
    expect(editor.read(() => [$inline()[0]?.getWidth(), $inline()[0]?.getAltText()])).toEqual([
      40,
      'Icon',
    ]);
    editor.commands.removeImage();
    editor.update(() => $getSelection()?.insertText('|'));
    expect(editor.getHTML()).toBe('<p>a | b</p>');
  });

  it('no switching kinds while it uploads', () => {
    const editor = make(`<p>a ${IMG}> b</p>`);
    setExtensionOptions(editor, Image, { upload: () => new Promise(() => {}) });
    selectInline(editor);
    editor.commands.replaceImageFile(png());
    expect(editor.can().setImageInline()).toBe(false);
    expect(editor.commands.setImageInline(false)).toBe(false);
    expect(editor.commands.setImageAlign('center')).toBe(false);
    expect(editor.commands.toggleImageCaption()).toBe(false);
    // Floating is fine.
    expect(editor.commands.setImageAlign('end')).toBe(true);
    expect(
      editor.lexical
        .getRootElement()
        ?.querySelector('.tei-inline-image')
        ?.hasAttribute('data-tei-uploading'),
    ).toBe(true);
  });
});

describe('image: uploads', () => {
  function deferred() {
    let resolve!: (src: string | { src: string; width?: number; height?: number }) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<string | { src: string; width?: number }>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('shows the file at once, its progress on the DOM, then the URL; one undo step', async () => {
    const editor = make('<p>Hello</p>');
    const job = deferred();
    let progress: (n: number) => void = () => {};
    const upload: ImageUploadHandler = vi.fn((_file, ctx) => {
      progress = ctx.onProgress;
      return job.promise;
    });
    setExtensionOptions(editor, Image, { upload });
    endOf(editor);
    editor.commands.insertImageFiles([png()]);
    expect(upload).toHaveBeenCalledTimes(1);
    const dom = () =>
      editor.lexical.getRootElement()?.querySelector('[data-tei-image]') as HTMLElement;
    expect(images(editor)[0]?.src).toBe('blob:test/0');
    expect(dom().hasAttribute('data-tei-uploading')).toBe(true);
    progress(0.25);
    expect(dom().style.getPropertyValue('--tei-progress')).toBe('0.25');
    progress(7);
    expect(dom().style.getPropertyValue('--tei-progress')).toBe('1');
    job.resolve({ src: 'https://cdn.test/a.png', width: 80, height: 40 });
    await flush();
    expect(images(editor)[0]).toMatchObject({
      src: 'https://cdn.test/a.png',
      width: 80,
      height: 40,
    });
    expect(dom().hasAttribute('data-tei-uploading')).toBe(false);
    expect(dom().style.getPropertyValue('--tei-progress')).toBe('');
    expect(urls.size).toBe(0);
    editor.commands.undo();
    expect(images(editor)).toEqual([]);
  });

  it('without a handler, keeps the file as a data URL', async () => {
    const editor = make();
    endOf(editor);
    editor.commands.insertImageFiles([png()]);
    await vi.waitFor(() => expect(images(editor)[0]?.src).toMatch(/^data:image\/png;base64,/));
  });

  it('takes the image out on failure, and on a URL that is not an image’s', async () => {
    const errors: ImageUploadError[] = [];
    for (const outcome of ['reject', 'unsafe'] as const) {
      const editor = make('<p>Hello</p>');
      const job = deferred();
      setExtensionOptions(editor, Image, {
        upload: () => job.promise,
        onUploadError: (error) => errors.push(error),
      });
      endOf(editor);
      editor.commands.insertImageFiles([png(`${outcome}.png`)]);
      if (outcome === 'reject') job.reject(new Error('offline'));
      else job.resolve('javascript:alert(1)');
      await flush();
      expect(images(editor)).toEqual([]);
    }
    expect(errors.map((e) => [e.code, e.file.name])).toEqual([
      ['upload', 'reject.png'],
      ['unsafe', 'unsafe.png'],
    ]);
    expect(errors[0]?.cause).toEqual(new Error('offline'));
    expect(urls.size).toBe(0);
  });

  it('aborts an upload when its image is deleted, and ignores its late result', async () => {
    const editor = make('<p>Hello</p>');
    const job = deferred();
    let signal: AbortSignal | undefined;
    const onUploadError = vi.fn();
    setExtensionOptions(editor, Image, {
      upload: (_file, ctx) => {
        signal = ctx.signal;
        return job.promise;
      },
      onUploadError,
    });
    endOf(editor);
    editor.commands.insertImageFiles([png()]);
    selectImage(editor);
    editor.commands.removeImage();
    expect(signal?.aborted).toBe(true);
    job.resolve('https://cdn.test/a.png');
    await flush();
    expect(images(editor)).toEqual([]);
    expect(onUploadError).not.toHaveBeenCalled();
    expect(urls.size).toBe(0);
  });

  it('accepts only matching files, and refuses large ones with an error', () => {
    const editor = make();
    const onUploadError = vi.fn();
    setExtensionOptions(editor, Image, {
      maxFileSize: 10,
      onUploadError,
      upload: () => new Promise(() => {}),
    });
    endOf(editor);
    expect(
      editor.commands.insertImageFiles([new File(['x'], 'a.pdf', { type: 'application/pdf' })]),
    ).toBe(false);
    expect(editor.commands.insertImageFiles([png('big.png', 11)])).toBe(false);
    expect(onUploadError).toHaveBeenCalledWith(expect.objectContaining({ code: 'size' }));
    expect(editor.commands.insertImageFiles([png('a.png'), png('b.png')])).toBe(true);
    expect(images(editor)).toHaveLength(2);
  });

  it('replaceImageFile uploads in place, the image keeping its place and caption', async () => {
    const editor = make(`<figure>${PHOTO}<figcaption>Kept</figcaption></figure>`);
    setExtensionOptions(editor, Image, { upload: async () => 'https://cdn.test/new.png' });
    selectImage(editor);
    editor.commands.replaceImageFile(png());
    expect(images(editor)[0]).toMatchObject({ src: expect.stringMatching(/^blob:/), width: null });
    await flush();
    expect(images(editor)[0]).toMatchObject({ src: 'https://cdn.test/new.png', caption: 'Kept' });
  });

  it('destroying the editor aborts what is in flight', () => {
    const editor = make();
    let signal: AbortSignal | undefined;
    setExtensionOptions(editor, Image, {
      upload: (_f, ctx) => {
        signal = ctx.signal;
        return new Promise(() => {});
      },
    });
    endOf(editor);
    editor.commands.insertImageFiles([png()]);
    editor.destroy();
    editors.splice(editors.indexOf(editor), 1);
    expect(signal?.aborted).toBe(true);
    expect(urls.size).toBe(0);
  });
});

describe('files', () => {
  it('acceptsFile reads accept lists as an input does', () => {
    const file = { name: 'Photo.PNG', type: 'image/png' };
    expect(acceptsFile(file, 'image/*')).toBe(true);
    expect(acceptsFile(file, 'image/jpeg, .png')).toBe(true);
    expect(acceptsFile(file, ['image/png'])).toBe(true);
    expect(acceptsFile(file, 'video/*,.jpg')).toBe(false);
    expect(acceptsFile(file, '')).toBe(true);
    expect(acceptsFile({ name: 'x', type: 'imagex/png' }, 'image/*')).toBe(false);
  });

  it('readAsDataURL reads, reports progress and aborts', async () => {
    const onProgress = vi.fn();
    await expect(
      readAsDataURL(new Blob(['hi'], { type: 'text/plain' }), { onProgress }),
    ).resolves.toBe('data:text/plain;base64,aGk=');
    const controller = new AbortController();
    const reading = readAsDataURL(new Blob(['x']), { signal: controller.signal });
    controller.abort();
    await expect(reading).rejects.toBeDefined();
  });
});
