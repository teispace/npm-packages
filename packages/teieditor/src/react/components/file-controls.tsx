'use client';

import { $getSelection, $isNodeSelection, type NodeKey } from 'lexical';
import { useMemo, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import { $getFile, FileAttachment } from '../../extensions/file/index.js';
import { chooseFiles } from '../../utils/files.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import { DropdownMenu } from '../ui/dropdown.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';
import type { ToolbarControl } from './editor-toolbar.js';
import { NodeToolbar } from './node-toolbar.js';

interface Selected {
  key: NodeKey;
  src: string;
  name: string;
}

const same = (a: Selected | null, b: Selected | null) =>
  a === b || (a !== null && b !== null && a.key === b.key && a.src === b.src && a.name === b.name);

/** The selected file, when a file is what is selected. */
function useSelectedFile(editor: TeiEditor): Selected | null {
  return useEditorState(
    (e) =>
      e.read(() => {
        const node = $isNodeSelection($getSelection()) ? $getFile() : null;
        return node ? { key: node.getKey(), src: node.getSrc(), name: node.getName() } : null;
      }),
    { editor, equal: same },
  );
}

/**
 * Download it. A link to another origin ignores `download`, so it opens in
 * a tab instead, never in place of the document.
 */
function DownloadControl({ editor }: { editor: TeiEditor }) {
  const selected = useSelectedFile(editor);
  if (!selected) return null;
  return (
    <Button
      size="sm"
      icon="download"
      label={editor.t('file.download')}
      disabled={!selected.src}
      data-item="fileDownload"
      data-tei-control="file-download"
      onClick={() => {
        const doc = editor.lexical.getRootElement()?.ownerDocument ?? document;
        const link = doc.createElement('a');
        link.href = selected.src;
        link.download = selected.name;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
      }}
    />
  );
}

function RenameControl({ editor }: { editor: TeiEditor }) {
  const selected = useSelectedFile(editor);
  if (!selected) return null;
  const label = editor.t('file.rename');
  return (
    <DropdownMenu
      size="sm"
      icon="pencil"
      chevron={false}
      label={label}
      aria-label={label}
      data-item="fileRename"
      data-tei-control="file-rename"
      content={(close) => (
        <RenameForm
          editor={editor}
          file={selected}
          onDone={() => {
            close();
            editor.focus();
          }}
        />
      )}
    />
  );
}

function RenameForm({
  editor,
  file,
  onDone,
}: {
  editor: TeiEditor;
  file: Selected;
  onDone: () => void;
}) {
  const [name, setName] = useState(file.name);
  return (
    <form
      className="tei-file-rename"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (editor.commands.renameFile(name, file.key)) onDone();
      }}
    >
      <div className="tei-link-form">
        <Input
          value={name}
          placeholder={editor.t('file.rename.placeholder')}
          aria-label={editor.t('file.rename.placeholder')}
          data-tei-control="file-rename-input"
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" variant="solid" size="sm" disabled={!name.trim()}>
          {editor.t('file.save')}
        </Button>
      </div>
    </form>
  );
}

function ReplaceControl({ editor }: { editor: TeiEditor }) {
  const selected = useSelectedFile(editor);
  if (!selected) return null;
  return (
    <Button
      size="sm"
      icon="replace"
      label={editor.t('file.replace')}
      data-item="fileReplace"
      data-tei-control="file-replace"
      onClick={() => {
        const doc = editor.lexical.getRootElement()?.ownerDocument ?? document;
        void chooseFiles(doc, { multiple: false }).then(([file]) => {
          if (file) editor.chain().focus().replaceFile(file, selected.key).run();
        });
      }}
    />
  );
}

const FILE_CONTROLS: Record<string, ToolbarControl> = {
  fileDownload: DownloadControl,
  fileRename: RenameControl,
  fileReplace: ReplaceControl,
};

export interface FileControlsProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** Controls the `fileMenu` items name, besides (or replacing) the built-in ones. */
  controls?: Record<string, ToolbarControl>;
}

/**
 * The toolbar over a selected file: download, rename, replace, delete.
 * Renders nothing without `FileAttachment`.
 *
 * Render it once inside `<EditorContent>` (`<Editor>` does).
 */
export function FileControls({ editor: editorProp, controls }: FileControlsProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <FileControls> needs an `editor` prop or a provider');
  const installed = editor.extension(FileAttachment) !== undefined;
  const focused = useEditorFocus(editor);
  const editable = useEditorState((e) => e.isEditable, { editor });
  const selected = useSelectedFile(editor);
  const named = useMemo(() => ({ ...FILE_CONTROLS, ...controls }), [controls]);
  const anchor = selected && editor.lexical.getElementByKey(selected.key);
  if (!installed || !editable || !focused || !anchor) return null;
  return (
    <TeiEditorContext.Provider value={editor}>
      <NodeToolbar
        editor={editor}
        anchor={anchor}
        placement="fileMenu"
        label={editor.t('file.menu')}
        control="file-toolbar"
        controls={named}
      />
    </TeiEditorContext.Provider>
  );
}
