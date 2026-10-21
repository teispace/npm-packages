// @vitest-environment node
import { RichTextExtension } from '@lexical/rich-text';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
