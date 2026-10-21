'use client';

import { Editor, type EditorPreset, useEditorState, useTeiEditor } from '@teispace/teieditor/react';
import { useState } from 'react';
import { Choice } from '@/components/choice';
import { DEMO } from '@/content';
import { EXTENSIONS } from '@/extensions';

const PRESETS = ['full', 'notion', 'minimal'] as const satisfies readonly EditorPreset[];
const FORMATS = ['html', 'markdown', 'json', 'text'] as const;

/** `initialHTML`: the document as the server rendered it, shown until the editor mounts. */
export function Showcase({ initialHTML }: { initialHTML?: string }) {
  const editor = useTeiEditor({ extensions: EXTENSIONS, content: DEMO });
  const [preset, setPreset] = useState<EditorPreset>('full');
  const [editable, setEditable] = useState(true);
  const [sticky, setSticky] = useState(true);
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('html');
  // Re-reads on every change; the selector keeps the panel's renders to real changes.
  const output = useEditorState((e) => e.getContent(format), { editor });

  return (
    <div className="split">
      <Editor
        editor={editor}
        preset={preset}
        editable={editable}
        stickyToolbar={sticky}
        placeholder="Write something…"
        initialHTML={initialHTML}
      />
      <aside className="panel" aria-label="Settings">
        <h2>Settings</h2>
        <Choice label="Preset" value={preset} options={PRESETS} onChange={setPreset} />
        <label>
          Editable
          <input type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)} />
        </label>
        <label>
          Sticky toolbar
          <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)} />
        </label>
        <h2>Output</h2>
        <Choice label="Format" value={format} options={FORMATS} onChange={setFormat} />
        <pre className="output" data-testid="output">
          {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
        </pre>
      </aside>
    </div>
  );
}
