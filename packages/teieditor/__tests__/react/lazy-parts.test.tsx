import { act, render, waitFor } from '@testing-library/react';
import { $getRoot } from 'lexical';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// React keeps a lazy part once loaded, for the module's life: each test
// loads the modules afresh, so its parts are still to load.
async function load() {
  vi.resetModules();
  const [{ StarterKit }, { Image }, { Embed }, react] = await Promise.all([
    import('../../src/extensions/starter-kit/index.js'),
    import('../../src/extensions/image/index.js'),
    import('../../src/extensions/embed/index.js'),
    import('../../src/react/index.js'),
  ]);
  const editor = react.createReactTeiEditor({
    extensions: [StarterKit, Image, Embed],
    content: '<p>Hello</p>',
  });
  const { container } = render(<react.Editor editor={editor} />);
  const frame = container.querySelector('[data-tei-frame]');
  expect(frame?.hasAttribute('data-tei-ready')).toBe(false);
  act(() => editor.update(() => $getRoot().selectEnd()));
  return { editor, frame };
}

beforeEach(() => {
  // jsdom lays nothing out; the popovers anchor on the selection's box.
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});
afterEach(() => document.body.replaceChildren());

it('⌘K before the link popover has loaded opens it as it loads', async () => {
  const { editor, frame } = await load();
  let opened = false;
  act(() => {
    opened = editor.commands.openLinkEditor();
  });
  expect(opened).toBe(true);
  await waitFor(() =>
    expect(document.querySelector('[data-tei-control="link-editor"]')).not.toBeNull(),
  );
  expect(frame?.hasAttribute('data-tei-ready')).toBe(true);
  editor.destroy();
});

it('Image from the slash menu before its popover has loaded opens it, not the bare chooser', async () => {
  const { editor } = await load();
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  act(() => {
    editor.commands.openImageInsert();
  });
  await waitFor(() =>
    expect(document.querySelector('[data-tei-control="image-insert-popover"]')).not.toBeNull(),
  );
  expect(click).not.toHaveBeenCalled();
  click.mockRestore();
  editor.destroy();
});

it('Embed from the slash menu before its form has loaded opens it as it loads', async () => {
  const { editor } = await load();
  let opened = false;
  act(() => {
    opened = editor.commands.openEmbedInsert('vimeo');
  });
  expect(opened).toBe(true);
  await waitFor(() =>
    expect(document.querySelector('[data-tei-control="embed-insert-popover"]')).not.toBeNull(),
  );
  expect(
    document.querySelector('[data-tei-control="embed-url"]')?.getAttribute('placeholder'),
  ).toBe('Paste a link to the Vimeo video');
  editor.destroy();
});

it('⌘J before the AI menu has loaded opens it as it loads', async () => {
  vi.resetModules();
  const [{ StarterKit }, { Ai }, react] = await Promise.all([
    import('../../src/extensions/starter-kit/index.js'),
    import('../../src/extensions/ai/index.js'),
    import('../../src/react/index.js'),
  ]);
  const editor = react.createReactTeiEditor({
    extensions: [StarterKit, Ai.configure({ handler: async () => 'An answer' })],
    content: '<p>Hello</p>',
  });
  const { container } = render(<react.Editor editor={editor} />);
  expect(container.querySelector('[data-tei-frame]')?.hasAttribute('data-tei-ready')).toBe(false);
  act(() => editor.update(() => $getRoot().selectEnd()));
  // Its place is held, so the item is enabled before the menu's code is in.
  expect(editor.can().openAiMenu()).toBe(true);
  let opened = false;
  act(() => {
    opened = editor.commands.openAiMenu();
  });
  expect(opened).toBe(true);
  await waitFor(() =>
    expect(document.querySelector('[data-tei-control="ai-menu"]')).not.toBeNull(),
  );
  editor.destroy();
});

it('the versions panel shows while it is open, from its command', async () => {
  vi.resetModules();
  const [{ StarterKit }, { Versions }, react] = await Promise.all([
    import('../../src/extensions/starter-kit/index.js'),
    import('../../src/extensions/versions/index.js'),
    import('../../src/react/index.js'),
  ]);
  const editor = react.createReactTeiEditor({
    extensions: [StarterKit, Versions],
    content: '<p>Hello</p>',
  });
  const { container } = render(<react.Editor editor={editor} />);
  await waitFor(() =>
    expect(container.querySelector('[data-tei-frame]')?.hasAttribute('data-tei-ready')).toBe(true),
  );
  expect(container.querySelector('.tei-versions-save')).toBeNull();
  act(() => {
    editor.commands.toggleVersions();
  });
  await waitFor(() => expect(container.querySelector('.tei-versions-save')).not.toBeNull());
  act(() => {
    editor.commands.toggleVersions();
  });
  await waitFor(() => expect(container.querySelector('.tei-versions-save')).toBeNull());
  editor.destroy();
});

it('an equation inserted before its editor has loaded opens it as it loads', async () => {
  vi.resetModules();
  const [{ StarterKit }, { Equation }, react] = await Promise.all([
    import('../../src/extensions/starter-kit/index.js'),
    import('../../src/extensions/equation/index.js'),
    import('../../src/react/index.js'),
  ]);
  const editor = react.createReactTeiEditor({
    extensions: [StarterKit, Equation.configure({ katex: null })],
    content: '<p></p>',
  });
  const { container } = render(<react.Editor editor={editor} />);
  expect(container.querySelector('[data-tei-frame]')?.hasAttribute('data-tei-ready')).toBe(false);
  act(() => editor.update(() => $getRoot().selectEnd()));
  act(() => {
    editor.commands.insertEquation();
  });
  await waitFor(() =>
    expect(document.querySelector('[data-tei-control="equation-editor"]')).not.toBeNull(),
  );
  editor.destroy();
});

it('the comment composer and panel, and the tree view, show from their commands', async () => {
  vi.resetModules();
  const [{ StarterKit }, { Comments }, { TreeView }, react] = await Promise.all([
    import('../../src/extensions/starter-kit/index.js'),
    import('../../src/extensions/comments/index.js'),
    import('../../src/extensions/tree-view/index.js'),
    import('../../src/react/index.js'),
  ]);
  const editor = react.createReactTeiEditor({
    extensions: [StarterKit, Comments, TreeView],
    content: '<p>Hello world</p>',
  });
  const { container } = render(<react.Editor editor={editor} />);
  await waitFor(() =>
    expect(container.querySelector('[data-tei-frame]')?.hasAttribute('data-tei-ready')).toBe(true),
  );
  act(() => editor.update(() => $getRoot().select(0, 1)));
  act(() => {
    editor.commands.addComment();
  });
  await waitFor(() =>
    expect(document.querySelector('[data-tei-control="comment-composer"]')).not.toBeNull(),
  );
  act(() => {
    editor.commands.toggleCommentsPanel(false);
  });
  const panel = () => document.querySelector('.tei-comments-panel');
  await waitFor(() => expect(panel()?.hasAttribute('hidden')).toBe(true));
  act(() => {
    editor.commands.toggleCommentsPanel(true);
  });
  await waitFor(() => expect(panel()?.hasAttribute('data-open')).toBe(true));
  expect(document.querySelector('.tei-tree-view')).toBeNull();
  act(() => {
    editor.commands.toggleTreeView();
  });
  await waitFor(() => expect(document.querySelector('.tei-tree-view')).not.toBeNull());
  editor.destroy();
});
