'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { render } from '@testing-library/react';
import { $getRoot, type LexicalEditor, PASTE_COMMAND } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { TeiEditorProvider } from '../../src/core/context.js';
import { createTeiEditor } from '../../src/core/editor.js';
import type { TeiExtension } from '../../src/core/types.js';
import { DragDropPaste } from '../../src/extensions/drag-drop-paste/index.js';
import { Image } from '../../src/extensions/image/index.js';

/**
 * Regression coverage for the image paste/drop consolidation. Previously the
 * Image extension (raw DOM listeners) AND DragDropPaste (PASTE/DROP commands)
 * both inserted a pasted image → two images. The Image plugin now owns it via
 * PASTE_COMMAND/DROP_COMMAND at NORMAL priority and stops propagation.
 */

function Capture({ onReady }: { onReady: (e: LexicalEditor) => void }): null {
  const [editor] = useLexicalComposerContext();
  onReady(editor);
  return null;
}

function Host(): React.JSX.Element {
  return (
    <RichTextPlugin
      contentEditable={<div contentEditable data-testid="ce" />}
      placeholder={null}
      ErrorBoundary={({ children }) => <>{children}</>}
    />
  );
}

function imagePasteEvent(): ClipboardEvent {
  const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', { type: 'image/png' });
  // jsdom's ClipboardEvent doesn't carry files; fake the shape the handlers read.
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: { files: [file] as unknown as FileList },
  });
  return event;
}

function countImages(editor: LexicalEditor): number {
  let n = 0;
  editor.getEditorState().read(() => {
    const walk = (node: { getType?: () => string; getChildren?: () => unknown[] }): void => {
      if (node.getType?.() === 'image') n++;
      if (node.getChildren) for (const c of node.getChildren()) walk(c as typeof node);
    };
    walk($getRoot() as unknown as Parameters<typeof walk>[0]);
  });
  return n;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

async function mountAndPaste(extensions: TeiExtension[]): Promise<number> {
  let editor: LexicalEditor | null = null;
  const tei = createTeiEditor({
    // Provide a deterministic uploader so we don't depend on FileReader timing.
    extensions: extensions.map((e) =>
      e.name === 'image' ? e.configure({ onUpload: async () => 'data:image/png;base64,AAA' }) : e,
    ),
  });
  render(
    <TeiEditorProvider editor={tei}>
      <Capture
        onReady={(e) => {
          editor = e;
        }}
      />
      <Host />
    </TeiEditorProvider>,
  );
  await flush();
  editor?.update(() => $getRoot().selectEnd());
  editor?.dispatchCommand(PASTE_COMMAND, imagePasteEvent());
  await flush();
  return countImages(editor as unknown as LexicalEditor);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('image paste consolidation', () => {
  it('inserts exactly ONE image when both Image and DragDropPaste are active', async () => {
    const count = await mountAndPaste([Image, DragDropPaste]);
    expect(count).toBe(1);
  });

  it('still inserts an image with the Image extension alone', async () => {
    const count = await mountAndPaste([Image]);
    expect(count).toBe(1);
  });
});
