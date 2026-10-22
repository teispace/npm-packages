'use client';

import {
  Collaboration,
  createBroadcastProvider,
} from '@teispace/teieditor/extensions/collaboration';
import { Versions } from '@teispace/teieditor/extensions/versions';
import { notion } from '@teispace/teieditor/presets/notion';
import { Editor, useTeiEditor } from '@teispace/teieditor/react';
import { useState } from 'react';
import { Doc } from 'yjs';

const ROOM = 'teieditor-playground';
const START = '<h2>Planning notes</h2><p>Type in one editor and watch the other.</p>';

const PEOPLE = [
  { name: 'Ada', color: '#2563eb' },
  { name: 'Grace', color: '#db2777' },
] as const;

/**
 * One person's editor: its own Y.Doc, joined to the room through a
 * BroadcastChannel, so the other editor here (and this page in another tab)
 * edits the same document.
 */
function Person({ name, color }: { name: string; color: string }) {
  // `gc: false` keeps history, so versions are Yjs snapshots.
  const [doc] = useState(() => new Doc({ gc: false }));
  const editor = useTeiEditor({
    extensions: [
      ...notion.extensions,
      Collaboration.configure({
        doc,
        provider: (id) => createBroadcastProvider(`${ROOM}/${id}`, doc),
        user: { name, color },
        // The starting document, written so every client agrees on it.
        initialContent: START,
      }),
      Versions,
    ],
  });
  return (
    <section className="stack" aria-label={`${name}'s editor`} data-testid={`person-${name}`}>
      <h2>{name}</h2>
      <Editor
        editor={editor}
        preset={notion}
        placeholder="Write together…"
        contentProps={{ 'aria-label': `${name}'s document` }}
      />
      <button type="button" className="button" onClick={() => editor.commands.toggleVersions()}>
        Versions
      </button>
    </section>
  );
}

export function CollabEditors() {
  return (
    <div className="split even">
      {PEOPLE.map((person) => (
        <Person key={person.name} {...person} />
      ))}
    </div>
  );
}
