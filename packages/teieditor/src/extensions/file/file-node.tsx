import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { JSX } from 'react';

export type SerializedFileNode = Spread<
  { url: string; fileName: string; fileSize: number; mimeType: string },
  SerializedLexicalNode
>;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar')) return '📦';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
  if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
  return '📎';
}

export class FileNode extends DecoratorNode<JSX.Element> {
  __url: string;
  __fileName: string;
  __fileSize: number;
  __mimeType: string;

  static getType(): string {
    return 'file';
  }

  static clone(node: FileNode): FileNode {
    return new FileNode(node.__url, node.__fileName, node.__fileSize, node.__mimeType, node.__key);
  }

  constructor(url: string, fileName: string, fileSize: number, mimeType: string, key?: NodeKey) {
    super(key);
    this.__url = url;
    this.__fileName = fileName;
    this.__fileSize = fileSize;
    this.__mimeType = mimeType;
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'tei-file-wrapper my-2';
    return div;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const a = document.createElement('a');
    a.href = this.__url;
    a.textContent = this.__fileName;
    a.download = this.__fileName;
    return { element: a };
  }

  static importJSON(json: SerializedFileNode): FileNode {
    return $createFileNode(json.url, json.fileName, json.fileSize, json.mimeType);
  }

  exportJSON(): SerializedFileNode {
    return {
      type: 'file',
      version: 1,
      url: this.__url,
      fileName: this.__fileName,
      fileSize: this.__fileSize,
      mimeType: this.__mimeType,
    };
  }

  isInline(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <a
        href={this.__url}
        download={this.__fileName}
        target="_blank"
        rel="noopener noreferrer"
        className="tei-file my-2 flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50"
      >
        <span className="text-2xl" aria-hidden>
          {getFileIcon(this.__mimeType)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{this.__fileName}</div>
          <div className="text-xs text-muted-foreground">{formatFileSize(this.__fileSize)}</div>
        </div>
      </a>
    );
  }
}

export function $createFileNode(
  url: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
): FileNode {
  return $applyNodeReplacement(new FileNode(url, fileName, fileSize, mimeType));
}

export function $isFileNode(node: LexicalNode | null | undefined): node is FileNode {
  return node instanceof FileNode;
}
