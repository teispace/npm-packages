import {
  $isAutoLinkNode,
  $isLinkNode,
  $toggleLink,
  AutoLinkExtension,
  AutoLinkNode,
  autoLinkEmailMatcher,
  autoLinkUrlMatcher,
  type LinkAttributes,
  LinkExtension,
  LinkNode,
} from '@lexical/link';
import { LINK, type TextMatchTransformer } from '@lexical/markdown';
import { $findMatchingParent } from '@lexical/utils';
import {
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  configExtension,
  type LexicalNode,
  mergeRegister,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import {
  externalLink as externalLinkIcon,
  link as linkIcon,
  pencil as pencilIcon,
  unlink as unlinkIcon,
} from '../../icons/index.js';
import { isSafeUrl, LINK_PROTOCOLS, withDefaultScheme } from '../../utils/url.js';
import { RichText } from '../rich-text/index.js';

export interface LinkInput {
  url: string;
  target?: string | null;
  rel?: string | null;
  title?: string | null;
  /** Text to insert when the selection is empty; defaults to the URL. */
  text?: string;
}

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Link the selection (or insert a link at the caret). Refuses unsafe URLs. */
    setLink: [link: string | LinkInput];
    /** Remove the link at the selection, keeping its text. */
    unsetLink: [];
    /** Ask the link UI (a `<LinkPopover>`) to open. `false` when none is mounted. */
    openLinkEditor: [];
  }
  interface TeiActiveStates {
    link: [];
  }
}

export interface LinkOptions {
  /** Schemes a link may use. Default http, https, mailto, tel. */
  protocols: readonly string[];
  /** An extra check after the scheme allowlist: return false to refuse a URL. */
  validate: ((url: string) => boolean) | null;
  /**
   * When a click follows a link: `'modifier'` (⌘/Ctrl-click while editing, any
   * click when read-only — the default), `'readonly'`, `'always'`, or `false`.
   */
  openOnClick: 'modifier' | 'readonly' | 'always' | false;
  /** Called before a link opens; return `false` to handle it yourself. */
  onClick: ((url: string, event: MouseEvent) => boolean | undefined) | null;
  /** `rel` for new links. Default `noopener noreferrer`. */
  rel: string | null;
  /** `target` for new links. Default none (same tab). */
  target: string | null;
}

export interface LinkStorage {
  /** `openLinkEditor`'s requests, to the link editor (`<LinkPopover>`). */
  edit: UiRequest;
}

export interface LinkAtSelection {
  url: string;
  target: string | null;
  rel: string | null;
  title: string | null;
  text: string;
  key: string;
}

/** The link the selection is in, if it is in exactly one. */
export function $getLinkAtSelection(): LinkAtSelection | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const linkOf = (node: LexicalNode) =>
    $findMatchingParent(node, (n) => $isLinkNode(n)) as LinkNode | null;
  const anchor = linkOf(selection.anchor.getNode());
  const focus = linkOf(selection.focus.getNode());
  if (!anchor || anchor !== focus || ($isAutoLinkNode(anchor) && anchor.getIsUnlinked()))
    return null;
  return {
    url: anchor.getURL(),
    target: anchor.getTarget(),
    rel: anchor.getRel(),
    title: anchor.getTitle(),
    text: anchor.getTextContent(),
    key: anchor.getKey(),
  };
}

/** Markdown's `![alt](src)` is an image, never a link: not with `!` before the `[`. */
const notAfterBang = (re: RegExp) => new RegExp(`(?<!!)${re.source}`, re.flags);
export const MARKDOWN_LINK: TextMatchTransformer = {
  ...LINK,
  regExp: notAfterBang(LINK.regExp),
  importRegExp: LINK.importRegExp && notAfterBang(LINK.importRegExp),
};

function isAllowed(options: LinkOptions, url: string): boolean {
  return isSafeUrl(url, { protocols: options.protocols }) && (options.validate?.(url) ?? true);
}

/**
 * Links: a safe-URL allowlist enforced on every link however it arrives
 * (typed, pasted, loaded from JSON, from a collaborator), ⌘K to edit,
 * ⌘/Ctrl-click to open, and markdown `[text](url)`.
 */
export const Link = defineTeiExtension({
  name: '@teispace/teieditor/link',
  config: {
    protocols: LINK_PROTOCOLS,
    validate: null,
    openOnClick: 'modifier',
    onClick: null,
    rel: 'noopener noreferrer',
    target: null,
  } as LinkOptions,
  dependencies: [RichText, LinkExtension],
  storage: (): LinkStorage => ({ edit: uiRequest() }),
  commands: {
    setLink: {
      run: ({ options }, input: string | LinkInput) => {
        const value = typeof input === 'string' ? { url: input } : input;
        const url = withDefaultScheme(value.url ?? '');
        const selection = $getSelection();
        if (!url || !isAllowed(options, url) || !$isRangeSelection(selection)) return false;
        const attributes: LinkAttributes = {
          rel: value.rel === undefined ? options.rel : value.rel,
          target: value.target === undefined ? options.target : value.target,
          title: value.title ?? null,
        };
        const current = $getLinkAtSelection();
        if (selection.isCollapsed()) {
          if (current) {
            const node = $findMatchingParent(selection.anchor.getNode(), $isLinkNode) as LinkNode;
            node
              .setURL(url)
              .setRel(attributes.rel ?? null)
              .setTarget(attributes.target ?? null);
            node.setTitle(attributes.title ?? null);
            return;
          }
          const text = $createTextNode(value.text || value.url);
          selection.insertNodes([text]);
          text.select(0, text.getTextContentSize());
        }
        $toggleLink({ url, ...attributes });
      },
      can: () => $isRangeSelection($getSelection()),
    },
    unsetLink: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        if (selection.isCollapsed()) {
          const node = $findMatchingParent(
            selection.anchor.getNode(),
            $isLinkNode,
          ) as LinkNode | null;
          if (!node) return false;
          for (const child of node.getChildren()) node.insertBefore(child);
          node.remove();
          return;
        }
        $toggleLink(null);
      },
      can: () => $getLinkAtSelection() !== null,
    },
    openLinkEditor: {
      run: ({ storage }) => requestUi(storage.edit),
      can: ({ storage }) => hasUi(storage.edit) && $isRangeSelection($getSelection()),
    },
  },
  active: { link: () => $getLinkAtSelection() !== null },
  keymap: {
    link: { key: 'Mod-k', command: 'openLinkEditor', description: 'Link' },
  },
  markdown: { link: MARKDOWN_LINK },
  icons: { link: linkIcon, unlink: unlinkIcon, externalLink: externalLinkIcon, pencil: pencilIcon },
  messages: {
    'link.add': 'Link',
    'link.remove': 'Remove link',
    'link.edit': 'Edit link',
    'link.open': 'Open link',
    'link.placeholder': 'Paste or type a link',
    'link.apply': 'Apply',
    'link.invalid': 'This link is not allowed',
  },
  items: [
    {
      id: 'link',
      label: 'link.add',
      icon: 'link',
      in: ['toolbar', 'bubble'],
      group: 'insert',
      order: 0,
      keywords: ['url', 'href', 'hyperlink'],
      shortcut: 'link',
      command: 'openLinkEditor',
      active: 'link',
    },
  ],
  register: ({ lexical, options, signal: aborted }) => {
    // Unwrap any link whose URL is refused, wherever the node came from.
    const $guard = (node: LinkNode) => {
      if (isAllowed(options, node.getURL())) return;
      for (const child of node.getChildren()) node.insertBefore(child);
      node.remove();
    };
    const onClick = (event: MouseEvent) => {
      const mode = options.openOnClick;
      if (mode === false || event.button !== 0) return;
      const editable = lexical.isEditable();
      const modifier = event.metaKey || event.ctrlKey;
      if (editable && !(mode === 'always' || (mode === 'modifier' && modifier))) {
        return;
      }
      let url: string | null = null;
      let target: string | null = null;
      lexical.read(() => {
        const node = $getNearestNodeFromDOMNode(event.target as Node);
        const found = node && ($findMatchingParent(node, $isLinkNode) as LinkNode | null);
        if (found && !($isAutoLinkNode(found) && found.getIsUnlinked())) {
          url = found.getURL();
          target = found.getTarget();
        }
      });
      if (!url || !isAllowed(options, url)) return;
      if (options.onClick?.(url, event) === false) return;
      event.preventDefault();
      const newTab = modifier || target === '_blank';
      window.open(url, newTab ? '_blank' : '_self', 'noopener,noreferrer');
    };
    return mergeRegister(
      lexical.registerNodeTransform(LinkNode, $guard),
      // Auto-links are their own node type, present only with AutoLink installed.
      lexical.hasNodes([AutoLinkNode])
        ? lexical.registerNodeTransform(AutoLinkNode, $guard)
        : () => {},
      lexical.registerRootListener((root, previous) => {
        previous?.removeEventListener('click', onClick);
        root?.addEventListener('click', onClick, { signal: aborted });
      }),
    );
  },
});

/**
 * Turn typed and pasted URLs and email addresses into links as you write.
 * The same URL allowlist applies: an auto-link to a refused URL is unwrapped.
 */
export const AutoLink = defineTeiExtension({
  name: '@teispace/teieditor/auto-link',
  dependencies: [
    Link,
    configExtension(AutoLinkExtension, { matchers: [autoLinkUrlMatcher, autoLinkEmailMatcher] }),
  ],
});
