import { act, render, waitFor } from '@testing-library/react';
import { $getRoot } from 'lexical';
import { afterEach, expect, it } from 'vitest';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createReactTeiEditor, Editor } from '../../src/react/index.js';

// Its own file: React keeps a lazy part once loaded, for the module's life.
afterEach(() => document.body.replaceChildren());
// jsdom lays nothing out; the popover anchors on the selection's box.
Range.prototype.getBoundingClientRect = () => new DOMRect();
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

it('⌘K before the link popover has loaded opens it as it loads', async () => {
  const editor = createReactTeiEditor({ extensions: [StarterKit], content: '<p>Hello</p>' });
  const { container } = render(<Editor editor={editor} />);
  const frame = container.querySelector('[data-tei-preset]');
  expect(frame?.hasAttribute('data-tei-ready')).toBe(false);
  act(() => editor.update(() => $getRoot().selectEnd()));
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
