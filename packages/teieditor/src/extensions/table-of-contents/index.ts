import {
  configExtension,
  effect,
  type ReadonlySignal,
  type Signal,
  signal,
} from '@lexical/extension';
import {
  DOMImportExtension,
  DOMRenderExtension,
  defineImportRule,
  domOverride,
  sel,
} from '@lexical/html';
import type { ElementTransformer } from '@lexical/markdown';
import { $isHeadingNode, HeadingNode } from '@lexical/rich-text';
import {
  $create,
  $getDocument,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $onUpdate,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { TeiEditor } from '../../core/editor.js';
import {
  $canInsertBlock,
  $caretAfter,
  $insertBlockAtSelection,
  $liftBlock,
  $removeBlockHost,
  registerHostSelection,
  registerSelectedAttribute,
} from '../../core/slot-host.js';
import { chevronDown, toc } from '../../icons/index.js';
import type { HeadingLevel } from '../heading/index.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    scrollToHeading: [target: NodeKey];
    insertTableOfContents: [];
    removeTableOfContents: [key?: NodeKey];
  }
}

/** One heading in the outline. */
export interface TocEntry {
  /** The heading's node key: what `scrollToHeading` takes. */
  key: NodeKey;
  level: HeadingLevel;
  text: string;
  /** Its anchor: a slug of the text, unique in the document (`intro`, `intro-1`). */
  id: string;
}

/** An entry with the entries under it, as the outline nests. */
export interface TocTreeEntry extends TocEntry {
  children: TocTreeEntry[];
}

export interface TableOfContentsOptions {
  /** The heading levels the outline lists. Default all six. */
  levels: readonly HeadingLevel[];
  /** Put each heading's `id` on it in saved HTML, so `#intro` links reach it. Default true. */
  headingIds: boolean;
  /** Text to anchor id; the result is made unique with `-1`, `-2`. */
  slugify: (text: string) => string;
}

export interface TableOfContentsStorage {
  /** The live outline, in document order. */
  readonly outline: ReadonlySignal<readonly TocEntry[]>;
}

/** The extension's name, which nodes use to find it. */
export const TABLE_OF_CONTENTS_EXTENSION = '@teispace/teieditor/table-of-contents';

/**
 * Lower case, words joined by `-`, punctuation dropped; letters and marks
 * of every script stay (`Überblick` → `überblick`, `مقدمة` stays).
 */
export function slugify(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Ids for texts in order: unique, the second `intro` is `intro-1`. */
export function uniqueIds(texts: readonly string[], slug: (text: string) => string = slugify) {
  const taken = new Set<string>();
  const counts = new Map<string, number>();
  return texts.map((text) => {
    const base = slug(text) || 'section';
    let n = counts.get(base) ?? 0;
    let id = n ? `${base}-${n}` : base;
    while (taken.has(id)) id = `${base}-${++n}`;
    counts.set(base, n + 1);
    taken.add(id);
    return id;
  });
}

/** The flat outline as a tree: each entry holds the deeper ones after it. */
export function outlineTree(entries: readonly TocEntry[]): TocTreeEntry[] {
  const top: TocTreeEntry[] = [];
  const stack: TocTreeEntry[] = [];
  for (const entry of entries) {
    const item: TocTreeEntry = { ...entry, children: [] };
    while (stack.length && (stack.at(-1) as TocTreeEntry).level >= item.level) stack.pop();
    (stack.at(-1)?.children ?? top).push(item);
    stack.push(item);
  }
  return top;
}

type Raw = { key: NodeKey; level: HeadingLevel; text: string };
type Links = { parent: NodeKey | null; prev: NodeKey | null; next: NodeKey | null };

const levelOf = (node: HeadingNode) => Number(node.getTag().slice(1)) as HeadingLevel;

const linksOf = (node: LexicalNode): Links => ({
  parent: node.getParent()?.getKey() ?? null,
  prev: node.getPreviousSibling()?.getKey() ?? null,
  next: node.getNextSibling()?.getKey() ?? null,
});

const sameLinks = (a: Links, b: Links) =>
  a.parent === b.parent && a.prev === b.prev && a.next === b.next;

/** Every listed heading, in document order: one walk of the tree. */
function $walkHeadings(levels: readonly HeadingLevel[]): HeadingNode[] {
  const found: HeadingNode[] = [];
  const stack: LexicalNode[] = [$getRoot()];
  while (stack.length) {
    const node = stack.pop() as LexicalNode;
    if ($isHeadingNode(node)) {
      if (levels.includes(levelOf(node))) found.push(node);
      continue;
    }
    // Children in reverse, so they come off the stack in order; text and
    // inline nodes hold no headings.
    for (
      let child = (node as ElementNode).getLastChild();
      child;
      child = child.getPreviousSibling()
    )
      if ($isElementNode(child) && !child.isInline()) stack.push(child);
  }
  return found;
}

/** The outline of the active editor state, computed from scratch. */
export function $getOutline(options?: Partial<TableOfContentsOptions>): TocEntry[] {
  const levels = options?.levels ?? LEVELS;
  const raw = $walkHeadings(levels).map((node) => ({
    key: node.getKey(),
    level: levelOf(node),
    text: node.getTextContent(),
  }));
  const ids = uniqueIds(
    raw.map((r) => r.text),
    options?.slugify,
  );
  return raw.map((r, i) => ({ ...r, id: ids[i] as string }));
}

const LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

/** The extension's storage and options on an editor, when it is installed. */
function installed(lexical: LexicalEditor) {
  return TeiEditor.of(lexical)?.extension(TableOfContents)?.output;
}

/** A heading's anchor id in the active state, from the live outline when it is current. */
function $headingId(lexical: LexicalEditor, node: HeadingNode): string | null {
  const output = installed(lexical);
  if (!output) return null;
  const key = node.getKey();
  const live = output.storage.outline.peek().find((entry) => entry.key === key);
  if (live && live.text === node.getTextContent()) return live.id;
  const options = {
    levels: output.options.levels.peek(),
    slugify: output.options.slugify.peek(),
  };
  return $getOutline(options).find((entry) => entry.key === key)?.id ?? null;
}

// -- The in-document table of contents ----------------------------------------

/** Nested lists of links, one per heading, into `parent`. */
function appendOutline(
  doc: Document,
  parent: Element,
  entries: readonly TocTreeEntry[],
  live: boolean,
): void {
  if (entries.length === 0) return;
  const list = doc.createElement('ol');
  for (const entry of entries) {
    const item = doc.createElement('li');
    const link = doc.createElement('a');
    link.setAttribute('href', `#${entry.id}`);
    if (live) link.setAttribute('data-key', entry.key);
    link.textContent = entry.text;
    item.append(link);
    appendOutline(doc, item, entry.children, live);
    list.append(item);
  }
  parent.append(list);
}

/** Fill a table of contents' element with the outline. */
function paint(nav: Element, entries: readonly TocEntry[], label: string, empty: string): void {
  const doc = nav.ownerDocument;
  nav.setAttribute('aria-label', label);
  nav.setAttribute('data-placeholder', empty);
  nav.replaceChildren();
  appendOutline(doc, nav, outlineTree(entries), true);
}

/**
 * A table of contents in the document: a list of links to its headings,
 * kept up to date as they change. Saved as `<nav data-tei-toc>` with nested
 * `<ol>`s of `#id` links (the headings get those ids); markdown `[TOC]`.
 */
export class TocNode extends DecoratorNode<null> {
  $config() {
    return this.config('table-of-contents', { extends: DecoratorNode });
  }

  createDOM(_config: EditorConfig, lexical: LexicalEditor): HTMLElement {
    const nav = $getDocument().createElement('nav');
    nav.className = 'tei-toc-block';
    nav.setAttribute('contenteditable', 'false');
    nav.setAttribute('data-tei-toc', '');
    const editor = TeiEditor.of(lexical);
    paint(
      nav,
      installed(lexical)?.storage.outline.peek() ?? [],
      editor?.t('toc.label') ?? 'Table of contents',
      editor?.t('toc.empty') ?? '',
    );
    return nav;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(lexical: LexicalEditor): DOMExportOutput {
    const doc = $getDocument();
    const nav = doc.createElement('nav');
    nav.setAttribute('data-tei-toc', '');
    nav.setAttribute('aria-label', TeiEditor.of(lexical)?.t('toc.label') ?? 'Table of contents');
    const output = installed(lexical);
    const outline = $getOutline(
      output
        ? { levels: output.options.levels.peek(), slugify: output.options.slugify.peek() }
        : undefined,
    );
    appendOutline(doc, nav, outlineTree(outline), false);
    return { element: nav };
  }

  decorate(): null {
    return null;
  }

  isInline(): false {
    return false;
  }

  /** Its links are the headings' words again: not counted twice. */
  getTextContent(): string {
    return '';
  }
}

export function $createTocNode(): TocNode {
  return $create(TocNode);
}

export function $isTocNode(node: LexicalNode | null | undefined): node is TocNode {
  return node instanceof TocNode;
}

/** `<nav data-tei-toc>`: the links are made again from the headings. */
const TOC_RULE = defineImportRule({
  name: TABLE_OF_CONTENTS_EXTENSION,
  match: sel.tag('nav'),
  $import: (_ctx, el, $next) => (el.hasAttribute('data-tei-toc') ? [$createTocNode()] : $next()),
});

/** `[TOC]` (or `[[toc]]`, `[[_TOC_]]`) on a line of its own. */
export const TABLE_OF_CONTENTS: ElementTransformer = {
  dependencies: [TocNode],
  export: (node) => ($isTocNode(node) ? '[TOC]' : null),
  regExp: /^\[\[?_?toc_?\]?\]\s*$/i,
  replace: (parent, _children, _match, isImport) => {
    const node = $createTocNode();
    if (isImport || parent.getNextSibling() !== null) parent.replace(node);
    else parent.insertBefore(node);
    node.selectNext();
  },
  type: 'element',
};

function $getTocNode(key?: NodeKey): TocNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isTocNode(node) ? node : null;
  }
  const selection = $getSelection();
  const nodes = $isNodeSelection(selection) ? selection.getNodes() : [];
  return nodes.length === 1 && $isTocNode(nodes[0]) ? nodes[0] : null;
}

/** The heading a target names: its key, or its anchor id. */
function $findHeading(storage: TableOfContentsStorage, target: NodeKey): HeadingNode | null {
  const node = $getNodeByKey(target);
  if ($isHeadingNode(node)) return node;
  const entry = storage.outline.peek().find((e) => e.id === target);
  const byId = entry ? $getNodeByKey(entry.key) : null;
  return $isHeadingNode(byId) ? byId : null;
}

const reducedMotion = (win: Window | null) =>
  win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

/**
 * The document's outline, headless first: `storage.outline` is a signal of
 * its headings (`{key, level, text, id}`), kept current from the headings
 * that change, not by reading the document on every keystroke. Saved HTML
 * gives each heading its `id` for `#anchor` links. `scrollToHeading` brings
 * one into view with the caret in it; `/toc` puts a live table of contents
 * in the document. In React, `<TableOfContents>` is the side panel.
 */
export const TableOfContents = defineTeiExtension({
  name: TABLE_OF_CONTENTS_EXTENSION,
  config: { levels: LEVELS, headingIds: true, slugify } as TableOfContentsOptions,
  nodes: [TocNode],
  dependencies: [
    RichText,
    configExtension(DOMImportExtension, { rules: [TOC_RULE] }),
    configExtension(DOMRenderExtension, {
      overrides: [
        domOverride([HeadingNode], {
          $exportDOM: (node, $next, lexical) => {
            const output = $next();
            const element = output.element as Element | null;
            if (element?.nodeType === 1 && installed(lexical)?.options.headingIds.peek()) {
              const id = $headingId(lexical, node);
              if (id) element.setAttribute('id', id);
            }
            return output;
          },
        }),
      ],
    }),
  ],
  storage: (): TableOfContentsStorage => ({ outline: signal<readonly TocEntry[]>([]) }),
  register: ({ editor, lexical, storage }) => {
    const outline = storage.outline as Signal<readonly TocEntry[]>;
    const options = editor.extension(TableOfContents)?.output.options;
    if (!options) return;
    let raw: Raw[] = [];
    const links = new Map<NodeKey, Links>();
    const byKey = new Map<NodeKey, Raw>();

    const publish = () => {
      const ids = uniqueIds(
        raw.map((r) => r.text),
        options.slugify.peek(),
      );
      const next = raw.map((r, i) => ({ ...r, id: ids[i] as string }));
      const prev = outline.peek();
      const same =
        prev.length === next.length &&
        prev.every((e, i) => {
          const n = next[i] as TocEntry;
          return e.key === n.key && e.level === n.level && e.text === n.text && e.id === n.id;
        });
      if (!same) outline.value = next;
    };

    // Where each heading and each block it sits in is: one of them moving
    // can reorder the outline.
    const $rebuild = () => {
      const nodes = $walkHeadings(options.levels.peek());
      raw = [];
      links.clear();
      byKey.clear();
      for (const node of nodes) {
        const entry: Raw = {
          key: node.getKey(),
          level: levelOf(node),
          text: node.getTextContent(),
        };
        raw.push(entry);
        byKey.set(entry.key, entry);
        for (let at: LexicalNode | null = node; at && at.getKey() !== 'root'; at = at.getParent()) {
          if (links.has(at.getKey())) break;
          links.set(at.getKey(), linksOf(at));
        }
      }
    };

    // Only what an update touched is looked at: a heading's text changing
    // costs a lookup; a heading coming, going or moving, one walk.
    const onUpdate = lexical.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        const levels = options.levels.peek();
        editorState.read(() => {
          // A whole new state (setEditorState) marks only the root.
          let rebuild = dirtyLeaves.size === 0 && dirtyElements.size === 1;
          let changed = false;
          for (const key of rebuild ? [] : dirtyElements.keys()) {
            const node = $getNodeByKey(key);
            const tracked = links.get(key);
            const listed = $isHeadingNode(node) && levels.includes(levelOf(node));
            const entry = byKey.get(key);
            if ((tracked && (!node || !sameLinks(tracked, linksOf(node)))) || !entry !== !listed) {
              rebuild = true;
              break;
            }
            const text = entry && (node as HeadingNode).getTextContent();
            if (entry && text !== entry.text) {
              entry.text = text as string;
              changed = true;
            }
          }
          if (rebuild) $rebuild();
          if (rebuild || changed) publish();
        });
      },
    );

    const refresh = () => {
      lexical.getEditorState().read(() => $rebuild(), { editor: lexical });
      publish();
    };
    // The options can change while the editor runs.
    const offOptions = effect(() => {
      options.levels.value;
      options.slugify.value;
      refresh();
    });

    // Each table of contents in the document follows the outline.
    const tocs = new Set<NodeKey>();
    const repaint = (keys: Iterable<NodeKey>) => {
      for (const key of keys) {
        const nav = lexical.getElementByKey(key);
        if (nav) paint(nav, outline.peek(), editor.t('toc.label'), editor.t('toc.empty'));
      }
    };
    const offOutline = outline.subscribe(() => repaint(tocs));

    // A click on one of its links goes to the heading, editable or not;
    // before Lexical's own click, which would select the block instead.
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest?.('[data-tei-toc] a[data-key]');
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      editor.commands.scrollToHeading(link.getAttribute('data-key') as NodeKey);
    };

    return mergeRegister(
      onUpdate,
      offOptions,
      offOutline,
      lexical.registerMutationListener(TocNode, (mutations) => {
        for (const [key, kind] of mutations) {
          if (kind === 'destroyed') tocs.delete(key);
          else tocs.add(key);
        }
      }),
      registerHostSelection(lexical, $isTocNode),
      registerSelectedAttribute(lexical, $isTocNode),
      lexical.registerNodeTransform(TocNode, $liftBlock),
      lexical.registerRootListener((root, previous) => {
        previous?.removeEventListener('click', onClick, true);
        root?.addEventListener('click', onClick, true);
      }),
    );
  },
  commands: {
    scrollToHeading: {
      run: ({ lexical, storage }, target: NodeKey) => {
        const heading = $findHeading(storage, target);
        if (!heading) return false;
        heading.selectStart();
        const key = heading.getKey();
        $onUpdate(() => {
          const element = lexical.getElementByKey(key);
          const win = element?.ownerDocument.defaultView ?? null;
          element?.scrollIntoView?.({
            block: 'start',
            behavior: reducedMotion(win) ? 'auto' : 'smooth',
          });
          const root = lexical.getRootElement();
          if (root && !root.contains(root.ownerDocument.activeElement))
            root.focus({ preventScroll: true });
        });
      },
      can: ({ storage }, target: NodeKey) => $findHeading(storage, target) !== null,
    },
    insertTableOfContents: {
      run: () => {
        if (!$canInsertBlock()) return false;
        $caretAfter($insertBlockAtSelection($createTocNode()));
      },
      can: $canInsertBlock,
    },
    removeTableOfContents: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getTocNode(key);
        if (!node) return false;
        $removeBlockHost(node);
      },
      can: (_ctx, key?: NodeKey) => $getTocNode(key) !== null,
    },
  },
  markdown: { tableOfContents: TABLE_OF_CONTENTS },
  icons: { toc, chevronDown },
  messages: {
    'toc.label': 'Table of contents',
    'toc.empty': 'Headings you add show here',
    'toc.toggle': 'Contents',
    'block.toc': 'Table of contents',
    'block.toc.description': 'Links to the headings, kept up to date',
  },
  items: [
    {
      id: 'tableOfContents',
      label: 'block.toc',
      description: 'block.toc.description',
      icon: 'toc',
      in: ['slash', 'insert'],
      group: 'basic',
      order: 46,
      keywords: ['toc', 'contents', 'outline', 'index', 'headings'],
      command: 'insertTableOfContents',
    },
  ],
});

/** The outline signal of an editor with {@link TableOfContents}, if installed. */
export function getOutline(editor: TeiEditor): ReadonlySignal<readonly TocEntry[]> | undefined {
  return (editor.extension(TableOfContents)?.output.storage as TableOfContentsStorage | undefined)
    ?.outline;
}
