import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { render } from '@testing-library/react';
import { $getRoot, type LexicalEditor } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { TeiEditorProvider } from '../../src/core/context.js';
import { createTeiEditor } from '../../src/core/editor.js';
import { DateTime, INSERT_DATETIME_COMMAND } from '../../src/extensions/datetime/index.js';
import { INSERT_TOGGLE_COMMAND, Toggle } from '../../src/extensions/toggle/index.js';

/**
 * Regression tests for the extension lifecycle. Extensions that register their
 * commands ONLY in `onRegister` (datetime, callout, math, toggle, …) were
 * silently dead because nothing invoked `onRegister`. These tests dispatch such
 * a command through the React provider path (where the lifecycle runs) and
 * assert the command actually took effect.
 */

function CaptureEditor({ onReady }: { onReady: (editor: LexicalEditor) => void }): null {
  const [editor] = useLexicalComposerContext();
  onReady(editor);
  return null;
}

function ContentEditableHost(): React.JSX.Element {
  // A minimal RichText surface so the editor has an editable root.
  return (
    <RichTextPlugin
      contentEditable={<div contentEditable data-testid="ce" />}
      placeholder={null}
      ErrorBoundary={({ children }) => <>{children}</>}
    />
  );
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('extension lifecycle (onRegister/onDestroy)', () => {
  it('runs onRegister so an onRegister-only insert command works (datetime)', async () => {
    let editor: LexicalEditor | null = null;
    const tei = createTeiEditor({ extensions: [DateTime] });

    render(
      <TeiEditorProvider editor={tei}>
        <CaptureEditor
          onReady={(e) => {
            editor = e;
          }}
        />
        <ContentEditableHost />
      </TeiEditorProvider>,
    );

    await flush();
    expect(editor).not.toBeNull();

    // Place a selection, then dispatch the (previously dead) command.
    editor?.update(() => {
      $getRoot().selectEnd();
    });
    const handled = editor?.dispatchCommand(INSERT_DATETIME_COMMAND, 'date');
    await flush();

    // The command must have been registered (handled === true) AND inserted text.
    expect(handled).toBe(true);
    let text = '';
    editor?.getEditorState().read(() => {
      text = $getRoot().getTextContent();
    });
    // formatDate('date', 'YYYY-MM-DD') → starts with a 4-digit year.
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('tears down on unmount (onRegister cleanup runs)', async () => {
    let editor: LexicalEditor | null = null;
    const tei = createTeiEditor({ extensions: [Toggle] });
    const { unmount } = render(
      <TeiEditorProvider editor={tei}>
        <CaptureEditor
          onReady={(e) => {
            editor = e;
          }}
        />
        <ContentEditableHost />
      </TeiEditorProvider>,
    );
    await flush();
    const captured = editor;
    expect(captured).not.toBeNull();

    // While mounted, the toggle insert command is handled.
    captured?.update(() => $getRoot().selectEnd());
    expect(captured?.dispatchCommand(INSERT_TOGGLE_COMMAND, 'Title')).toBe(true);

    unmount();
    await flush();
    // After unmount the command handler has been removed → no longer handled.
    expect(captured?.dispatchCommand(INSERT_TOGGLE_COMMAND, 'Title')).toBe(false);
  });
});
