'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  createCommand,
  DROP_COMMAND,
  type LexicalCommand,
  PASTE_COMMAND,
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

  // Handle pasted / dropped image files. Registered through Lexical's
  // PASTE_COMMAND / DROP_COMMAND (not raw root listeners) so this is the single
  // source of truth for image insertion — it returns `true` to stop
  // propagation, which prevents the DragDropPaste extension from also inserting
  // the same file (the previous raw-DOM-listener approach could not, causing a
  // double image). Command handlers also migrate automatically if the
  // contentEditable root is recreated, so there is nothing to leak.
  useEffect(() => {
    const accepted = (file: File): boolean =>
      accept.some((type) => file.type.match(type.replace('*', '.*'))) && file.size <= maxSize;

    const insertFiles = (files: FileList): boolean => {
      const images = Array.from(files).filter(accepted);
      if (images.length === 0) return false;
      // Resolve uploads outside the (sync) command handler, then dispatch.
      void Promise.all(
        images.map(async (file) => {
          const src = onUpload ? await onUpload(file) : await fileToDataUrl(file);
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src, altText: file.name });
        }),
      );
      return true;
    };

    // NORMAL priority (above DragDropPaste's LOW) so when both extensions are
    // present the image plugin — which has the accept/maxSize/onUpload config —
    // handles the file and stops propagation; DragDropPaste still works on its
    // own for setups that don't include the image plugin.
    const removePaste = editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const files = event.clipboardData?.files;
        if (!files || files.length === 0) return false;
        if (!Array.from(files).some(accepted)) return false;
        event.preventDefault();
        return insertFiles(files);
      },
      COMMAND_PRIORITY_NORMAL,
    );

    const removeDrop = editor.registerCommand(
      DROP_COMMAND,
      (event: DragEvent) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        if (!Array.from(files).some(accepted)) return false;
        event.preventDefault();
        return insertFiles(files);
      },
      COMMAND_PRIORITY_NORMAL,
    );

    return () => {
      removePaste();
      removeDrop();
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
