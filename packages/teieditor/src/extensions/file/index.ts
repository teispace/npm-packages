import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { $createFileNode, FileNode } from './file-node.js';

export interface FilePayload {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface FileConfig extends ExtensionConfig {
  /** Async upload handler. Receives a File, returns a URL. */
  onUpload?: (file: File) => Promise<string>;
  /** Max file size in bytes. Default: 50MB. */
  maxSize: number;
}

export const INSERT_FILE_COMMAND: LexicalCommand<FilePayload> =
  createCommand('INSERT_FILE_COMMAND');

class FileExtension extends BaseExtension<FileConfig> {
  readonly name = 'file';
  protected readonly defaults: FileConfig = {
    maxSize: 50 * 1024 * 1024,
  };

  getNodes(): Array<Klass<LexicalNode>> {
    return [FileNode];
  }

  onRegister(editor: LexicalEditor): (() => void) | undefined {
    return editor.registerCommand(
      INSERT_FILE_COMMAND,
      (payload) => {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const node = $createFileNode(
            payload.url,
            payload.fileName,
            payload.fileSize,
            payload.mimeType,
          );
          selection.insertNodes([node]);
          const paragraph = $createParagraphNode();
          node.insertAfter(paragraph);
          paragraph.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const File = new FileExtension();
export { $createFileNode, $isFileNode, FileNode } from './file-node.js';
