'use client';

import { $getSelection, $isRangeSelection } from 'lexical';
import type { TeiIconNode } from '@teispace/teieditor';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { Editor, type ToolbarLayout } from '@teispace/teieditor/react';

// Lucide's calendar, as icon data: the editor draws it as inline SVG.
const calendar: TeiIconNode = [
  ['path', { d: 'M8 2v4' }],
  ['path', { d: 'M16 2v4' }],
  ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
  ['path', { d: 'M3 10h18' }],
];

const layout: ToolbarLayout = [
  ['undo', 'redo'],
  ['blockType'],
  ['bold', 'italic', 'strike', 'code'],
  ['bulletList', 'checkList', 'link'],
  ['today'],
];

export function CustomEditor() {
  return (
    <Editor
      className="brand-editor"
      extensions={StarterKit}
      content="<p>Press the calendar, or type <code>/today</code>.</p>"
      toolbar={layout}
      icons={{ calendar }}
      messages={{ 'format.bold': 'Strong', 'item.today': "Today's date" }}
      items={{
        subscript: null,
        superscript: null,
        today: {
          id: 'today',
          label: 'item.today',
          description: 'Insert the date',
          icon: 'calendar',
          in: ['toolbar', 'slash'],
          group: 'insert',
          keywords: ['date', 'now'],
          run: (editor) =>
            editor.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.insertText(new Date().toLocaleDateString('en-GB', { dateStyle: 'long' }));
              }
            }),
        },
      }}
      keymap={{ strike: { key: 'Mod-Shift-x', command: 'toggleStrike' } }}
    />
  );
}
