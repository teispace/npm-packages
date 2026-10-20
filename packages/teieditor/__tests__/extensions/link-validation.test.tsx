import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { act, render } from '@testing-library/react';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  type LexicalEditor,
} from 'lexical';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { createTeiEditor } from '../../src/core/editor.js';
import { TeiEditorProvider } from '../../src/core/index.js';
import { Link } from '../../src/extensions/link/index.js';
import { Paragraph } from '../../src/extensions/paragraph/index.js';
import { EditorContent } from '../../src/plugins/rich-text-plugin.js';

function Capture({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => onEditor(editor), [editor, onEditor]);
  return null;
}

/** Select some text and ask for it to become a link to `url`; report the link made, if any. */
async function linkTo(url: string): Promise<string | null> {
  let editor: LexicalEditor | undefined;
  const { unmount } = render(
    <TeiEditorProvider editor={createTeiEditor({ extensions: [Paragraph, Link] })}>
      <EditorContent />
      <Capture
        onEditor={(e) => {
          editor = e;
        }}
      />
    </TeiEditorProvider>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  if (!editor) throw new Error('editor did not mount');
  const lexical = editor;

  await act(async () => {
    lexical.update(
      () => {
        const text = $createTextNode('click me');
        $getRoot().clear().append($createParagraphNode().append(text));
        text.select(0, text.getTextContentSize());
      },
      { discrete: true },
    );
    lexical.dispatchCommand(TOGGLE_LINK_COMMAND, url);
  });

  const made = lexical.getEditorState().read(() => {
    const paragraph = $getRoot().getFirstChild();
    const link = $isElementNode(paragraph) ? paragraph.getChildren().find($isLinkNode) : undefined;
    return link ? link.getURL() : null;
  });
  unmount();
  return made;
}

describe('Link extension, default validateUrl', () => {
  it('makes an https link', async () => {
    expect(await linkTo('https://example.com')).toBe('https://example.com');
  });

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '//evil.example'])(
    'refuses %j',
    async (url) => {
      expect(await linkTo(url)).toBeNull();
    },
  );
});
