// The README's examples, against the built package: if the API they show
// changes, this stops compiling.
import { defineTeiExtension, getExtensionOptions, setExtensionOptions } from '@teispace/teieditor';
import { Mention } from '@teispace/teieditor/extensions/mention';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { Table } from '@teispace/teieditor/extensions/table';
import { full } from '@teispace/teieditor/presets/full';
import { notion } from '@teispace/teieditor/presets/notion';
import {
  BubbleMenu,
  Editor,
  EditorContent,
  EditorProvider,
  SlashMenu,
  shallowEqual,
  TeiUIContext,
  useEditorState,
  useTeiEditor,
} from '@teispace/teieditor/react';
import { renderToHTML, toMarkdown } from '@teispace/teieditor/server';
import { $getSelection, $isRangeSelection } from 'lexical';

declare const saved: unknown;
declare function save(value: unknown): void;
declare function findPeople(query: string): Promise<{ id: string; label: string }[]>;
declare function track(name: string): void;
declare function audit(name: string, next: () => boolean): boolean;
declare function showStats(): void;

declare module '@teispace/teieditor' {
  interface TeiCommands {
    insertSignature: [name: string];
  }
}

export const Signature = defineTeiExtension({
  name: 'my-app/signature',
  config: { prefix: '— ' },
  commands: {
    insertSignature: {
      run: ({ editor }, name: string) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        const prefix = getExtensionOptions(editor, Signature)?.prefix ?? '';
        selection.insertText(`${prefix}${name}`);
        return true;
      },
      can: () => $isRangeSelection($getSelection()),
    },
  },
  keymap: { signature: { key: 'Mod-Alt-s', command: 'insertSignature', args: ['Me'] } },
  items: [
    {
      id: 'signature',
      label: 'Signature',
      icon: 'pencil',
      in: ['slash', 'toolbar'],
      command: 'insertSignature',
      args: ['Me'],
    },
  ],
});

export function Examples() {
  const extensions = notion.extensions.map((ext) =>
    ext === Mention ? Mention.configure({ search: findPeople }) : ext,
  );
  const editor = useTeiEditor({
    extensions: [StarterKit, Table.configure({ maxRows: 50 }), Signature],
    content: saved,
    items: {
      strike: null,
      wordCount: { id: 'wordCount', label: 'Words', in: ['toolbar'], run: showStats },
    },
    commands: { toggleBold: { run: ({ next }) => (track('bold'), next()) } },
    keymap: { underline: null, bold: { key: 'Mod-Shift-b', command: 'toggleBold' } },
    middleware: [(call, next) => (call.check ? next() : audit(call.name, next))],
  });
  const { bold } = useEditorState((e) => ({ bold: e.isActive('bold') }), {
    editor,
    equal: shallowEqual,
  });
  editor.chain().focus().toggleHeading(2).insertTable(3, 3).run();
  editor.can().toggleBulletList();
  editor.isActive('heading', 2);
  editor.commands.insertSignature('Ada');
  setExtensionOptions(editor, Table, { maxRows: 10 });
  const html = renderToHTML(saved, { extensions: full.extensions });
  toMarkdown(saved, { extensions: full.extensions });
  return (
    <>
      <Editor preset={full} content={saved} onChange={save} placeholder="Write something…" />
      <Editor preset={notion} extensions={extensions} />
      <Editor content={saved} onChange={(value) => save(value)} format="html" />
      <Editor editor={editor} preset={full} initialHTML={html} />
      <Editor frameProps={{ 'data-tei-theme': 'shadcn' }} colorScheme="dark" />
      <Editor
        preset={full}
        slots={{ contextMenu: false, toolbar: <nav />, footer: <footer /> }}
        toolbar={[
          ['undo', 'redo'],
          ['blockType'],
          ['bold', 'italic', 'link'],
          [<button key="x" type="button" />],
        ]}
      />
      <TeiUIContext.Provider value={{ classNames: { button: 'my-button' }, unstyled: false }}>
        <Editor />
      </TeiUIContext.Provider>
      <EditorProvider editor={editor}>
        <EditorContent editor={editor}>
          <BubbleMenu />
          <SlashMenu />
        </EditorContent>
      </EditorProvider>
      <p>{bold ? 'bold' : ''}</p>
    </>
  );
}
