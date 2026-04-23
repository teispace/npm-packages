import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { useEffect } from 'react';
import { $getOrCreateRangeSelection } from '../../core/insert.js';
import { $createImageNode, type ImagePayload } from './image-node.js';

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const INSERT_IMAGE_COMMAND: LexicalCommand<ImagePayload> =
  createCommand('INSERT_IMAGE_COMMAND');

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface ImagePluginProps {
  /** Async upload handler. Receives a File, returns a URL. */
  onUpload?: (file: File) => Promise<string>;
  /** Max file size in bytes. Default: 10MB. */
  maxSize?: number;
  /** Accepted MIME types. Default: image/*. */
  accept?: string[];
}

export function ImagePlugin({
  onUpload,
  maxSize = 10 * 1024 * 1024,
  accept = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
}: ImagePluginProps = {}): null {
  const [editor] = useLexicalComposerContext();

  // Handle INSERT_IMAGE_COMMAND
  useEffect(() => {
    return editor.registerCommand(
      INSERT_IMAGE_COMMAND,
      (payload) => {
        editor.update(() => {
          const selection = $getOrCreateRangeSelection();
          if (!selection) return;
          const imageNode = $createImageNode(payload);
          selection.insertNodes([imageNode]);
          // Add paragraph after image so cursor has somewhere to go
          const paragraph = $createParagraphNode();
          imageNode.insertAfter(paragraph);
          paragraph.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  // Handle paste
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        if (!accept.some((type) => file.type.match(type.replace('*', '.*')))) continue;
        if (file.size > maxSize) continue;

        e.preventDefault();
        const src = onUpload ? await onUpload(file) : await fileToDataUrl(file);
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          src,
          altText: file.name,
        });
      }
    };

    root.addEventListener('paste', handlePaste);
    return () => root.removeEventListener('paste', handlePaste);
  }, [editor, onUpload, maxSize, accept]);

  // Handle drop
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleDrop = async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        if (!accept.some((type) => file.type.match(type.replace('*', '.*')))) continue;
        if (file.size > maxSize) continue;

        e.preventDefault();
        const src = onUpload ? await onUpload(file) : await fileToDataUrl(file);
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          src,
          altText: file.name,
        });
      }
    };

    const handleDragOver = (e: DragEvent) => {
      const hasFiles = e.dataTransfer?.types.includes('Files');
      if (hasFiles) e.preventDefault();
    };

    root.addEventListener('drop', handleDrop);
    root.addEventListener('dragover', handleDragOver);
    return () => {
      root.removeEventListener('drop', handleDrop);
      root.removeEventListener('dragover', handleDragOver);
    };
  }, [editor, onUpload, maxSize, accept]);

  return null;
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
