import {
  $create,
  $getDocument,
  type DOMExportOutput,
  type EditorConfig,
  ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type SerializedElementNode,
} from 'lexical';
import { getPeerOptions } from '../../core/define.js';

export const REVIEW_EXTENSION = '@teispace/teieditor/review';

/** A suggested insertion (proposed text) or deletion (struck text still there). */
export type SuggestionKind = 'insert' | 'delete';

/** Who suggested a change. */
export interface SuggestionAuthor {
  id: string;
  name: string;
}

/**
 * How suggestions leave the editor as HTML: `'original'` drops insertions
 * and keeps deleted text (the document as it was, before review),
 * `'proposed'` does the opposite (as if every suggestion were accepted),
 * and `'marked'` keeps both as `<ins>`/`<del>` with their author and time.
 */
export type SuggestionExportMode = 'original' | 'proposed' | 'marked';

export interface SerializedSuggestionNode extends SerializedElementNode {
  kind: SuggestionKind;
  suggestionId: string;
  author: SuggestionAuthor;
  createdAt: number;
}

const MAX_ID = 128;
const MAX_NAME = 200;
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

/**
 * A run of suggested text: inline, around the text it is about. One
 * suggestion (one id) can span several runs, across blocks.
 */
export class SuggestionNode extends ElementNode {
  __kind: SuggestionKind = 'insert';
  __suggestionId = '';
  __authorId = '';
  __authorName = '';
  __createdAt = 0;

  $config() {
    return this.config('suggestion', { extends: ElementNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__kind = prev.__kind;
    this.__suggestionId = prev.__suggestionId;
    this.__authorId = prev.__authorId;
    this.__authorName = prev.__authorName;
    this.__createdAt = prev.__createdAt;
  }

  getKind(): SuggestionKind {
    return this.getLatest().__kind;
  }

  getSuggestionId(): string {
    return this.getLatest().__suggestionId;
  }

  getAuthor(): SuggestionAuthor {
    const self = this.getLatest();
    return { id: self.__authorId, name: self.__authorName };
  }

  getCreatedAt(): number {
    return this.getLatest().__createdAt;
  }

  /** Set everything that says what the suggestion is, at once. */
  setSuggestion(
    kind: SuggestionKind,
    id: string,
    author: SuggestionAuthor,
    createdAt: number,
  ): this {
    const self = this.getWritable();
    self.__kind = kind === 'delete' ? 'delete' : 'insert';
    self.__suggestionId = text(id, MAX_ID);
    self.__authorId = text(author.id, MAX_ID);
    self.__authorName = text(author.name, MAX_NAME);
    self.__createdAt = Number.isFinite(createdAt) && createdAt >= 0 ? createdAt : 0;
    return self;
  }

  /** Whether it is the same suggestion as `other`: kind, id and author. */
  isSameSuggestion(other: SuggestionNode): boolean {
    return (
      this.getKind() === other.getKind() &&
      this.getSuggestionId() === other.getSuggestionId() &&
      this.getAuthor().id === other.getAuthor().id
    );
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedSuggestionNode>): this {
    const self = super.updateFromJSON(json);
    const raw = json as Partial<SerializedSuggestionNode>;
    const author = (raw.author ?? {}) as Partial<SuggestionAuthor>;
    return self.setSuggestion(
      raw.kind === 'delete' ? 'delete' : 'insert',
      text(raw.suggestionId, MAX_ID),
      { id: text(author.id, MAX_ID), name: text(author.name, MAX_NAME) },
      typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    );
  }

  exportJSON(): SerializedSuggestionNode {
    return {
      ...super.exportJSON(),
      kind: this.getKind(),
      suggestionId: this.getSuggestionId(),
      author: this.getAuthor(),
      createdAt: this.getCreatedAt(),
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = $getDocument().createElement(this.__kind === 'insert' ? 'ins' : 'del');
    element.className = (config.theme.suggestion as string | undefined) ?? 'tei-suggestion';
    this.#attributes(element);
    return element;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (prev.__kind !== this.__kind) return true;
    this.#attributes(dom);
    return false;
  }

  #attributes(element: HTMLElement): void {
    element.setAttribute('data-tei-suggestion', this.__suggestionId);
    element.setAttribute('data-kind', this.__kind);
    element.setAttribute('data-author', this.__authorId);
    // The author's name for a pointer's tooltip; the review popover says it in full.
    element.setAttribute('title', this.__authorName);
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const mode =
      getPeerOptions<{ exportMode: SuggestionExportMode }>(editor, REVIEW_EXTENSION)?.exportMode ??
      'original';
    const doc = $getDocument();
    if (mode !== 'marked') {
      const kept = (mode === 'original') === (this.getKind() === 'delete');
      // Dropped with its text, or unwrapped to it.
      return { element: kept ? doc.createDocumentFragment() : null };
    }
    const element = doc.createElement(this.getKind() === 'insert' ? 'ins' : 'del');
    element.setAttribute('data-tei-suggestion', this.getSuggestionId());
    element.setAttribute('data-author', this.getAuthor().id);
    element.setAttribute('data-author-name', this.getAuthor().name);
    element.setAttribute('datetime', new Date(this.getCreatedAt()).toISOString());
    return { element };
  }

  isInline(): true {
    return true;
  }

  canBeEmpty(): false {
    return false;
  }

  /** Typing at its edges goes outside it: suggest mode decides where text goes. */
  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }
}

export function $createSuggestionNode(
  kind: SuggestionKind,
  id: string,
  author: SuggestionAuthor,
  createdAt: number,
): SuggestionNode {
  return $create(SuggestionNode).setSuggestion(kind, id, author, createdAt);
}

export function $isSuggestionNode(node: LexicalNode | null | undefined): node is SuggestionNode {
  return node instanceof SuggestionNode;
}
