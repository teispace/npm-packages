import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, DROP_COMMAND, PASTE_COMMAND } from 'lexical';
import { useEffect } from 'react';
import { INSERT_IMAGE_COMMAND } from '../image/image-plugin.js';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Enhanced drag & drop / paste handler for files.
 * Automatically inserts images from dropped/pasted files.
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
      (event: ClipboardEvent) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          const hasImages = Array.from(files).some((f) => f.type.startsWith('image/'));
          if (hasImages) {
            event.preventDefault();
            handleFiles(files);
            return true;
          }
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    const removeDrop = editor.registerCommand(
      DROP_COMMAND,
      (event: DragEvent) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          const hasImages = Array.from(files).some((f) => f.type.startsWith('image/'));
          if (hasImages) {
            event.preventDefault();
            handleFiles(files);
            return true;
          }
        }
        return false;
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
