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
  const frame = container.querySelector('[data-tei-preset]');
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
