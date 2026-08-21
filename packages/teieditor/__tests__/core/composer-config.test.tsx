import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { act, render } from '@testing-library/react';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type DOMConversionMap,
  type LexicalEditor,
  ParagraphNode,
  TextNode,
} from 'lexical';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { createTeiEditor } from '../../src/core/editor.js';
import { TeiEditorProvider } from '../../src/core/index.js';
import type { TeiNodeConfig } from '../../src/core/types.js';
import { Heading } from '../../src/extensions/heading/index.js';
import { Paragraph } from '../../src/extensions/paragraph/index.js';
import { EditorContent } from '../../src/plugins/rich-text-plugin.js';
import { TeiEditor } from '../../src/react/index.js';

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

// ---------------------------------------------------------------------------
// Collaboration passthrough
// ---------------------------------------------------------------------------

describe('composerConfig collaboration passthrough', () => {
  it('carries editorState: null through to composerConfig', () => {
    const editor = createTeiEditor({ extensions: [Paragraph], editorState: null });
    expect(editor.composerConfig.editorState).toBeNull();
    expect('editorState' in editor.composerConfig).toBe(true);
  });

  it('omits editorState entirely when not supplied', () => {
    const editor = createTeiEditor({ extensions: [Paragraph] });
    expect('editorState' in editor.composerConfig).toBe(false);
  });

  it('accepts the other editorState shapes Lexical supports', () => {
    const asString = createTeiEditor({ extensions: [Paragraph], editorState: '{"root":{}}' });
    expect(asString.composerConfig.editorState).toBe('{"root":{}}');

    const updater = () => {};
    const asFn = createTeiEditor({ extensions: [Paragraph], editorState: updater });
    expect(asFn.composerConfig.editorState).toBe(updater);
  });

  it('leaves the root empty when editorState is null (what the collab plugin needs)', async () => {
    let lexical: LexicalEditor | undefined;
    const editor = createTeiEditor({ extensions: [Paragraph, Heading], editorState: null });

    render(
      <TeiEditorProvider editor={editor}>
        <EditorContent />
        <CaptureEditor
          onEditor={(e) => {
            lexical = e;
          }}
        />
      </TeiEditorProvider>,
    );
    await tick();

    // Without `editorState: null` Lexical seeds a default empty ParagraphNode,
    // which would collide with the Yjs document's own initial content.
    const childCount = lexical?.getEditorState().read(() => $getRoot().getChildrenSize());
    expect(childCount).toBe(0);
  });

  it('passes an html import/export config through', () => {
    const htmlImport: DOMConversionMap = {};
    const editor = createTeiEditor({ extensions: [Paragraph], html: { import: htmlImport } });
    expect(editor.composerConfig.html).toEqual({ import: htmlImport });
  });

  it('omits html entirely when not supplied', () => {
    const editor = createTeiEditor({ extensions: [Paragraph] });
    expect('html' in editor.composerConfig).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Node replacement
// ---------------------------------------------------------------------------

class CustomTextNode extends TextNode {
  static getType(): string {
    return 'custom-text';
  }
  static clone(node: CustomTextNode): CustomTextNode {
    return new CustomTextNode(node.__text, node.__key);
  }
}

describe('node replacement support', () => {
  it('appends config.nodes after every extension-contributed node', () => {
    const replacement: TeiNodeConfig = {
      replace: TextNode,
      with: (node: TextNode) => new CustomTextNode(node.__text),
      withKlass: CustomTextNode,
    };
    const editor = createTeiEditor({
      extensions: [Paragraph],
      nodes: [CustomTextNode, replacement],
    });

    expect(editor.nodes).toContain(ParagraphNode);
    expect(editor.nodes.at(-1)).toBe(replacement);
    expect(editor.composerConfig.nodes).toBe(editor.nodes);
  });

  it('actually swaps the node class at runtime', async () => {
    let lexical: LexicalEditor | undefined;
    const editor = createTeiEditor({
      extensions: [Paragraph],
      nodes: [
        CustomTextNode,
        {
          replace: TextNode,
          with: (node: TextNode) => new CustomTextNode(node.__text),
          withKlass: CustomTextNode,
        },
      ],
    });

    render(
      <TeiEditorProvider editor={editor}>
        <EditorContent />
        <CaptureEditor
          onEditor={(e) => {
            lexical = e;
          }}
        />
      </TeiEditorProvider>,
    );
    await tick();

    let createdType: string | undefined;
    lexical?.update(
      () => {
        const paragraph = $createParagraphNode();
        const text = $createTextNode('hello');
        paragraph.append(text);
        $getRoot().clear().append(paragraph);
        createdType = text.getType();
      },
      { discrete: true },
    );

    expect(createdType).toBe('custom-text');
  });
});

// ---------------------------------------------------------------------------
// config prop narrowing (registry editors)
// ---------------------------------------------------------------------------

describe('TeiEditor config prop', () => {
  it('cannot have its StarterKit or readOnly clobbered by config', async () => {
    // A JS caller (or a stale `as any`) passing these keys used to wipe the
    // whole starter kit and re-enable editing. The props now win.
    const hostile = { extensions: [], editable: true, namespace: 'Custom' } as never;
    const { container } = render(<TeiEditor readOnly config={hostile} />);
    await tick();

    const contentEditable = container.querySelector('.tei-content-editable');
    expect(contentEditable?.getAttribute('contenteditable')).toBe('false');
    // StarterKit is intact: the WordCount extension it carries still renders.
    expect(container.querySelector('.tei-word-count')).not.toBeNull();
  });

  it('still applies the config keys it legitimately owns', async () => {
    const { container } = render(<TeiEditor config={{ namespace: 'MyNamespace' }} />);
    await tick();
    expect(container.querySelector('.tei-content-editable')).not.toBeNull();
  });
});
