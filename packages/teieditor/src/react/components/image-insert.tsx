'use client';

import { type DragEvent, type FormEvent, useEffect, useId, useState } from 'react';
import { getExtensionOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import { Image, type ImageStorage } from '../../extensions/image/index.js';
import { chooseFiles } from '../../utils/files.js';
import { selectionAnchor } from '../selection-anchor.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import { DropdownMenu } from '../ui/dropdown.js';
import type { FloatingAnchor } from '../ui/floating.js';
import { Popover } from '../ui/popover.js';
import { useEditorState } from '../use-editor-state.js';

/** Ask for files with the chooser, as the Image extension accepts them. */
export function pickImages(editor: TeiEditor, multiple: boolean): Promise<File[]> {
  const options = getExtensionOptions(editor, Image);
  const doc = editor.lexical.getRootElement()?.ownerDocument ?? document;
  return chooseFiles(doc, { accept: options?.accept, multiple });
}

/** Files from a drag, or none. */
const draggedFiles = (event: DragEvent) => Array.from(event.dataTransfer?.files ?? []);

// -- Inserting ----------------------------------------------------------------

/**
 * Upload (choose or drop a file) or a link: what the toolbar's image button
 * and `openImageInsert` show. `onDone` closes whatever holds it.
 */
export function InsertImageForm({ editor, onDone }: { editor: TeiEditor; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [over, setOver] = useState(false);
  const errorId = useId();

  const insertFiles = (files: File[]) => {
    if (files.length === 0) return;
    onDone();
    editor.chain().focus().insertImageFiles(files).run();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const src = url.trim();
    if (!src) return;
    // Checked first: a refused link keeps the field focused, to fix it.
    if (!editor.can().insertImage({ src })) {
      setInvalid(true);
      return;
    }
    onDone();
    editor.chain().focus().insertImage({ src }).run();
  };

  return (
    <div className="tei-image-insert" data-tei-control="image-insert">
      <div
        className="tei-dropzone"
        data-over={over ? '' : undefined}
        onDragOver={(event) => {
          if (!event.dataTransfer?.types.includes('Files')) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          insertFiles(draggedFiles(event));
        }}
      >
        <Button
          variant="solid"
          size="sm"
          icon="upload"
          data-tei-control="image-upload"
          onClick={() => void pickImages(editor, true).then(insertFiles)}
        >
          {editor.t('image.upload.choose')}
        </Button>
        <span className="tei-hint">{editor.t('image.upload.drop')}</span>
      </div>
      <form className="tei-link-form" noValidate onSubmit={submit}>
        <Input
          type="url"
          inputMode="url"
          value={url}
          placeholder={editor.t('image.url.placeholder')}
          aria-label={editor.t('image.url.placeholder')}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          data-tei-control="image-url"
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
        />
        <Button type="submit" variant="outline" size="sm" disabled={!url.trim()}>
          {editor.t('image.embed')}
        </Button>
      </form>
      {invalid && (
        <p id={errorId} className="tei-hint" data-error="" role="alert">
          {editor.t('image.url.invalid')}
        </p>
      )}
    </div>
  );
}

/** The toolbar's image button: a popover to upload or link one. */
export function InsertImageMenu({ editor }: { editor: TeiEditor }) {
  const enabled = useEditorState((e) => e.can().openImageInsert(), { editor });
  if (!getExtensionOptions(editor, Image)) return null;
  const label = editor.t('image.insert');
  return (
    <DropdownMenu
      data-item="insertImage"
      data-tei-control="insertImage"
      icon="image"
      label={label}
      aria-label={label}
      menuLabel={label}
      disabled={!enabled}
      content={(close) => <InsertImageForm editor={editor} onDone={close} />}
    />
  );
}

/** The same form, opened by `openImageInsert` (the slash menu's Image) at the caret. */
export function ImageInsertPopover({ editor }: { editor: TeiEditor }) {
  const storage = editor.extension(Image)?.output.storage as ImageStorage | undefined;
  const [anchor, setAnchor] = useState<FloatingAnchor | null>(null);

  // Count as mounted, so `openImageInsert` asks here and not with the bare chooser.
  useEffect(() => {
    if (!storage) return;
    storage.pickers.value++;
    return () => {
      storage.pickers.value--;
    };
  }, [storage]);

  useEffect(() => {
    if (!storage) return;
    let first = true;
    return storage.insertRequest.subscribe(() => {
      if (first) {
        first = false;
        return;
      }
      setAnchor(selectionAnchor(editor) ?? editor.lexical.getRootElement());
    });
  }, [editor, storage]);

  if (!anchor) return null;
  const close = () => setAnchor(null);
  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-start"
      initialFocus="first"
      restoreFocus={false}
      onDismiss={(reason) => {
        close();
        if (reason === 'escape') editor.focus();
      }}
      role="dialog"
      aria-label={editor.t('image.insert')}
      data-tei-control="image-insert-popover"
    >
      <InsertImageForm editor={editor} onDone={close} />
    </Popover>
  );
}
