'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, DROP_COMMAND, PASTE_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { INSERT_IMAGE_COMMAND } from '../image/image-plugin.js';
import { fileToDataUrl, getDroppedFiles, getPastedFiles } from '../shared/files.js';

/**
 * Drag & drop / paste handler that inserts images from dropped/pasted files.
 *
 * Registered at `COMMAND_PRIORITY_LOW`. When the Image extension is also active
 * (e.g. in StarterKit) its handler runs first at `COMMAND_PRIORITY_NORMAL` and
 * stops propagation, so this plugin only takes effect for setups that include
 * DragDropPaste WITHOUT the Image extension — avoiding the double-insertion
 * that occurred when both handled the same paste/drop.
 */
export function DragDropPastePlugin({
  onUpload,
}: {
  onUpload?: (file: File) => Promise<string>;
} = {}): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleFiles = async (files: FileList) => {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          const src = onUpload ? await onUpload(file) : await fileToDataUrl(file);
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src, altText: file.name });
        }
      }
    };

    const removePaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const files = getPastedFiles(event);
        if (!files) return false;
        if (!Array.from(files).some((f) => f.type.startsWith('image/'))) return false;
        event.preventDefault();
        handleFiles(files);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    const removeDrop = editor.registerCommand(
      DROP_COMMAND,
      (event) => {
        const files = getDroppedFiles(event);
        if (!files) return false;
        if (!Array.from(files).some((f) => f.type.startsWith('image/'))) return false;
        event.preventDefault();
        handleFiles(files);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      removePaste();
      removeDrop();
    };
  }, [editor, onUpload]);

  return null;
}
