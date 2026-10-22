// @vitest-environment node
import { RichTextExtension } from '@lexical/rich-text';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Html } from '../../src/extensions/html/index.js';
import { defineTeiExtension } from '../../src/index.js';
import { EditorContent, useEditorState, useTeiEditor } from '../../src/react/index.js';

const Rich = defineTeiExtension({ name: 'test/rich', dependencies: [RichTextExtension] });

describe('server rendering', () => {
  it('renders without a DOM, with an editor from the first render', () => {
    function Status() {
      const empty = useEditorState((editor) => editor.isEmpty);
      return <output>{empty ? 'empty' : 'has content'}</output>;
    }
    function App() {
      const editor = useTeiEditor({ extensions: [Rich], content: 'Hello', contentFormat: 'text' });
      return (
        <EditorContent editor={editor} placeholder="Write…">
          <Status />
        </EditorContent>
      );
    }
    const html = renderToString(<App />);
    expect(html).toContain('data-tei-content');
    expect(html).toContain('contentEditable="true"');
    expect(html).toContain('<output>has content</output>');
  });
});

describe('server rendering of HTML content', () => {
  it('renders the empty document the browser hydrates, without a DOM to read HTML', () => {
    function App() {
      const editor = useTeiEditor({ extensions: [Rich, Html], content: '<p>Hello</p>' });
      const html = useEditorState((e) => e.getHTML(), { editor });
      return (
        <EditorContent editor={editor} placeholder="Write…">
          <output>{html || 'nothing yet'}</output>
        </EditorContent>
      );
    }
    const html = renderToString(<App />);
    expect(html).toContain('<output>nothing yet</output>');
    // No placeholder over content that is about to arrive.
    expect(html).not.toContain('data-tei-empty');
  });
});
