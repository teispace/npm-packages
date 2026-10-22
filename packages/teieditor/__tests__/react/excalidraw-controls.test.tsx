import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { $getRoot } from 'lexical';
import { useEffect } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { $selectNode } from '../../src/core/slot-host.js';
import {
  $getExcalidraw,
  Excalidraw,
  type ExcalidrawModule,
  svgDataURL,
} from '../../src/extensions/excalidraw/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createReactTeiEditor, EditorContent, ExcalidrawControls } from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

const RECT = { id: 'r1', type: 'rectangle', version: 1 };
const LINKED = { id: 'r2', type: 'rectangle', version: 1, link: 'javascript:alert(1)' };

/** Stands in for `@excalidraw/excalidraw`: an API over a scene the test sets. */
function fakeExcalidraw() {
  const scene = { elements: [] as unknown[], files: {} as Record<string, unknown> };
  const props: { last?: Record<string, unknown> } = {};
  const module: ExcalidrawModule = {
    Excalidraw: function Fake(p: Record<string, unknown>) {
      props.last = p;
      const initial = p.initialData as { elements: unknown[]; files: Record<string, unknown> };
      // Like Excalidraw: the initial data and the API callback are read once, on mount.
      // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
      useEffect(() => {
        // Restoring a scene bumps its elements' versions, and reports it.
        scene.elements = initial.elements.map((el) => ({
          ...(el as object),
          version: ((el as { version?: number }).version ?? 0) + 1,
        }));
        scene.files = { ...initial.files };
        (p.excalidrawAPI as (api: unknown) => void)({
          getSceneElements: () => scene.elements,
          getFiles: () => scene.files,
        });
        (p.onChange as ((elements: unknown[]) => void) | undefined)?.(scene.elements);
      }, []);
      return <div data-testid="canvas" />;
    } as ExcalidrawModule['Excalidraw'],
    // What Excalidraw exports, and what the dialog must clean: a link, a script.
    exportToSvg: vi.fn(async ({ elements }) => {
      const box = document.createElement('div');
      box.innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" data-count="${elements.length}">` +
        '<script>alert(1)</script><a href="javascript:alert(1)"><rect onclick="x()"/></a></svg>';
      return box.firstElementChild as SVGSVGElement;
    }),
  };
  return { module, scene, props };
}

function open(content: string | object = '<p>Hi</p>') {
  const fake = fakeExcalidraw();
  const load = vi.fn(async () => fake.module);
  const editor = createReactTeiEditor({
    extensions: [StarterKit, Excalidraw.configure({ load })],
    content,
  });
  render(
    <EditorContent editor={editor}>
      <ExcalidrawControls />
    </EditorContent>,
  );
  return { editor, load, ...fake };
}

const dialog = () => screen.queryByRole('dialog', { name: 'Drawing' });
const drawing = (editor: ReturnType<typeof open>['editor']) =>
  editor.read(() => {
    const node = $getRoot()
      .getChildren()
      .find((n) => n.getType() === 'excalidraw');
    const found = node ? $getExcalidraw(node.getKey()) : null;
    return found
      ? { key: found.getKey(), scene: found.getScene(), preview: found.getPreview() }
      : null;
  });
const decode = (src: string | null) =>
  src
    ? new TextDecoder().decode(
        Uint8Array.from(atob(src.split(',')[1] ?? ''), (c) => c.charCodeAt(0)),
      )
    : '';

describe('ExcalidrawControls', () => {
  it('loads nothing until a drawing is opened', () => {
    const { load } = open();
    expect(load).not.toHaveBeenCalled();
  });

  it('a new drawing opens Excalidraw; Save keeps its scene and a clean picture', async () => {
    const { editor, load, scene, module } = open();
    act(() => {
      editor.update(() => $getRoot().selectEnd());
      editor.commands.insertExcalidraw();
    });
    expect(dialog()).not.toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    await screen.findByTestId('canvas');
    scene.elements = [RECT, LINKED];
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(dialog()).toBeNull());
    const saved = drawing(editor);
    expect(saved?.scene.elements.map((el) => el.id)).toEqual(['r1', 'r2']);
    expect(module.exportToSvg).toHaveBeenCalledTimes(1);
    const svg = decode(saved?.preview ?? null);
    expect(svg).toContain('<rect');
    expect(svg).not.toMatch(/script|javascript|onclick|<a/);
    const img = document.querySelector('[data-tei-excalidraw] img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(saved?.preview);
  });

  it('a new drawing closed empty goes, leaving no undo step', async () => {
    const { editor } = open();
    act(() => {
      editor.update(() => $getRoot().selectEnd());
      editor.commands.insertExcalidraw();
    });
    await screen.findByTestId('canvas');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(dialog()).toBeNull();
    expect(drawing(editor)).toBeNull();
    // One undo goes back to before it was put in.
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getHTML()).toBe('<p>Hi</p>');
    expect(drawing(editor)).toBeNull();
  });

  it('closing with changes asks first', async () => {
    const preview = svgDataURL('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const { editor, scene } = open({
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [{ type: 'excalidraw', version: 1, elements: [RECT], files: {}, preview }],
      },
    });
    act(() => {
      editor.commands.openExcalidraw(drawing(editor)?.key);
    });
    await screen.findByTestId('canvas');
    scene.elements = [RECT, { ...RECT, id: 'r9' }];
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(dialog()).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Discard changes?');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep drawing' }));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    });
    expect(dialog()).toBeNull();
    expect(drawing(editor)?.scene.elements.map((el) => el.id)).toEqual(['r1']);
  });

  it('closes untouched without asking, though Excalidraw restored the scene', async () => {
    const preview = svgDataURL('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const { editor } = open({
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [{ type: 'excalidraw', version: 1, elements: [RECT], files: {}, preview }],
      },
    });
    act(() => {
      editor.commands.openExcalidraw(drawing(editor)?.key);
    });
    await screen.findByTestId('canvas');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(dialog()).toBeNull();
  });

  it('says so when Excalidraw cannot load', async () => {
    const editor = createReactTeiEditor({
      extensions: [
        StarterKit,
        Excalidraw.configure({ load: () => Promise.reject(new Error('offline')) }),
      ],
      content: '<p>Hi</p>',
    });
    render(
      <EditorContent editor={editor}>
        <ExcalidrawControls />
      </EditorContent>,
    );
    act(() => {
      editor.update(() => $getRoot().selectEnd());
      editor.commands.insertExcalidraw();
    });
    expect(await screen.findByText('Excalidraw could not be loaded.')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('makes the picture of a drawing that has none, as no undo step', async () => {
    const { editor, module } = open({
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [{ type: 'excalidraw', version: 1, elements: [RECT], files: {} }],
      },
    });
    await waitFor(() => expect(drawing(editor)?.preview).toMatch(/^data:image\/svg\+xml;base64,/));
    expect(module.exportToSvg).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-tei-excalidraw] img')).not.toBeNull();
  });

  it('the toolbar over a selected drawing edits, aligns and deletes it', async () => {
    const preview = svgDataURL('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const { editor } = open({
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [{ type: 'excalidraw', version: 1, elements: [RECT], files: {}, preview }],
      },
    });
    const root = editor.lexical.getRootElement() as HTMLElement;
    act(() => {
      root.focus();
      editor.update(() => {
        const key = $getRoot().getFirstChild()?.getKey();
        const node = key ? $getExcalidraw(key) : null;
        if (node) $selectNode(node);
      });
    });
    const toolbar = await screen.findByRole('toolbar', { name: 'Drawing', hidden: true });
    expect(toolbar).not.toBeNull();
    act(() => {
      fireEvent.click(toolbar.querySelector('[aria-label="Align right"]') as Element);
    });
    expect(document.querySelector('[data-tei-excalidraw]')?.getAttribute('data-align')).toBe('end');
    act(() => {
      editor.update(() => {
        const node = $getExcalidraw(drawing(editor)?.key);
        if (node) $selectNode(node);
      });
    });
    const bar = await waitFor(() => {
      const found = document.querySelector('[data-tei-control="excalidraw-toolbar"]');
      expect(found).not.toBeNull();
      return found as Element;
    });
    act(() => {
      fireEvent.click(bar.querySelector('[aria-label="Delete drawing"]') as Element);
    });
    expect(drawing(editor)).toBeNull();
  });
});
