import { configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import type { TextMatchTransformer } from '@lexical/markdown';
import {
  $create,
  $createTextNode,
  $getDocument,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  mergeRegister,
  type SerializedTextNode,
  TextNode,
} from 'lexical';
import { defineTeiExtension, getPeerOptions } from '../../core/define.js';
import { $replaceTypeahead, type TypeaheadMatch } from '../../core/typeahead.js';
import { mention as mentionIcon } from '../../icons/index.js';
import { isSafeUrl } from '../../utils/url.js';
import { RichText } from '../rich-text/index.js';
import {
  addTypeaheadSources,
  Typeahead,
  type TypeaheadOption,
  type TypeaheadSource,
} from '../typeahead/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Put a mention at the caret. */
    insertMention: [mention: MentionData];
    /** Type a trigger (`@` by default) at the caret, which opens its search. */
    startMention: [trigger?: string];
  }
}

/** Someone (or something) mentioned: what is saved with the document. */
export interface MentionData {
  /** Your id for them: saved, and given back to `onClick`. */
  id: string;
  /** The name shown after the trigger. Plain text. */
  label: string;
  /** The character it was made with. Default `@`. */
  trigger?: string;
  /** Where it leads, if anywhere; refused unless it is a safe link. */
  href?: string | null;
}

/** A search result: a mention, with what the list shows for it. */
export interface MentionItem extends MentionData {
  /** A picture for the list (a safe image URL). */
  avatar?: string;
  /** A second line in the list: a role, an email. */
  description?: string;
}

export type MentionSearch = (
  query: string,
  context: { signal: AbortSignal; trigger: string },
) => readonly MentionItem[] | Promise<readonly MentionItem[]>;

/** Another trigger with its own search: `#` for channels. */
export interface MentionTrigger {
  trigger: string;
  search: MentionSearch;
  /** The list's accessible name: a message id or the text. Default "Mentions". */
  label?: string;
}

export interface MentionOptions {
  /** Find people for `@`. Without it (and without `triggers`), `@` does nothing. */
  search: MentionSearch | null;
  /** More triggers, each with its own search. */
  triggers: readonly MentionTrigger[];
  /** Wait this long after the last key before searching, in ms. Default 150. */
  debounce: number;
  /** Called when a mention in the document is clicked. */
  onClick: ((mention: MentionData, event: MouseEvent) => void) | null;
}

export interface SerializedMentionNode extends SerializedTextNode {
  mentionId: string;
  label: string;
  trigger: string;
  href?: string;
}

export const MENTION_EXTENSION = '@teispace/teieditor/mention';

const safeHref = (href: string | null | undefined): string | null =>
  href && isSafeUrl(href) ? href.trim() : null;

/**
 * A mention: one piece of text, `@Ada`, that the caret steps over and
 * Backspace takes out whole. Saved as `<span data-tei-mention="id"
 * data-label="Ada">@Ada</span>` (an `<a>` when it has a safe `href`), and
 * in markdown as `@[Ada](mention:id)`.
 */
export class MentionNode extends TextNode {
  __mentionId = '';
  __label = '';
  __trigger = '@';
  __href: string | null = null;

  $config() {
    return this.config('mention', { extends: TextNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__mentionId = prev.__mentionId;
    this.__label = prev.__label;
    this.__trigger = prev.__trigger;
    this.__href = prev.__href;
  }

  getMention(): Required<MentionData> {
    const self = this.getLatest();
    return {
      id: self.__mentionId,
      label: self.__label,
      trigger: self.__trigger,
      href: self.__href,
    };
  }

  setMention(mention: MentionData): this {
    const self = this.getWritable();
    self.__mentionId = String(mention.id);
    self.__label = String(mention.label);
    self.__trigger = mention.trigger || '@';
    self.__href = safeHref(mention.href);
    return self.setTextContent(`${self.__trigger}${self.__label}`).setMode('token');
  }

  // -- JSON ------------------------------------------------------------------

  updateFromJSON(json: LexicalUpdateJSON<SerializedMentionNode>): this {
    const self = super.updateFromJSON(json);
    const { mentionId, label, trigger, href } = json as Partial<SerializedMentionNode>;
    return self.setMention({
      id: String(mentionId ?? ''),
      label: String(label ?? ''),
      trigger,
      href,
    });
  }

  exportJSON(): SerializedMentionNode {
    const { id, label, trigger, href } = this.getMention();
    return {
      ...super.exportJSON(),
      mentionId: id,
      label,
      trigger,
      ...(href ? { href } : {}),
    };
  }

  // -- DOM -------------------------------------------------------------------

  createDOM(config: EditorConfig, editor?: LexicalEditor): HTMLElement {
    const dom = super.createDOM(config, editor);
    dom.classList.add(
      ...((config.theme.mention as string | undefined) ?? 'tei-mention').split(' '),
    );
    dom.setAttribute('data-tei-mention', this.__mentionId);
    dom.setAttribute('spellcheck', 'false');
    return dom;
  }

  updateDOM(prev: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (super.updateDOM(prev, dom, config)) return true;
    if (prev.__mentionId !== this.__mentionId)
      dom.setAttribute('data-tei-mention', this.__mentionId);
    return false;
  }

  exportDOM(): DOMExportOutput {
    const { id, label, trigger, href } = this.getMention();
    const doc = $getDocument();
    const safe = safeHref(href);
    const element = doc.createElement(safe ? 'a' : 'span');
    if (safe) element.setAttribute('href', safe);
    element.setAttribute('data-tei-mention', id);
    element.setAttribute('data-label', label);
    if (trigger !== '@') element.setAttribute('data-trigger', trigger);
    element.textContent = `${trigger}${label}`;
    return { element };
  }

  // -- Behaviour -------------------------------------------------------------

  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }
}

export function $createMentionNode(mention: MentionData): MentionNode {
  return $create(MentionNode).setMention(mention);
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}

// -- HTML ---------------------------------------------------------------------

/** `<span data-tei-mention>` and `<a data-tei-mention>`. */
const MENTION_RULE = defineImportRule({
  name: MENTION_EXTENSION,
  match: sel.tag('span', 'a'),
  $import: (_ctx, el, $next) => {
    const id = el.getAttribute('data-tei-mention');
    if (id === null) return $next();
    const trigger = el.getAttribute('data-trigger') || '@';
    const text = el.textContent ?? '';
    const label =
      el.getAttribute('data-label') ??
      (text.startsWith(trigger) ? text.slice(trigger.length) : text);
    const href = el.nodeName.toLowerCase() === 'a' ? el.getAttribute('href') : null;
    return [$createMentionNode({ id, label, trigger, href })];
  },
});

// -- Markdown -----------------------------------------------------------------

const escapeLabel = (label: string) => label.replace(/[\\[\]]/g, '\\$&');
const MENTION_SOURCE = /([^\s[\]()\\!])\[((?:\\.|[^\]\\])+)\]\(mention:([^()\s]+)\)/;

/** `@[Ada Lovelace](mention:42)`; `#[general](mention:c1)` for other triggers. */
export const MENTION_MARKDOWN: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [MentionNode],
  importRegExp: MENTION_SOURCE,
  regExp: new RegExp(`${MENTION_SOURCE.source}$`),
  trigger: ')',
  replace: (textNode, match) => {
    let id = match[3] ?? '';
    try {
      id = decodeURIComponent(id);
    } catch {}
    textNode.replace(
      $createMentionNode({
        id,
        label: (match[2] ?? '').replace(/\\(.)/g, '$1'),
        trigger: match[1],
      }),
    );
  },
  export: (node) => {
    if (!$isMentionNode(node)) return null;
    const { id, label, trigger } = node.getMention();
    return `${trigger}[${escapeLabel(label)}](mention:${encodeURIComponent(id)})`;
  },
};

// -- Typeahead ----------------------------------------------------------------

interface MentionOption extends TypeaheadOption {
  item: MentionItem;
}

/** The query: letters, digits, `.`, `_`, `-`, `'`, and single spaces ("Ada Lo"). */
const NAME_CHAR = /^[\p{L}\p{N}\p{M}._'-]$/u;

/** The mention in place of the typed trigger and query, then a space unless one follows. */
function $insertPick(item: MentionItem, match: TypeaheadMatch): void {
  const node = $createMentionNode({
    id: item.id,
    label: item.label,
    trigger: match.trigger,
    href: item.href,
  });
  const selection = $getSelection();
  const anchor = $isRangeSelection(selection) ? selection.anchor : null;
  const after =
    anchor?.key === match.key ? anchor.getNode().getTextContent().slice(anchor.offset) : '';
  $replaceTypeahead(match, /^\s/.test(after) ? [node] : [node, $createTextNode(' ')]);
}

function triggersOf(options: MentionOptions): MentionTrigger[] {
  const all: MentionTrigger[] = options.search ? [{ trigger: '@', search: options.search }] : [];
  return [...all, ...options.triggers];
}

/**
 * Mentions: type `@` and a name, pick from what your `search` finds (it
 * may be async: it is debounced, and stale requests are aborted), and the
 * pick goes in as a {@link MentionNode}. Other triggers, such as `#` for
 * channels, come from `triggers`. Labels from `search` are only ever text.
 */
export const Mention = defineTeiExtension({
  name: MENTION_EXTENSION,
  config: { search: null, triggers: [], debounce: 150, onClick: null } as MentionOptions,
  nodes: [MentionNode],
  dependencies: [
    RichText,
    Typeahead,
    configExtension(DOMImportExtension, { rules: [MENTION_RULE] }),
  ],
  theme: { mention: 'tei-mention' },
  markdown: { mention: MENTION_MARKDOWN },
  commands: {
    insertMention: {
      run: (_ctx, mention: MentionData) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !mention?.id) return false;
        const node = $createMentionNode(mention);
        selection.insertNodes([node, $createTextNode(' ')]);
      },
      can: () => $isRangeSelection($getSelection()),
    },
    startMention: {
      run: ({ options }, trigger?: string) => {
        const selection = $getSelection();
        const chosen = trigger ?? triggersOf(options)[0]?.trigger;
        if (!chosen || !$isRangeSelection(selection)) return false;
        const anchor = selection.anchor;
        const node = anchor.getNode();
        const before = $isTextNode(node) ? node.getTextContent().slice(0, anchor.offset) : '';
        selection.insertText(before === '' || /\s$/.test(before) ? chosen : ` ${chosen}`);
      },
      can: ({ options }) => triggersOf(options).length > 0 && $isRangeSelection($getSelection()),
    },
  },
  icons: { mention: mentionIcon },
  messages: {
    'mention.insert': 'Mention',
    'mention.insert.description': 'Mention a person',
    'mention.label': 'Mentions',
    'mention.empty': 'No one found',
  },
  items: [
    {
      id: 'mention',
      label: 'mention.insert',
      description: 'mention.insert.description',
      icon: 'mention',
      in: ['slash', 'insert'],
      group: 'insert',
      order: 41,
      keywords: ['mention', 'person', 'people', 'user', 'at'],
      command: 'startMention',
      visible: (editor) => {
        const options = getPeerOptions<MentionOptions>(editor.lexical, MENTION_EXTENSION);
        return options ? triggersOf(options).length > 0 : false;
      },
    },
  ],
  register: ({ lexical, editor, options, signal: aborted }) => {
    const onClick = (event: MouseEvent) => {
      const handler = options.onClick;
      if (!handler || event.button !== 0) return;
      const mention = lexical.read(() => {
        const node = $getNearestNodeFromDOMNode(event.target as Node);
        return $isMentionNode(node) ? node.getMention() : null;
      });
      if (mention) handler(mention, event);
    };
    return mergeRegister(
      lexical.registerRootListener((root, previous) => {
        previous?.removeEventListener('click', onClick);
        root?.addEventListener('click', onClick, { signal: aborted });
      }),
      addTypeaheadSources(
        editor,
        () =>
          triggersOf(options).map(
            (entry): TypeaheadSource<MentionOption> => ({
              id: `mention:${entry.trigger}`,
              trigger: entry.trigger,
              label: entry.label ?? 'mention.label',
              allow: (char) => NAME_CHAR.test(char),
              spaces: true,
              maxLength: 32,
              debounce: options.debounce,
              empty: 'mention.empty',
              search: async (query, { signal }) => {
                const found = await entry.search(query, { signal, trigger: entry.trigger });
                return found
                  .filter((item) => item && typeof item.id === 'string' && item.id !== '')
                  .map((item) => ({
                    id: item.id,
                    label: String(item.label ?? ''),
                    description: item.description,
                    image: item.avatar,
                    item,
                  }));
              },
              select: (option, match) => $insertPick(option.item, match),
            }),
          ) as unknown as TypeaheadSource[],
      ),
    );
  },
});
