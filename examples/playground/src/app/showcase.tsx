'use client';

import '@excalidraw/excalidraw/index.css';
import { full } from '@teispace/teieditor/presets/full';
import { minimal } from '@teispace/teieditor/presets/minimal';
import { notion } from '@teispace/teieditor/presets/notion';
import { Editor, useEditorState, useTeiEditor } from '@teispace/teieditor/react';
import { useRef, useState } from 'react';
import { Choice } from '@/components/choice';
import { DEMO } from '@/content';
import { type ExtensionSettings, extensionsFor } from '@/extensions';

/** The editor is the page's own; a preset here only chooses the UI. */
const PRESETS = { full, notion, minimal };
const PRESET_NAMES = ['full', 'notion', 'minimal'] as const;
const FORMATS = ['html', 'markdown', 'json', 'text'] as const;
const CODE_COLOURS = ['prism', 'shiki'] as const;

/** `initialHTML`: the document as the server rendered it, shown until the editor mounts. */
export function Showcase({ initialHTML }: { initialHTML?: string }) {
  const [settings, setSettings] = useState<ExtensionSettings>({ shiki: false, autocomplete: false });
  // A change of extensions builds a new editor; the document carries over.
  const kept = useRef<unknown>(DEMO);
  const editor = useTeiEditor(
    { extensions: extensionsFor(settings), content: kept.current },
    [settings.shiki, settings.autocomplete],
  );
  const change = (next: Partial<ExtensionSettings>) => {
    kept.current = editor.getJSON();
    setSettings({ ...settings, ...next });
  };
  const [preset, setPreset] = useState<(typeof PRESET_NAMES)[number]>('full');
  const [editable, setEditable] = useState(true);
  const [sticky, setSticky] = useState(true);
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('html');
  // Re-reads on every change; the selector keeps the panel's renders to real changes.
  const output = useEditorState((e) => e.getContent(format), { editor });

  return (
    <div className="split">
      <Editor
        editor={editor}
        preset={PRESETS[preset]}
        editable={editable}
        stickyToolbar={sticky}
        placeholder="Write something…"
        initialHTML={initialHTML}
      />
      <aside className="panel" aria-label="Settings">
        <h2>Settings</h2>
        <Choice label="Preset" value={preset} options={PRESET_NAMES} onChange={setPreset} />
        <label>
          Editable
          <input type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)} />
        </label>
        <label>
          Sticky toolbar
          <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)} />
        </label>
        <Choice
          label="Code colours"
          value={settings.shiki ? 'shiki' : 'prism'}
          options={CODE_COLOURS}
          onChange={(value) => change({ shiki: value === 'shiki' })}
        />
        <label>
          Autocomplete
          <input
            type="checkbox"
            checked={settings.autocomplete}
            onChange={(e) => change({ autocomplete: e.target.checked })}
          />
        </label>
        <h2>Output</h2>
        <Choice label="Format" value={format} options={FORMATS} onChange={setFormat} />
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: it scrolls, and a keyboard scrolls what has focus */}
        <pre className="output" data-testid="output" tabIndex={0} aria-label="Output">
          {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
        </pre>
      </aside>
    </div>
  );
}
