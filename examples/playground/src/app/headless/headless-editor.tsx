'use client';

import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import {
  EditorContent,
  shallowEqual,
  useEditorState,
  useTeiEditor,
} from '@teispace/teieditor/react';

export function HeadlessEditor() {
  const editor = useTeiEditor({
    extensions: StarterKit,
    content: '<h2>Plain buttons</h2><p>Select some of this and press one.</p>',
  });
  // One snapshot per update; this component re-renders only when it changes.
  const state = useEditorState(
    (e) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      heading: e.isActive('heading', 2),
      canUndo: e.can().undo(),
      words: e.getText().split(/\s+/).filter(Boolean).length,
    }),
    { editor, equal: shallowEqual },
  );

  return (
    <div className="headless">
      <div className="headless-bar">
        <button
          type="button"
          aria-pressed={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          aria-pressed={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          aria-pressed={state.heading}
          onClick={() => editor.chain().focus().toggleHeading(2).run()}
        >
          Heading
        </button>
        <button
          type="button"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          Undo
        </button>
        <span className="headless-count" aria-live="polite">
          {state.words} words
        </span>
      </div>
      {/* `tei` gives the document the editor's typography and tokens. */}
      <div className="tei headless-doc">
        <EditorContent editor={editor} aria-label="Headless document" />
      </div>
    </div>
  );
}
