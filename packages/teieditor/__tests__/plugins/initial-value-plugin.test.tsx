import { createEmptyHistoryState, registerHistory } from '@lexical/history';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { act, render } from '@testing-library/react';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  UNDO_COMMAND,
} from 'lexical';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { createTeiEditor } from '../../src/core/editor.js';
import { TeiEditorProvider } from '../../src/core/index.js';
import { Heading } from '../../src/extensions/heading/index.js';
import { History } from '../../src/extensions/history/index.js';
import { Paragraph } from '../../src/extensions/paragraph/index.js';
import { InitialValuePlugin } from '../../src/plugins/initial-value-plugin.js';
import { EditorContent } from '../../src/plugins/rich-text-plugin.js';
import { deserialize } from '../../src/utils/serialization.js';
import { createTestEditor } from '../helpers/lexical-test-env.js';

async function tick(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

function CaptureEditor({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => onEditor(editor), [editor, onEditor]);
  return null;
}

describe('deserialize() update tags', () => {
  it('attaches the requested tag to the update', async () => {
    const editor = createTestEditor();
    const seen: Array<Set<string>> = [];
    editor.registerUpdateListener(({ tags }) => seen.push(new Set(tags)));

    deserialize(editor, '<p>Tagged</p>', 'html', { tag: HISTORY_MERGE_TAG });
    await new Promise((r) => setTimeout(r, 20));

    expect(seen.some((tags) => tags.has(HISTORY_MERGE_TAG))).toBe(true);
  });

  it('leaves updates untagged when no tag is given (unchanged default)', async () => {
    const editor = createTestEditor();
    const seen: Array<Set<string>> = [];
    editor.registerUpdateListener(({ tags }) => seen.push(new Set(tags)));

    deserialize(editor, '<p>Untagged</p>', 'html');
    await new Promise((r) => setTimeout(r, 20));

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((tags) => !tags.has(HISTORY_MERGE_TAG))).toBe(true);
  });

  it('tags json imports too (the setEditorState path)', async () => {
    const source = createTestEditor();
    source.update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('From JSON'));
        $getRoot().clear().append(paragraph);
      },
      { discrete: true },
    );
    const json = JSON.stringify(source.getEditorState().toJSON());

    const target = createTestEditor();
    const seen: Array<Set<string>> = [];
    target.registerUpdateListener(({ tags }) => seen.push(new Set(tags)));

    deserialize(target, json, 'json', { tag: HISTORY_MERGE_TAG });
    await new Promise((r) => setTimeout(r, 20));

    expect(seen.some((tags) => tags.has(HISTORY_MERGE_TAG))).toBe(true);
  });
});

describe('history-merge tag vs. the undo stack', () => {
  /**
   * Deterministic reproduction of the bug the tag fixes.
   *
   * Lexical's history never pushes onto the undo stack while
   * `historyState.current` is still `null`, so an import that happens to be the
   * *very first* commit is safe by luck. In a real editor it is not the first
   * commit — node transforms and the two dozen StarterKit plugins commit on
   * mount — so we prime `current` with one update first, which is exactly the
   * situation a drop-in editor is in.
   */
  async function primeAndImport(tag?: typeof HISTORY_MERGE_TAG): Promise<{
    undoDepth: number;
    textAfterUndo: string;
  }> {
    const editor = createTestEditor();
    editor.setRootElement(document.createElement('div'));
    const historyState = createEmptyHistoryState();
    registerHistory(editor, historyState, 300);

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('before import'));
        $getRoot().clear().append(paragraph);
      },
      { discrete: true },
    );

    deserialize(editor, '<p>Seeded document</p>', 'html', tag ? { tag } : undefined);
    await new Promise((r) => setTimeout(r, 20));

    const undoDepth = historyState.undoStack.length;
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await new Promise((r) => setTimeout(r, 20));

    return {
      undoDepth,
      textAfterUndo: editor.getEditorState().read(() => $getRoot().getTextContent()),
    };
  }

  it('an untagged import lands on the undo stack and Ctrl+Z reverts it — the bug', async () => {
    const { undoDepth, textAfterUndo } = await primeAndImport(undefined);
    expect(undoDepth).toBe(1);
    expect(textAfterUndo).toBe('before import');
  });

  it('a history-merge tagged import never reaches the undo stack — the fix', async () => {
    const { undoDepth, textAfterUndo } = await primeAndImport(HISTORY_MERGE_TAG);
    expect(undoDepth).toBe(0);
    expect(textAfterUndo).toBe('Seeded document');
  });
});

describe('InitialValuePlugin history behaviour', () => {
  it('does not let the user undo away the initial content', async () => {
    let lexical: LexicalEditor | undefined;
    const editor = createTeiEditor({ extensions: [Paragraph, Heading, History] });

    const { container } = render(
      <TeiEditorProvider editor={editor}>
        <EditorContent />
        <InitialValuePlugin value="<p>Seeded document</p>" format="html" />
        <CaptureEditor
          onEditor={(e) => {
            lexical = e;
          }}
        />
      </TeiEditorProvider>,
    );

    await tick();
    expect(lexical).toBeDefined();
    expect(container.textContent).toContain('Seeded document');

    // The bug: an untagged initial import lands on the undo stack, so a single
    // Ctrl+Z empties the document the editor was seeded with.
    await act(async () => {
      lexical?.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await tick();

    expect(container.textContent).toContain('Seeded document');
  });
});
