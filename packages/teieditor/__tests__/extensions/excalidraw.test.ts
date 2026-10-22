import { $dfs } from '@lexical/utils';
import { $getRoot, KEY_ENTER_COMMAND } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { $selectNode } from '../../src/core/slot-host.js';
import { holdUi } from '../../src/core/ui-request.js';
import {
  $getExcalidraw,
  $isExcalidrawNode,
  cleanPreview,
  cleanScene,
  Excalidraw,
  type ExcalidrawOptions,
  type ExcalidrawStorage,
  MAX_PREVIEW_SIZE,
  parseScene,
  sanitizeSvg,
  svgDataURL,
} from '../../src/extensions/excalidraw/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string | object = '<p>Hi</p>', options: Partial<ExcalidrawOptions> = {}) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Excalidraw.configure(options)],
    content,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect/></svg>';
const PREVIEW = svgDataURL(SVG);
const RECT = { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, version: 1 };
const IMAGE = { id: 'i1', type: 'image', fileId: 'f1', x: 0, y: 0, version: 1 };
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const FILE = { id: 'f1', mimeType: 'image/png', dataURL: PNG, created: 1 };

const drawings = (editor: TeiEditor) =>
  editor.read(() =>
    $dfs()
      .map(({ node }) => node)
      .filter($isExcalidrawNode)
      .map((n) => ({
        key: n.getKey(),
        elements: n.getScene().elements.map((el) => el.id),
        files: Object.keys(n.getScene().files),
        preview: n.getPreview(),
        width: n.getWidth(),
        height: n.getHeight(),
        align: n.getAlign(),
        altText: n.getAltText(),
      })),
  );
const storage = (editor: TeiEditor) =>
  editor.extension(Excalidraw)?.output.storage as ExcalidrawStorage;
const doc = (node: object) => ({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children: [{ type: 'excalidraw', version: 1, ...node }],
  },
});

describe('Excalidraw: scenes and previews', () => {
  it('keeps elements with an id and a type, not deleted ones, and the files they use', () => {
    const scene = cleanScene({
      elements: [
        RECT,
        IMAGE,
        { id: 'gone', type: 'rectangle', isDeleted: true },
        { type: 'no-id' },
        'text',
        null,
      ],
      files: { f1: FILE, unused: { ...FILE, id: 'unused' } },
    });
    expect(scene?.elements.map((el) => el.id)).toEqual(['r1', 'i1']);
    expect(Object.keys(scene?.files ?? {})).toEqual(['f1']);
  });

  it('drops files that are not raster image data', () => {
    for (const dataURL of [
      'data:image/svg+xml;base64,PHN2Zy8+',
      'javascript:alert(1)',
      'https://evil.test/a.png',
      'data:text/html;base64,PGgxPg==',
      'data:image/png;base64,<script>',
    ]) {
      const scene = cleanScene({ elements: [IMAGE], files: { f1: { ...FILE, dataURL } } });
      expect(scene?.files).toEqual({});
    }
  });

  it('refuses what is not a scene, or is too big', () => {
    expect(cleanScene(null)).toBeNull();
    expect(cleanScene({ elements: 'x' })).toBeNull();
    expect(cleanScene([RECT])).toBeNull();
    expect(cleanScene({ elements: [RECT] }, 10)).toBeNull();
    expect(parseScene('{not json')).toBeNull();
    expect(parseScene(JSON.stringify({ elements: [RECT] }))?.elements).toHaveLength(1);
    // Prototype keys are not files.
    expect(cleanScene({ elements: [{ ...IMAGE, fileId: '__proto__' }], files: {} })?.files).toEqual(
      {},
    );
  });

  it('accepts an SVG preview, and nothing that runs or loads', () => {
    expect(cleanPreview(PREVIEW)).toBe(PREVIEW);
    // Text in the drawing that looks like code is text.
    expect(
      cleanPreview(svgDataURL('<svg><text>on = javascript: href=x</text></svg>')),
    ).not.toBeNull();
    expect(
      cleanPreview(
        svgDataURL('<svg><image href="data:image/png;base64,AA=="/><use href="#a"/></svg>'),
      ),
    ).not.toBeNull();
    for (const svg of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"></svg>',
      '<svg><foreignObject><iframe/></foreignObject></svg>',
      '<svg><a href="javascript:alert(1)"><rect/></a></svg>',
      '<svg><image href="https://evil.test/track.png"/></svg>',
      '<svg><image xlink:href="data:image/svg+xml;base64,AA"/></svg>',
      '<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>',
      '<html><body>not svg</body></html>',
    ]) {
      expect(cleanPreview(svgDataURL(svg))).toBeNull();
    }
    expect(cleanPreview('data:image/png;base64,AAAA')).toBeNull();
    expect(cleanPreview('data:image/svg+xml,<svg/>')).toBeNull();
    expect(cleanPreview(`data:image/svg+xml;base64,${'A'.repeat(MAX_PREVIEW_SIZE)}`)).toBeNull();
    expect(cleanPreview(42)).toBeNull();
  });

  it('sanitizeSvg makes an export pass', () => {
    const box = document.createElement('div');
    box.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>x()</script>' +
      '<a href="https://example.com"><rect onclick="x()"/></a><foreignObject><div></div></foreignObject>' +
      '<image href="https://evil.test/x.png"/><use href="#r"/></svg>';
    const svg = box.firstElementChild as SVGSVGElement;
    sanitizeSvg(svg);
    const markup = new XMLSerializer().serializeToString(svg);
    expect(markup).not.toMatch(/script|onload|onclick|<a|foreignObject|evil/);
    expect(markup).toContain('<rect');
    expect(markup).toContain('href="#r"');
    expect(cleanPreview(svgDataURL(markup))).not.toBeNull();
  });
});

describe('Excalidraw: the node', () => {
  it('JSON round trip: scene, preview, size, align and alt text', () => {
    const json = {
      elements: [RECT, IMAGE],
      files: { f1: FILE },
      preview: PREVIEW,
      altText: 'A box',
      width: 300,
      height: 150,
      align: 'end',
    };
    const editor = make(doc(json));
    expect(drawings(editor)).toMatchObject([
      {
        elements: ['r1', 'i1'],
        files: ['f1'],
        preview: PREVIEW,
        width: 300,
        height: 150,
        align: 'end',
        altText: 'A box',
      },
    ]);
    const saved = JSON.stringify(editor.getJSON());
    expect(drawings(make(JSON.parse(saved)))).toEqual(
      drawings(editor).map((d) => ({ ...d, key: expect.any(String) })),
    );
  });

  it('reads Lexical’s playground JSON (the scene as text in `data`)', () => {
    const editor = make(doc({ data: JSON.stringify({ elements: [RECT], files: {} }) }));
    expect(drawings(editor)).toMatchObject([{ elements: ['r1'], preview: null }]);
  });

  it('reads malformed JSON as an empty drawing, without its bad parts', () => {
    const editor = make(
      doc({
        elements: 'nope',
        files: 5,
        preview: 'javascript:alert(1)',
        width: -5,
        height: 'tall',
        align: 'sideways',
        altText: 42,
      }),
    );
    expect(drawings(editor)).toMatchObject([
      { elements: [], preview: null, width: null, height: null, align: 'center', altText: '' },
    ]);
  });

  it('draws an <img> of its preview, from attributes only', () => {
    make(doc({ elements: [RECT], files: {}, preview: PREVIEW, width: 200, height: 100 }));
    const box = document.querySelector('[data-tei-excalidraw]') as HTMLElement;
    expect(box.getAttribute('contenteditable')).toBe('false');
    expect(box.getAttribute('data-align')).toBe('center');
    expect(box.hasAttribute('data-empty')).toBe(false);
    const img = box.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(PREVIEW);
    expect(img.getAttribute('width')).toBe('200');
    expect(box.outerHTML).not.toContain('style=');
  });

  it('an empty one says so, in the editor’s words', () => {
    make(doc({ elements: [], files: {} }));
    const box = document.querySelector('[data-tei-excalidraw]') as HTMLElement;
    expect(box.hasAttribute('data-empty')).toBe(true);
    expect(box.getAttribute('data-placeholder')).toBe('Empty drawing: double-click to draw');
    expect(box.getAttribute('role')).toBe('img');
    expect(box.getAttribute('aria-label')).toBe('Drawing');
  });
});

describe('Excalidraw: HTML', () => {
  it('saves the preview as an <img> and the scene in data-scene, and reads both back', () => {
    const editor = make(
      doc({
        elements: [RECT],
        files: {},
        preview: PREVIEW,
        altText: 'Box',
        width: 240,
        height: 120,
      }),
    );
    const html = editor.getHTML();
    expect(html).toBe(
      `<div data-tei-excalidraw="" data-scene="${JSON.stringify({ elements: [RECT], files: {} }).replace(/"/g, '&quot;')}"><img src="${PREVIEW}" alt="Box" width="240" height="120"></div>`,
    );
    expect(html).not.toContain('style=');
    const again = make(html);
    expect(drawings(again)).toEqual(
      drawings(editor).map((d) => ({ ...d, key: expect.any(String) })),
    );
    expect(again.getHTML()).toBe(html);
  });

  it('a hostile preview in pasted HTML is left out; the scene still reads', () => {
    const evil = svgDataURL('<svg onload="alert(1)"></svg>');
    const scene = JSON.stringify({ elements: [RECT], files: {} }).replace(/"/g, '&quot;');
    const editor = make(`<div data-tei-excalidraw data-scene="${scene}"><img src="${evil}"></div>`);
    expect(drawings(editor)).toMatchObject([{ elements: ['r1'], preview: null }]);
    expect(editor.getHTML()).not.toContain('onload');
  });

  it('a data-scene that is not a scene is dropped', () => {
    const editor = make('<p>a</p><div data-tei-excalidraw data-scene="{oops"><img src="x"></div>');
    expect(drawings(editor)).toEqual([]);
    expect(editor.getHTML()).toBe('<p>a</p>');
  });

  it('reads Lexical’s playground HTML', () => {
    const json = JSON.stringify({ elements: [RECT], files: {}, appState: {} }).replace(
      /"/g,
      '&quot;',
    );
    const editor = make(`<span data-lexical-excalidraw-json="${json}"><svg></svg></span>`);
    expect(drawings(editor)).toMatchObject([{ elements: ['r1'] }]);
  });
});

describe('Excalidraw: commands', () => {
  it('insertExcalidraw: an empty one, the caret after it, where there is no UI', () => {
    const editor = make('<p>Hi</p>');
    editor.update(() => $getRoot().selectEnd());
    expect(editor.can().insertExcalidraw()).toBe(true);
    editor.commands.insertExcalidraw();
    expect(drawings(editor)).toMatchObject([{ elements: [] }]);
    expect(editor.isActive('excalidraw')).toBe(false);
  });

  it('opens a new one in the dialog, where there is a UI', () => {
    const editor = make('<p>Hi</p>');
    holdUi(storage(editor).dialog);
    editor.update(() => $getRoot().selectEnd());
    editor.commands.insertExcalidraw();
    expect(storage(editor).dialogFor.peek()).toBe(drawings(editor)[0]?.key);
    expect(editor.isActive('excalidraw')).toBe(true);
  });

  it('inserts given data, refusing what is not a scene or too big', () => {
    const editor = make('<p>Hi</p>', { maxSceneSize: 500 });
    editor.update(() => $getRoot().selectEnd());
    expect(editor.can().insertExcalidraw({ elements: 'x' as never })).toBe(false);
    const big = { elements: [{ ...RECT, text: 'x'.repeat(600) }] };
    expect(editor.commands.insertExcalidraw(big)).toBe(false);
    editor.commands.insertExcalidraw({
      elements: [RECT],
      preview: PREVIEW,
      width: 100,
      height: 50,
    });
    expect(drawings(editor)).toMatchObject([
      { elements: ['r1'], preview: PREVIEW, width: 100, height: 50 },
    ]);
  });

  it('setExcalidrawScene, size, align, alt text; each one undo step', () => {
    const editor = make(doc({ elements: [RECT], files: {}, preview: PREVIEW }));
    const key = drawings(editor)[0]?.key as string;
    editor.commands.setExcalidrawScene(
      { elements: [RECT, IMAGE], files: { f1: FILE }, preview: PREVIEW },
      key,
    );
    expect(drawings(editor)[0]?.elements).toEqual(['r1', 'i1']);
    editor.commands.setExcalidrawSize(10, 5, key);
    // No narrower than minWidth, at the same proportions.
    expect(drawings(editor)[0]).toMatchObject({ width: 64, height: 32 });
    editor.commands.setExcalidrawAlign('start', key);
    editor.commands.setExcalidrawAltText('  Plan  ', key);
    expect(drawings(editor)[0]).toMatchObject({ align: 'start', altText: 'Plan' });
    editor.commands.undo();
    editor.commands.undo();
    editor.commands.undo();
    expect(drawings(editor)[0]).toMatchObject({ width: null, align: 'center', altText: '' });
    editor.commands.undo();
    expect(drawings(editor)[0]?.elements).toEqual(['r1']);
  });

  it('a new preview is no undo step of its own; a bad one is refused', () => {
    const editor = make(doc({ elements: [RECT], files: {} }));
    const key = drawings(editor)[0]?.key as string;
    editor.commands.setExcalidrawAlign('end', key);
    expect(editor.commands.setExcalidrawPreview('data:image/png;base64,AAAA', key)).toBe(false);
    editor.commands.setExcalidrawPreview(PREVIEW, key);
    expect(drawings(editor)[0]?.preview).toBe(PREVIEW);
    // Merged into the step before it.
    editor.commands.undo();
    expect(drawings(editor)[0]).toMatchObject({ align: 'center', preview: null });
  });

  it('not resizable: no size commands', () => {
    const editor = make(doc({ elements: [RECT], files: {} }), { resizable: false });
    const key = drawings(editor)[0]?.key as string;
    editor.update(() => {
      const node = $getExcalidraw(key);
      if (node) $selectNode(node);
    });
    expect(editor.can().setExcalidrawSize(100)).toBe(false);
    expect(editor.commands.setExcalidrawSize(100, null, key)).toBe(false);
  });

  it('removeExcalidraw, and undo brings it back', () => {
    const editor = make(doc({ elements: [RECT], files: {} }));
    const key = drawings(editor)[0]?.key as string;
    editor.commands.removeExcalidraw(key);
    expect(drawings(editor)).toEqual([]);
    editor.commands.undo();
    expect(drawings(editor)).toMatchObject([{ elements: ['r1'] }]);
  });

  it('a double click, or Enter with it selected, opens it', () => {
    const editor = make(doc({ elements: [RECT], files: {}, preview: PREVIEW }));
    const ui = storage(editor);
    expect(editor.can().openExcalidraw(drawings(editor)[0]?.key)).toBe(false);
    holdUi(ui.dialog);
    const key = drawings(editor)[0]?.key as string;
    document
      .querySelector('[data-tei-excalidraw] img')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(ui.dialogFor.peek()).toBe(key);
    ui.dialogFor.value = null;
    editor.update(() => {
      const node = $getExcalidraw(key);
      if (node) $selectNode(node);
    });
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    editor.lexical.dispatchCommand(KEY_ENTER_COMMAND, enter);
    expect(ui.dialogFor.peek()).toBe(key);
    expect(enter.defaultPrevented).toBe(true);
  });

  it('keeps to the top level: one inside a paragraph is lifted out', () => {
    const scene = JSON.stringify({ elements: [RECT], files: {} }).replace(/"/g, '&quot;');
    const editor = make(`<p>a<span data-lexical-excalidraw-json="${scene}"></span>b</p>`);
    expect(
      editor.read(() =>
        $getRoot()
          .getChildren()
          .map((n) => n.getType()),
      ),
    ).toEqual(['paragraph', 'excalidraw', 'paragraph']);
  });
});
