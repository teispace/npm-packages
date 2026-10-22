import {
  $create,
  $getDocument,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type LexicalUpdateJSON,
  type SerializedLexicalNode,
} from 'lexical';
import { isSafeFileUrl } from '../../utils/url.js';

export interface SerializedFileNode extends SerializedLexicalNode {
  /** Where to download it; empty while it uploads. */
  src: string;
  /** The file's name, as it downloads. */
  name: string;
  /** In bytes. */
  size?: number;
  mimeType?: string;
}

/** The kind of file a name says, for its badge: `PDF`, `ZIP`; `FILE` without one. */
export function fileKind(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return match ? (match[1] as string).toUpperCase() : 'FILE';
}

/** A byte count as people read it: `820 B`, `2.4 MB`. */
export function formatFileSize(bytes: number, locale?: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  return `${number} ${units[unit]}`;
}

const size = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

/**
 * A file attached to the document: a block with its kind, name and size,
 * which downloads it. It draws its own DOM, so it needs no framework and
 * renders the same on a server; saved as `<a download data-tei-file>`.
 */
export class FileNode extends DecoratorNode<null> {
  __src = '';
  __name = '';
  __size: number | null = null;
  __mimeType = '';

  $config() {
    return this.config('file', { extends: DecoratorNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__src = prev.__src;
    this.__name = prev.__name;
    this.__size = prev.__size;
    this.__mimeType = prev.__mimeType;
  }

  getSrc(): string {
    return this.getLatest().__src;
  }

  /** Refuses a URL that could run script; the file keeps its source. */
  setSrc(src: string): this {
    const self = this.getWritable();
    if (src === '' || isSafeFileUrl(src)) self.__src = src;
    return self;
  }

  getName(): string {
    return this.getLatest().__name;
  }

  setName(name: string): this {
    const self = this.getWritable();
    self.__name = name.trim();
    return self;
  }

  /** In bytes; `null` when unknown. */
  getSize(): number | null {
    return this.getLatest().__size;
  }

  setSize(bytes: number | null): this {
    const self = this.getWritable();
    self.__size = size(bytes);
    return self;
  }

  getMimeType(): string {
    return this.getLatest().__mimeType;
  }

  setMimeType(type: string): this {
    const self = this.getWritable();
    self.__mimeType = type;
    return self;
  }

  // -- JSON ------------------------------------------------------------------

  updateFromJSON(json: LexicalUpdateJSON<SerializedFileNode>): this {
    const self = super.updateFromJSON(json);
    const data = json as Partial<SerializedFileNode>;
    if (typeof data.src === 'string') self.setSrc(data.src);
    if (typeof data.name === 'string') self.setName(data.name);
    self.setSize(size(data.size));
    if (typeof data.mimeType === 'string') self.setMimeType(data.mimeType);
    return self;
  }

  exportJSON(): SerializedFileNode {
    const json: SerializedFileNode = {
      ...super.exportJSON(),
      src: this.getSrc(),
      name: this.getName(),
    };
    const bytes = this.getSize();
    if (bytes !== null) json.size = bytes;
    if (this.getMimeType()) json.mimeType = this.getMimeType();
    return json;
  }

  // -- DOM -------------------------------------------------------------------

  createDOM(config: EditorConfig): HTMLElement {
    const doc = $getDocument();
    const card = doc.createElement('div');
    card.className = (config.theme.file as string | undefined) ?? 'tei-file';
    card.contentEditable = 'false';
    card.setAttribute('data-tei-file', '');
    // The whole card is the link (it downloads in a read-only document);
    // while editing, a click selects the card instead.
    const link = doc.createElement('a');
    link.className = 'tei-file-link';
    const name = doc.createElement('span');
    name.className = 'tei-file-name';
    const meta = doc.createElement('span');
    meta.className = 'tei-file-meta';
    link.append(name, meta);
    card.append(link);
    this.#paint(card);
    return card;
  }

  updateDOM(_prev: this, dom: HTMLElement): false {
    this.#paint(dom);
    return false;
  }

  /** Attributes and text only: no style attribute for a strict CSP to report. */
  #paint(card: HTMLElement): void {
    card.setAttribute('data-ext', fileKind(this.__name));
    const name = card.querySelector('.tei-file-name');
    if (name) name.textContent = this.__name;
    const meta = card.querySelector('.tei-file-meta');
    if (meta) meta.textContent = this.__size === null ? '' : formatFileSize(this.__size);
    const link = card.querySelector('a');
    if (!link) return;
    if (this.__src) {
      link.setAttribute('href', this.__src);
      link.setAttribute('download', this.__name);
    } else {
      link.removeAttribute('href');
      link.removeAttribute('download');
    }
  }

  decorate(): null {
    return null;
  }

  isInline(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const link = $getDocument().createElement('a');
    link.setAttribute('href', this.getSrc());
    link.setAttribute('download', this.getName());
    link.setAttribute('data-tei-file', '');
    link.setAttribute('data-ext', fileKind(this.getName()));
    const bytes = this.getSize();
    if (bytes !== null) {
      link.setAttribute('data-size', String(bytes));
      link.setAttribute('title', formatFileSize(bytes));
    }
    if (this.getMimeType()) link.setAttribute('type', this.getMimeType());
    link.textContent = this.getName();
    return { element: link };
  }

  getTextContent(): string {
    return this.getName();
  }
}

export function $createFileNode(data: {
  src: string;
  name: string;
  size?: number | null;
  mimeType?: string;
}): FileNode {
  return $create(FileNode)
    .setSrc(data.src)
    .setName(data.name)
    .setSize(data.size ?? null)
    .setMimeType(data.mimeType ?? '');
}

export function $isFileNode(node: LexicalNode | null | undefined): node is FileNode {
  return node instanceof FileNode;
}
