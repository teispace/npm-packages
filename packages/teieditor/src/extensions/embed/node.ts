import {
  $create,
  $getDocument,
  $getEditor,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type LexicalUpdateJSON,
  type SerializedLexicalNode,
} from 'lexical';
import { getPeerOptions } from '../../core/define.js';
import { EMBED_PROVIDERS, type EmbedProvider, embedId } from './providers.js';

/** The extension's name, which the node asks for its providers. */
export const EMBED_EXTENSION = '@teispace/teieditor/embed';

export const EMBED_ALIGNS = ['start', 'center', 'end'] as const;
export type EmbedAlign = (typeof EMBED_ALIGNS)[number];

export interface SerializedEmbedNode extends SerializedLexicalNode {
  /** The provider's name: `youtube`, `x`. */
  provider: string;
  /** What the provider shows: a video's id, a post's. */
  id: string;
  /** Saved when it is not `center`. */
  align?: EmbedAlign;
}

/**
 * The installed providers; the built-in ones where no editor is at hand
 * (a read of a bare editor state) or it lacks the extension.
 */
export function $embedProviders(): readonly EmbedProvider[] {
  return $embedOptions()?.providers ?? EMBED_PROVIDERS;
}

/** The extension's options, if an editor with it is at hand. */
function $embedOptions(): { providers: readonly EmbedProvider[]; consent: boolean } | undefined {
  try {
    return getPeerOptions($getEditor(), EMBED_EXTENSION);
  } catch {
    return undefined;
  }
}

/**
 * Content from another site, shown in a frame: a video, a post, a design.
 * The node saves only the provider and an id; the frame's address is built
 * from them by the provider, so no saved address ever reaches a frame. It
 * draws its own DOM, so it renders the same on a server, and is saved as
 * `<iframe data-tei-embed>`.
 */
export class EmbedNode extends DecoratorNode<null> {
  __provider = '';
  __id = '';
  __align: EmbedAlign = 'center';

  $config() {
    return this.config('embed', { extends: DecoratorNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__provider = prev.__provider;
    this.__id = prev.__id;
    this.__align = prev.__align;
  }

  getProviderName(): string {
    return this.getLatest().__provider;
  }

  getId(): string {
    return this.getLatest().__id;
  }

  setEmbed(provider: string, id: string): this {
    const self = this.getWritable();
    self.__provider = provider;
    self.__id = id;
    return self;
  }

  getAlign(): EmbedAlign {
    return this.getLatest().__align;
  }

  setAlign(align: EmbedAlign): this {
    const self = this.getWritable();
    self.__align = EMBED_ALIGNS.includes(align) ? align : 'center';
    return self;
  }

  /** Its provider and a checked id, or `null`: one not installed, or an id it does not read back. */
  getProvider(): { provider: EmbedProvider; id: string } | null {
    const self = this.getLatest();
    const provider = $embedProviders().find((p) => p.name === self.__provider);
    const id = provider ? embedId(provider, self.__id) : null;
    return provider && id ? { provider, id } : null;
  }

  /** The page it shows, if its provider is installed. */
  getURL(): string | null {
    const found = this.getProvider();
    return found ? found.provider.url(found.id) : null;
  }

  // -- JSON ------------------------------------------------------------------

  updateFromJSON(json: LexicalUpdateJSON<SerializedEmbedNode>): this {
    const self = super.updateFromJSON(json);
    const data = json as Partial<SerializedEmbedNode>;
    if (typeof data.provider === 'string' && typeof data.id === 'string') {
      self.setEmbed(data.provider, data.id);
    }
    if (typeof data.align === 'string') self.setAlign(data.align);
    return self;
  }

  exportJSON(): SerializedEmbedNode {
    const json: SerializedEmbedNode = {
      ...super.exportJSON(),
      provider: this.getProviderName(),
      id: this.getId(),
    };
    if (this.getAlign() !== 'center') json.align = this.getAlign();
    return json;
  }

  // -- DOM -------------------------------------------------------------------

  /**
   * A frame with no address yet: the extension gives it one once it is in
   * the page (in the editor's colour scheme), or a button to load it.
   */
  createDOM(config: EditorConfig): HTMLElement {
    const doc = $getDocument();
    const box = doc.createElement('div');
    box.className = (config.theme.embed as string | undefined) ?? 'tei-embed';
    box.setAttribute('contenteditable', 'false');
    const frame = doc.createElement('div');
    frame.className = 'tei-embed-frame';
    box.append(frame);
    const found = this.getProvider();
    if (found) frame.append(this.#iframe(doc, found.provider));
    this.#paint(box, found);
    return box;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (prev.__provider !== this.__provider || prev.__id !== this.__id) return true;
    this.#paint(dom, this.getProvider());
    return false;
  }

  /** Attributes only: sizes go through the CSSOM, never a style attribute. */
  #paint(box: HTMLElement, found: { provider: EmbedProvider; id: string } | null): void {
    box.setAttribute('data-tei-embed', this.__provider);
    box.setAttribute('data-align', this.__align);
    if (found) {
      box.setAttribute('data-id', found.id);
      box.removeAttribute('data-unknown');
    } else {
      box.removeAttribute('data-id');
      box.setAttribute('data-unknown', '');
    }
    const { aspect, height, maxWidth } = found?.provider ?? {};
    const frame = box.firstElementChild as HTMLElement | null;
    const style = frame?.style;
    if (!style) return;
    if (aspect === null) {
      style.removeProperty('--tei-embed-ratio');
      if (!style.getPropertyValue('--tei-embed-height') && height) {
        style.setProperty('--tei-embed-height', `${height}px`);
      }
    } else if (aspect && aspect > 0) style.setProperty('--tei-embed-ratio', String(aspect));
    if (maxWidth) style.setProperty('--tei-embed-max', `${maxWidth}px`);
  }

  #iframe(doc: Document, provider: EmbedProvider): HTMLIFrameElement {
    const iframe = doc.createElement('iframe');
    frameAttributes(iframe, provider);
    return iframe;
  }

  decorate(): null {
    return null;
  }

  isInline(): false {
    return false;
  }

  /** `<iframe data-tei-embed data-id>`, light, at the provider's size; nothing for one not installed. */
  exportDOM(): DOMExportOutput {
    const doc = $getDocument();
    const found = this.getProvider();
    if (!found) {
      // An id its provider does not read back is nothing worth keeping.
      if ($embedProviders().some((p) => p.name === this.getProviderName()))
        return { element: null };
      // Kept, to read back where the provider is installed.
      const div = doc.createElement('div');
      div.setAttribute('data-tei-embed', this.getProviderName());
      div.setAttribute('data-id', this.getId());
      return { element: div };
    }
    const { provider, id } = found;
    const iframe = doc.createElement('iframe');
    frameAttributes(iframe, provider);
    // With consent, the page loads it on the reader's say.
    const consent = $embedOptions()?.consent;
    iframe.setAttribute(consent ? 'data-src' : 'src', provider.src(id, { theme: 'light' }));
    iframe.setAttribute('data-tei-embed', provider.name);
    iframe.setAttribute('data-id', id);
    if (this.getAlign() !== 'center') iframe.setAttribute('data-align', this.getAlign());
    const width = provider.maxWidth ?? 640;
    iframe.setAttribute('width', String(width));
    iframe.setAttribute(
      'height',
      String(
        provider.aspect === null
          ? (provider.height ?? 320)
          : Math.round(width / (provider.aspect ?? 16 / 9)),
      ),
    );
    return { element: iframe };
  }

  getTextContent(): string {
    return this.getURL() ?? '';
  }
}

/**
 * What every embed's frame has: lazy, sandboxed (scripts and popups for the
 * provider's own page, no navigating this one), a referrer the providers
 * require, and the features its provider asks for.
 */
export function frameAttributes(iframe: HTMLIFrameElement, provider: EmbedProvider): void {
  iframe.setAttribute('title', provider.title);
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  // No `allow-presentation`: Safari logs an error for it.
  iframe.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
  );
  if (provider.allow) iframe.setAttribute('allow', provider.allow);
  iframe.setAttribute('allowfullscreen', '');
}

export function $createEmbedNode(provider: string, id: string, align?: EmbedAlign): EmbedNode {
  const node = $create(EmbedNode).setEmbed(provider, id);
  return align ? node.setAlign(align) : node;
}

export function $isEmbedNode(node: LexicalNode | null | undefined): node is EmbedNode {
  return node instanceof EmbedNode;
}
