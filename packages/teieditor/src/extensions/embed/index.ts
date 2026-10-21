import { configExtension, type Signal, signal } from '@lexical/extension';
import { DOMImportExtension, type DOMPreprocessFn, defineImportRule, sel } from '@lexical/html';
import { $isLinkNode, AutoLinkNode, LinkNode } from '@lexical/link';
import type { ElementTransformer } from '@lexical/markdown';
import {
  $getNodeByKey,
  $getPreviousSelection,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  type Klass,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
  PASTE_TAG,
} from 'lexical';
import {
  defineTeiExtension,
  getExtensionOptions,
  type TeiExtension,
  type TeiExtensionContext,
} from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  $caretAfter,
  $insertBlock,
  $liftBlock,
  $removeBlockHost,
  registerHostSelection,
  registerSelectedAttribute,
} from '../../core/slot-host.js';
import type { TeiItem } from '../../core/types.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import {
  check,
  copy,
  embed as embedIcon,
  externalLink,
  imageCenter,
  imageEnd,
  imageStart,
  trash,
  video,
} from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';
import {
  $createEmbedNode,
  $embedProviders,
  $isEmbedNode,
  EMBED_ALIGNS,
  EMBED_EXTENSION,
  type EmbedAlign,
  EmbedNode,
} from './node.js';
import { EMBED_PROVIDERS, type EmbedProvider, embedId, matchEmbed } from './providers.js';

export type { EmbedAlign, SerializedEmbedNode } from './node.js';
export { $createEmbedNode, $isEmbedNode, EMBED_ALIGNS, EmbedNode } from './node.js';
export type { EmbedProvider } from './providers.js';
export {
  EMBED_PROVIDERS,
  embedId,
  figma,
  loom,
  matchEmbed,
  vimeo,
  x,
  youtube,
} from './providers.js';

export interface EmbedOptions {
  /** Where embeds come from, in the order links are tried. Add your own. */
  providers: readonly EmbedProvider[];
  /**
   * A link pasted on its own that a provider reads: `ask` offers to embed
   * it (the default), `always` embeds it, `never` keeps the link.
   */
  autoEmbed: 'ask' | 'always' | 'never';
  /**
   * Load nothing from another site until the reader asks: each embed shows
   * a button to load it. Saved HTML then keeps the frame's address in
   * `data-src`, for your page to load on the reader's say.
   */
  consent: boolean;
}

/** A pasted link the editor offers to embed. */
export interface EmbedSuggestion {
  /** The link node's key. */
  key: NodeKey;
  provider: EmbedProvider;
  id: string;
}

export interface EmbedStorage {
  /** `openEmbedInsert`'s requests, to an insert form. */
  insert: UiRequest;
  /** The provider the last `openEmbedInsert` asked for, if one. */
  insertProvider: Signal<string | null>;
  /** The pasted link the editor offers to embed (`autoEmbed: 'ask'`). */
  suggestion: Signal<EmbedSuggestion | null>;
}

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Embed what a link points to, where the caret is: a video, a post, a design. */
    insertEmbed: [url: string, align?: EmbedAlign];
    /** Ask for a link to embed (`<Editor>` opens a form at the caret), for one provider or any. */
    openEmbedInsert: [provider?: string];
    /** Embed a link's page in place of the link (the suggested one, or the one with `key`). */
    embedLink: [key?: NodeKey];
    setEmbedAlign: [align: EmbedAlign, key?: NodeKey];
    removeEmbed: [key?: NodeKey];
  }
  interface TeiActiveStates {
    /** An embed is selected. */
    embed: [];
    embedAlign: [align: EmbedAlign];
  }
}

type Ctx = TeiExtensionContext<EmbedOptions, EmbedStorage> & {
  editor: TeiEditor;
  lexical: LexicalEditor;
};

/** The embed with this key, else the selected one. */
export function $getEmbed(key?: NodeKey): EmbedNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isEmbedNode(node) ? node : null;
  }
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;
  const nodes = selection.getNodes();
  return nodes.length === 1 && $isEmbedNode(nodes[0]) ? nodes[0] : null;
}

const $hasEmbed = () => $getEmbed() !== null;

function $canInsert(): boolean {
  const selection = $getSelection() ?? $getPreviousSelection();
  return $isRangeSelection(selection) || $isNodeSelection(selection);
}

function $insertEmbedNode(node: EmbedNode): EmbedNode {
  const selection = $getSelection() ?? $getPreviousSelection();
  const selected = $isNodeSelection(selection) ? selection.getNodes().at(-1) : null;
  if (selected && !selected.isInline()) selected.insertAfter(node);
  else $insertBlock(node);
  return node.getLatest();
}

/**
 * The link with this key embedded in its place: its paragraph becomes the
 * embed when the link is all it holds, else the paragraph splits round it.
 */
function $embedLinkNode(link: LinkNode, provider: EmbedProvider, id: string): EmbedNode {
  const embed = $createEmbedNode(provider.name, id);
  const block = link.getTopLevelElement();
  if (
    block &&
    $isElementNode(block) &&
    block.getTextContent().trim() === link.getTextContent().trim()
  ) {
    block.replace(embed);
  } else {
    link.selectNext(0, 0);
    link.remove();
    $insertBlock(embed);
  }
  $caretAfter(embed);
  return embed;
}

/** A link whose text is its address (or that address without its scheme): one pasted on its own. */
function isBareLink(link: LinkNode): boolean {
  const text = link.getTextContent().trim();
  const url = link.getURL();
  return text === url || text === url.replace(/^https?:\/\//, '');
}

// -- HTML and Markdown --------------------------------------------------------

/**
 * Frames are dropped from HTML before it is read (the Html extension's
 * rule): one a provider reads becomes a `<div data-tei-embed data-id>`
 * first, which the rule below reads. Any other frame goes.
 */
const keepEmbedFrames: DOMPreprocessFn = (dom, _ctx, $next) => {
  const providers = $embedProviders();
  for (const iframe of Array.from(dom.querySelectorAll('iframe'))) {
    const name = iframe.getAttribute('data-tei-embed');
    const saved = name ? providers.find((p) => p.name === name) : undefined;
    const id = saved && embedId(saved, iframe.getAttribute('data-id'));
    const found =
      saved && id
        ? { provider: saved, id }
        : matchEmbed(
            providers,
            iframe.getAttribute('src') ?? iframe.getAttribute('data-src') ?? '',
          );
    if (!found) continue;
    const kept = iframe.ownerDocument.createElement('div');
    kept.setAttribute('data-tei-embed', found.provider.name);
    kept.setAttribute('data-id', found.id);
    const align = iframe.getAttribute('data-align');
    if (align) kept.setAttribute('data-align', align);
    iframe.replaceWith(kept);
  }
  $next();
};

/** `<div data-tei-embed data-id>`: a provider's frame, or an embed saved where its provider was missing. */
const EMBED_RULE = defineImportRule({
  name: '@teispace/teieditor/embed',
  match: sel.tag('div'),
  $import: (_ctx, el, $next) => {
    const name = el.getAttribute('data-tei-embed');
    const id = el.getAttribute('data-id');
    if (!name || !id || el.childNodes.length > 0) return $next();
    return [$createEmbedNode(name, id, alignOf(el))];
  },
});

/** X's own embed code: a quote with the post's link, which its script would replace. */
const TWEET_RULE = defineImportRule({
  name: '@teispace/teieditor/embed/tweet',
  match: sel.tag('blockquote'),
  $import: (_ctx, el, $next) => {
    if (!el.classList.contains('twitter-tweet')) return $next();
    const links = Array.from(el.querySelectorAll('a[href]'));
    for (const link of links.reverse()) {
      const found = matchEmbed($embedProviders(), link.getAttribute('href') ?? '');
      if (found) return [$createEmbedNode(found.provider.name, found.id)];
    }
    return $next();
  },
});

function alignOf(el: Element): EmbedAlign | undefined {
  const align = el.getAttribute('data-align');
  return EMBED_ALIGNS.includes(align as EmbedAlign) ? (align as EmbedAlign) : undefined;
}

/** Out as its page's link on a line of its own; such a line reads back as the embed. */
export const EMBED: ElementTransformer = {
  dependencies: [EmbedNode],
  export: (node) => ($isEmbedNode(node) ? node.getURL() : null),
  // No trailing space: typing a link then a space keeps it a link.
  regExp: /^(https?:\/\/\S+)$/,
  replace: (parent, children, match) => {
    const found = matchEmbed($embedProviders(), match[1] ?? '');
    if (!found) {
      // Lexical empties the line before asking; a link no provider reads stays.
      const text = children[0];
      if ($isTextNode(text)) text.setTextContent(match[0]);
      return false;
    }
    parent.replace($createEmbedNode(found.provider.name, found.id));
  },
  type: 'element',
};

// -- In the page --------------------------------------------------------------

/** The scheme the editor shows in, which a frame that has one (X) follows. */
function themeOf(el: Element): 'light' | 'dark' {
  const view = el.ownerDocument.defaultView;
  const scheme = view?.getComputedStyle(el).colorScheme ?? '';
  if (/\bdark\b/.test(scheme) && !/\blight\b/.test(scheme)) return 'dark';
  if (/\blight\b/.test(scheme) && !/\bdark\b/.test(scheme)) return 'light';
  return view?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Give an embed's frame its address, now it is in the page; with
 * `consent`, a button to load it instead, until it is pressed.
 */
function loadFrame(ctx: Ctx, box: HTMLElement, consented = false): void {
  const iframe = box.querySelector('iframe');
  const provider = ctx.options.providers.find((p) => p.name === box.getAttribute('data-tei-embed'));
  const id = provider && embedId(provider, box.getAttribute('data-id'));
  if (!iframe || !provider || !id || iframe.hasAttribute('src')) return;
  const src = provider.src(id, { theme: themeOf(box) });
  if (ctx.options.consent && !consented) {
    if (box.querySelector('[data-tei-embed-load]')) return;
    const doc = box.ownerDocument;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'tei-embed-load';
    button.setAttribute('data-tei-embed-load', '');
    const title = doc.createElement('span');
    title.className = 'tei-embed-load-title';
    title.textContent = ctx.editor.t('embed.load', { title: provider.title });
    const host = doc.createElement('span');
    host.className = 'tei-embed-load-host';
    host.textContent = ctx.editor.t('embed.load.from', { host: new URL(src).hostname });
    button.append(title, host);
    iframe.before(button);
    iframe.hidden = true;
    return;
  }
  box.querySelector('[data-tei-embed-load]')?.remove();
  iframe.hidden = false;
  iframe.setAttribute('src', src);
}

/** What an embed with no provider installed says. */
function paintUnknown(ctx: Ctx, box: HTMLElement): void {
  const frame = box.querySelector('.tei-embed-frame');
  if (!frame || frame.childElementCount > 0) return;
  const note = box.ownerDocument.createElement('span');
  note.className = 'tei-embed-missing';
  note.textContent = ctx.editor.t('embed.unknown');
  frame.append(note);
}

/** Frames that post their height (X) get it. */
function registerResize(ctx: Ctx): () => void {
  const onMessage = (event: MessageEvent) => {
    const root = ctx.lexical.getRootElement();
    if (!root || !event.source) return;
    for (const iframe of root.querySelectorAll<HTMLIFrameElement>('[data-tei-embed] iframe')) {
      if (iframe.contentWindow !== event.source) continue;
      const box = iframe.closest('[data-tei-embed]');
      const provider = ctx.options.providers.find(
        (p) => p.name === box?.getAttribute('data-tei-embed'),
      );
      const height = provider?.resize?.(event);
      if (height) iframe.parentElement?.style.setProperty('--tei-embed-height', `${height}px`);
      return;
    }
  };
  return ctx.lexical.registerRootListener((root) => {
    const view = root?.ownerDocument.defaultView;
    if (!view) return;
    view.addEventListener('message', onMessage);
    return () => view.removeEventListener('message', onMessage);
  });
}

/** Paste a link on its own: offer to embed it, or embed it, as `autoEmbed` says. */
function registerAutoEmbed(ctx: Ctx): () => void {
  const { lexical, storage } = ctx;
  const klasses: Klass<LinkNode>[] = [LinkNode, AutoLinkNode].filter((klass) =>
    lexical.hasNodes([klass]),
  );
  // The update that made the offer, which must not take it back.
  let fresh = false;
  const onLinks = (
    mutations: Map<NodeKey, string>,
    { updateTags }: { updateTags: Set<string> },
  ) => {
    const mode = ctx.options.autoEmbed;
    if (mode === 'never' || !updateTags.has(PASTE_TAG)) return;
    for (const [key, kind] of mutations) {
      if (kind !== 'created') continue;
      const found = lexical.read(() => {
        const link = $getNodeByKey(key);
        return $isLinkNode(link) && isBareLink(link)
          ? matchEmbed(ctx.options.providers, link.getURL())
          : null;
      });
      if (!found) continue;
      if (mode === 'always') {
        lexical.update(() => {
          const link = $getNodeByKey(key);
          if ($isLinkNode(link)) $embedLinkNode(link, found.provider, found.id);
        });
      } else {
        storage.suggestion.value = { key, ...found };
        fresh = true;
      }
      return;
    }
  };
  // The offered link says so (`data-tei-offer`), so other UI on it (the
  // link's own toolbar) makes way for the offer's.
  let marked: HTMLElement | null = null;
  const mark = (offer: EmbedSuggestion | null) => {
    marked?.removeAttribute('data-tei-offer');
    marked = offer ? lexical.getElementByKey(offer.key) : null;
    marked?.setAttribute('data-tei-offer', '');
  };
  return mergeRegister(
    storage.suggestion.subscribe(mark),
    () => mark(null),
    ...klasses.map((klass) => lexical.registerMutationListener(klass, onLinks)),
    // The offer stands until the document changes (typing on declines it).
    lexical.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      const offer = storage.suggestion.peek();
      if (!offer) return;
      if (fresh) {
        fresh = false;
        return;
      }
      if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
        storage.suggestion.value = null;
        return;
      }
      const standing = editorState.read(() => {
        const link = $getNodeByKey(offer.key);
        if (!$isLinkNode(link)) return false;
        const found = matchEmbed(ctx.options.providers, link.getURL());
        return found?.id === offer.id;
      });
      if (!standing) storage.suggestion.value = null;
    }),
  );
}

// -- Extension ----------------------------------------------------------------

/** The extension itself, for its items to read its options. */
let self: TeiExtension<string, EmbedOptions, EmbedStorage> | undefined;

const embedItem = (item: Omit<TeiItem, 'in'>): TeiItem => ({ in: ['embedMenu'], ...item });

const ALIGN_ICONS: Record<EmbedAlign, string> = {
  start: 'imageStart',
  center: 'imageCenter',
  end: 'imageEnd',
};

/** A slash item for a built-in provider, shown while it is installed. */
const providerItem = (provider: EmbedProvider, order: number): TeiItem => ({
  id: `embed.${provider.name}`,
  label: `embed.${provider.name}`,
  description: 'embed.insert.provider',
  icon: provider.icon ?? 'embed',
  in: ['slash', 'insert'],
  group: 'embed',
  order,
  keywords: [
    'embed',
    provider.name,
    provider.label.toLowerCase(),
    ...provider.title.toLowerCase().split(' '),
  ],
  command: 'openEmbedInsert',
  args: [provider.name],
  visible: (editor) =>
    Boolean(
      self && getExtensionOptions(editor, self)?.providers.some((p) => p.name === provider.name),
    ),
});

/**
 * Content from other sites in the document: videos (YouTube, Vimeo, Loom),
 * posts on X, Figma files, and any provider you add. Insert from the
 * toolbar or the slash menu, or paste a link on its own (the editor offers
 * to embed it). Frames are lazy and sandboxed, take no clicks while editing
 * until selected, and with `consent` load nothing until the reader asks.
 *
 * A strict CSP must allow the providers' frames: `frame-src
 * https://www.youtube-nocookie.com https://player.vimeo.com
 * https://platform.twitter.com https://www.figma.com https://www.loom.com`.
 *
 * In React, `<Editor>` adds the form to paste a link, the offer to embed a
 * pasted one, and the toolbar over a selected embed.
 */
export const Embed = defineTeiExtension({
  name: EMBED_EXTENSION,
  config: {
    providers: EMBED_PROVIDERS,
    autoEmbed: 'ask',
    consent: false,
  } as EmbedOptions,
  nodes: [EmbedNode],
  dependencies: [
    RichText,
    configExtension(DOMImportExtension, {
      preprocess: [keepEmbedFrames],
      rules: [EMBED_RULE, TWEET_RULE],
    }),
  ],
  storage: (): EmbedStorage => ({
    insert: uiRequest(),
    insertProvider: signal(null),
    suggestion: signal(null),
  }),
  markdown: { embed: EMBED },
  register: (ctx) => {
    const { lexical } = ctx;
    const paint = (box: HTMLElement | null) => {
      if (!box) return;
      if (box.hasAttribute('data-unknown')) paintUnknown(ctx as Ctx, box);
      else loadFrame(ctx as Ctx, box);
    };
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.('[data-tei-embed-load]');
      const box = button?.closest<HTMLElement>('[data-tei-embed]');
      if (box) loadFrame(ctx as Ctx, box, true);
    };
    return mergeRegister(
      registerHostSelection(lexical, $isEmbedNode),
      registerSelectedAttribute(lexical, $isEmbedNode),
      lexical.registerNodeTransform(EmbedNode, $liftBlock),
      lexical.registerMutationListener(
        EmbedNode,
        (mutations) => {
          for (const [key, kind] of mutations) {
            if (kind !== 'destroyed') paint(lexical.getElementByKey(key));
          }
        },
        { skipInitialization: false },
      ),
      lexical.registerRootListener((root) => {
        root?.addEventListener('click', onClick);
        return () => root?.removeEventListener('click', onClick);
      }),
      registerResize(ctx as Ctx),
      registerAutoEmbed(ctx as Ctx),
    );
  },
  commands: {
    insertEmbed: {
      run: ({ options }, url: string, align?: EmbedAlign) => {
        const found = typeof url === 'string' ? matchEmbed(options.providers, url) : null;
        if (!found || !$canInsert()) return false;
        $caretAfter($insertEmbedNode($createEmbedNode(found.provider.name, found.id, align)));
      },
      can: ({ options }, url?: string) =>
        $canInsert() &&
        (url === undefined ||
          (typeof url === 'string' && matchEmbed(options.providers, url) !== null)),
    },
    openEmbedInsert: {
      run: ({ storage }, provider?: string) => {
        if (!$canInsert()) return false;
        storage.insertProvider.value = typeof provider === 'string' ? provider : null;
        return requestUi(storage.insert);
      },
      can: ({ storage }) => hasUi(storage.insert) && $canInsert(),
    },
    embedLink: {
      run: ({ options, storage }, key?: NodeKey) => {
        const linkKey = key ?? storage.suggestion.peek()?.key;
        const link = linkKey === undefined ? null : $getNodeByKey(linkKey);
        if (!$isLinkNode(link)) return false;
        const found = matchEmbed(options.providers, link.getURL());
        if (!found) return false;
        storage.suggestion.value = null;
        $embedLinkNode(link, found.provider, found.id);
      },
      can: ({ options, storage }, key?: NodeKey) => {
        const linkKey = key ?? storage.suggestion.peek()?.key;
        const link = linkKey === undefined ? null : $getNodeByKey(linkKey);
        return $isLinkNode(link) && matchEmbed(options.providers, link.getURL()) !== null;
      },
    },
    setEmbedAlign: {
      run: (_ctx, align: EmbedAlign, key?: NodeKey) => {
        const node = $getEmbed(key);
        if (!node || !EMBED_ALIGNS.includes(align)) return false;
        node.setAlign(align);
      },
      can: (_ctx, _align?: EmbedAlign, key?: NodeKey) => $getEmbed(key) !== null,
    },
    removeEmbed: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getEmbed(key);
        if (!node) return false;
        $removeBlockHost(node);
      },
      can: $hasEmbed,
    },
  },
  active: {
    embed: $hasEmbed,
    embedAlign: (_ctx, align: EmbedAlign) => $getEmbed()?.getAlign() === align,
  },
  icons: {
    embed: embedIcon,
    video,
    externalLink,
    copy,
    check,
    trash,
    imageStart,
    imageCenter,
    imageEnd,
  },
  messages: {
    'embed.insert': 'Embed',
    'embed.insert.description': 'A video, a post or a design, from its link',
    'embed.insert.provider': 'Embed from a link',
    'embed.youtube': 'YouTube video',
    'embed.vimeo': 'Vimeo video',
    'embed.x': 'Post on X',
    'embed.figma': 'Figma file',
    'embed.loom': 'Loom video',
    'embed.url.placeholder': 'Paste a link to embed',
    'embed.url.placeholder.provider': 'Paste a link to the {title}',
    'embed.url.invalid': 'This link cannot be embedded',
    'embed.url.supported': 'From {providers}',
    'embed.submit': 'Embed',
    'embed.menu': 'Embed',
    'embed.align.start': 'Align left',
    'embed.align.center': 'Align centre',
    'embed.align.end': 'Align right',
    'embed.open': 'Open original',
    'embed.copy': 'Copy link',
    'embed.copied': 'Link copied',
    'embed.remove': 'Delete embed',
    'embed.load': 'Load {title}',
    'embed.load.from': 'Content from {host}',
    'embed.unknown': 'Embedded content that cannot be shown here',
    'embed.suggest': 'Embed {title}',
    'embed.suggest.dismiss': 'Keep the link',
    'embed.suggest.label': 'Embed this link?',
  },
  items: [
    {
      id: 'insertEmbed',
      label: 'embed.insert',
      description: 'embed.insert.description',
      icon: 'embed',
      in: ['toolbar', 'slash', 'insert'],
      group: 'insert',
      order: 30,
      keywords: [
        'embed',
        'iframe',
        'video',
        'youtube',
        'vimeo',
        'x',
        'twitter',
        'tweet',
        'figma',
        'loom',
      ],
      command: 'openEmbedInsert',
    },
    ...EMBED_PROVIDERS.map(providerItem),
    ...EMBED_ALIGNS.map((align, order) =>
      embedItem({
        id: `embedAlign.${align}`,
        label: `embed.align.${align}`,
        icon: ALIGN_ICONS[align],
        group: 'align',
        order,
        command: 'setEmbedAlign',
        args: [align],
        active: 'embedAlign',
        activeArgs: [align],
      }),
    ),
    embedItem({
      id: 'embedOpen',
      label: 'embed.open',
      icon: 'externalLink',
      group: 'link',
      order: 0,
      control: 'embedOpen',
    }),
    embedItem({
      id: 'embedCopy',
      label: 'embed.copy',
      icon: 'copy',
      group: 'link',
      order: 1,
      control: 'embedCopy',
    }),
    embedItem({
      id: 'removeEmbed',
      variant: 'danger',
      label: 'embed.remove',
      icon: 'trash',
      group: 'remove',
      order: 0,
      command: 'removeEmbed',
    }),
  ],
});

self = Embed;
