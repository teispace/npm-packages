'use client';

import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { Editor, useEditorState, useTeiEditor } from '@teispace/teieditor/react';
import { type FormEvent, useState } from 'react';

const extensions = StarterKit.configure({
  heading: false,
  codeBlock: false,
  codeHighlight: false,
  horizontalRule: false,
  textAlign: false,
  indent: false,
});

export function CommentBox() {
  const editor = useTeiEditor({ extensions });
  const empty = useEditorState((e) => e.isEmpty, { editor });
  const [posted, setPosted] = useState<string[]>([]);

  const post = (event?: FormEvent) => {
    event?.preventDefault();
    if (editor.isEmpty) return;
    setPosted((list) => [...list, editor.getHTML()]);
    editor.setContent('');
    editor.focus();
  };

  return (
    <div className="stack">
      {posted.map((html, i) => (
        // The editor's own export: links are checked, nothing runs.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: the editor's sanitized export
        // biome-ignore lint/suspicious/noArrayIndexKey: posted comments never move
        <article key={i} className="card comment tei-prose" dangerouslySetInnerHTML={{ __html: html }} />
      ))}
      <form className="stack" onSubmit={post}>
        <Editor
          editor={editor}
          preset="minimal"
          placeholder="Add a comment…"
          contentProps={{
            'aria-label': 'Comment',
            onKeyDown: (event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) post();
            },
          }}
        />
        <button type="submit" className="button" disabled={empty}>
          Post
        </button>
      </form>
    </div>
  );
}
