import { configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, defineOverlayRules, sel } from '@lexical/html';
import type { TextMatchTransformer } from '@lexical/markdown';
import { $findMatchingParent } from '@lexical/utils';
import {
  $create,
  $createRangeSelection,
  $createTextNode,
  $getDocument,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type DOMExportOutput,
  type EditorConfig,
  type ElementDOMSlot,
  ElementNode,
  type LexicalNode,
  type LexicalUpdateJSON,
  mergeRegister,
  type SerializedElementNode,
  type TextNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import { ruby as rubyIcon, trash } from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Annotate the selected text (or change the annotation the caret is in). */
    setRuby: [annotation: string];
    /** Take the annotations off the selection, keeping the text. */
    unsetRuby: [];
    /** Ask the ruby UI (a `<RubyPopover>`) to open. `false` when none is mounted. */
    openRubyEditor: [];
  }
  interface TeiActiveStates {
    ruby: [];
  }
}

export const RUBY_EXTENSION = '@teispace/teieditor/ruby';

export interface SerializedRubyNode extends SerializedElementNode {
  annotation: string;
}

export interface RubyStorage {
  /** `openRubyEditor`'s requests, to the ruby editor (`<RubyPopover>`). */
  edit: UiRequest;
}

/** The `<rt>` a ruby element draws its annotation in. */
function rtOf(element: HTMLElement): HTMLElement | null {
  for (let child = element.lastElementChild; child; child = child.previousElementSibling) {
    if (child.tagName === 'RT') return child as HTMLElement;
  }
  return null;
}

/**
 * A ruby annotation: a reading over (or beside) its base text, as
 * furigana over kanji or pinyin over hanzi. The base is ordinary text in
 * the node; the annotation is an attribute drawn in an `<rt>` the caret
 * never enters. Saved as `<ruby>base<rt>reading</rt></ruby>`.
 */
export class RubyNode extends ElementNode {
  __annotation = '';

  $config() {
    return this.config('ruby', { extends: ElementNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__annotation = prev.__annotation;
  }

  getAnnotation(): string {
    return this.getLatest().__annotation;
  }

  setAnnotation(annotation: string): this {
    const self = this.getWritable();
    self.__annotation = annotation;
    return self;
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedRubyNode>): this {
    const self = super.updateFromJSON(json);
    const { annotation } = json as Partial<SerializedRubyNode>;
    return typeof annotation === 'string' ? self.setAnnotation(annotation) : self;
  }

  exportJSON(): SerializedRubyNode {
    return { ...super.exportJSON(), annotation: this.getAnnotation() };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const doc = $getDocument();
    const element = doc.createElement('ruby');
    element.className = (config.theme.ruby as string | undefined) ?? 'tei-ruby';
    const rt = doc.createElement('rt');
    rt.setAttribute('contenteditable', 'false');
    rt.textContent = this.__annotation;
    element.append(rt);
    return element;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    const rt = rtOf(dom);
    if (rt && prev.__annotation !== this.__annotation) rt.textContent = this.__annotation;
    return false;
  }

  /** The base text goes before the annotation. */
  getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
    return super.getDOMSlot(element).withBefore(rtOf(element));
  }

  exportDOM(): DOMExportOutput {
    const doc = $getDocument();
    const annotation = this.getAnnotation();
    return {
      element: doc.createElement('ruby'),
      // Children are appended to the element last: the annotation goes after them.
      after: (generated) => {
        if (generated?.nodeType !== 1) return generated;
        const ruby = doc.createElement('ruby');
        ruby.append(...Array.from(generated.childNodes));
        const rt = doc.createElement('rt');
        rt.textContent = annotation;
        ruby.append(rt);
        return ruby;
      },
    };
  }

  isInline(): true {
    return true;
  }

  canBeEmpty(): false {
    return false;
  }

  /** Typing at its edges goes outside it, as with a link. */
  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }

  /** A copy of part of its text keeps the annotation. */
  extractWithChild(): boolean {
    return true;
  }
}

export function $createRubyNode(annotation = ''): RubyNode {
  return $create(RubyNode).setAnnotation(annotation);
}

export function $isRubyNode(node: LexicalNode | null | undefined): node is RubyNode {
  return node instanceof RubyNode;
}

const $rubyOf = (node: LexicalNode) => $findMatchingParent(node, $isRubyNode) as RubyNode | null;

/** The ruby the selection is in, when it is in exactly one. */
export function $getRubyAtSelection(): RubyNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = $rubyOf(selection.anchor.getNode());
  return anchor?.is($rubyOf(selection.focus.getNode())) ? anchor : null;
}

/** Whether the selection is text a new ruby can hold: one run of plain text, no ruby in it. */
function $canWrap(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
  const nodes = selection.getNodes();
  const parent = nodes[0]?.getParent();
  return (
    nodes.length > 0 &&
    nodes.every((node) => $isTextNode(node) && parent?.is(node.getParent()) && !$rubyOf(node)) &&
    selection.getTextContent().trim() !== ''
  );
}

/** Select a ruby's whole base text. */
function $selectBase(ruby: RubyNode): void {
  const first = ruby.getFirstDescendant();
  const last = ruby.getLastDescendant();
  if (!$isTextNode(first) || !$isTextNode(last)) return;
  const selection = $createRangeSelection();
  selection.anchor.set(first.getKey(), 0, 'text');
  selection.focus.set(last.getKey(), last.getTextContentSize(), 'text');
  $setSelection(selection);
}

function $unwrap(ruby: RubyNode): void {
  for (const child of ruby.getChildren()) ruby.insertBefore(child);
  ruby.remove();
}

/** Every ruby the selection touches. */
function $rubiesInSelection(): RubyNode[] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [];
  const rubies = new Map<string, RubyNode>();
  for (const node of [selection.anchor.getNode(), ...selection.getNodes()]) {
    const ruby = $rubyOf(node);
    if (ruby) rubies.set(ruby.getKey(), ruby);
  }
  return [...rubies.values()];
}

function $unsetRuby(): boolean {
  const rubies = $rubiesInSelection();
  for (const ruby of rubies) $unwrap(ruby);
  return rubies.length > 0;
}

// -- HTML ---------------------------------------------------------------------

/** What a ruby holds besides its base: the annotations and the fallback parentheses. */
const CHROME = defineOverlayRules([
  defineImportRule({
    name: `${RUBY_EXTENSION}/chrome`,
    match: sel.tag('rt', 'rp', 'rtc'),
    $import: () => [],
  }),
]);

const isInlineNode = (node: LexicalNode) =>
  $isTextNode(node) || ($isElementNode(node) && node.isInline());

/**
 * `<ruby>`: each base and the `<rt>` after it become one ruby, so
 * `<ruby>漢<rt>kan</rt>字<rt>ji</rt></ruby>` is two. `<rp>` is left out.
 */
const RUBY_RULE = defineImportRule({
  name: RUBY_EXTENSION,
  match: sel.tag('ruby'),
  $import: (ctx, el) => {
    const doc = el.ownerDocument;
    const out: LexicalNode[] = [];
    let base = doc.createElement('span');
    const flush = (annotation: string | null) => {
      const nodes = ctx.$importChildren(base, { rules: CHROME });
      base = doc.createElement('span');
      if (annotation && nodes.length > 0 && nodes.every(isInlineNode)) {
        out.push($createRubyNode(annotation).append(...nodes));
      } else out.push(...nodes);
    };
    for (const child of Array.from(el.childNodes)) {
      const tag = child.nodeType === 1 ? child.nodeName.toLowerCase() : '';
      if (tag === 'rp') continue;
      if (tag === 'rt' || tag === 'rtc') flush((child.textContent ?? '').trim());
      else base.append(child.cloneNode(true));
    }
    if (base.childNodes.length > 0) flush(null);
    return out;
  },
});

// -- Markdown -----------------------------------------------------------------

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);
const unescapeHtml = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) =>
    name === '#39' ? "'" : (Object.keys(ESCAPES).find((c) => ESCAPES[c] === `&${name};`) ?? ''),
  );

const RUBY_HTML = /<ruby>([^<]+?)(?:<rp>[^<]*<\/rp>)?<rt>([^<]*)<\/rt>(?:<rp>[^<]*<\/rp>)?<\/ruby>/;

/** Markdown has no ruby: it is written as inline HTML, which markdown allows, and read back. */
export const RUBY: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [RubyNode],
  export: (node, exportChildren) =>
    $isRubyNode(node)
      ? `<ruby>${exportChildren(node)}<rt>${escapeHtml(node.getAnnotation())}</rt></ruby>`
      : null,
  importRegExp: RUBY_HTML,
  regExp: new RegExp(`${RUBY_HTML.source}$`),
  trigger: '>',
  replace: (textNode: TextNode, match) => {
    const annotation = unescapeHtml(match[2] ?? '').trim();
    const base = $createTextNode(unescapeHtml(match[1] ?? '')).setFormat(textNode.getFormat());
    if (!annotation) {
      textNode.replace(base);
      return;
    }
    const ruby = $createRubyNode(annotation).append(base);
    textNode.replace(ruby);
    ruby.selectNext(0, 0);
  },
};

// -- Extension ----------------------------------------------------------------

/**
 * Ruby annotations for East Asian text: select the base, give it a reading
 * (`setRuby('かんじ')`), and it shows small above the text. A
 * `<RubyPopover>` edits it; a click on the reading opens that. HTML keeps
 * `<ruby>`, and markdown writes it as inline HTML.
 */
export const Ruby = defineTeiExtension({
  name: RUBY_EXTENSION,
  nodes: [RubyNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [RUBY_RULE] })],
  storage: (): RubyStorage => ({ edit: uiRequest() }),
  commands: {
    setRuby: {
      run: (_ctx, annotation: string) => {
        const text = String(annotation ?? '').trim();
        if (!text) return $unsetRuby();
        const current = $getRubyAtSelection();
        if (current) {
          current.setAnnotation(text);
          return;
        }
        const selection = $getSelection();
        if (!$canWrap() || !$isRangeSelection(selection)) return false;
        const nodes = selection.extract().filter($isTextNode);
        const first = nodes[0];
        if (!first) return false;
        const ruby = $createRubyNode(text);
        first.insertBefore(ruby);
        ruby.append(...nodes);
        $selectBase(ruby);
      },
      can: () => $getRubyAtSelection() !== null || $canWrap(),
    },
    unsetRuby: {
      run: () => $unsetRuby(),
      can: () => $rubiesInSelection().length > 0,
    },
    openRubyEditor: {
      run: ({ storage }) => requestUi(storage.edit),
      can: ({ storage }) => hasUi(storage.edit) && ($getRubyAtSelection() !== null || $canWrap()),
    },
  },
  active: { ruby: () => $getRubyAtSelection() !== null },
  icons: { ruby: rubyIcon, trash },
  messages: {
    'ruby.add': 'Ruby annotation',
    'ruby.edit': 'Edit annotation',
    'ruby.remove': 'Remove annotation',
    'ruby.placeholder': 'Reading (furigana, pinyin)',
    'ruby.apply': 'Apply',
  },
  markdown: { ruby: RUBY },
  items: [
    {
      id: 'ruby',
      label: 'ruby.add',
      icon: 'ruby',
      in: ['toolbar', 'bubble'],
      group: 'insert',
      order: 5,
      priority: 5,
      keywords: ['furigana', 'pinyin', 'reading', 'annotation', 'ruby'],
      command: 'openRubyEditor',
      active: 'ruby',
    },
    {
      id: 'unsetRuby',
      label: 'ruby.remove',
      icon: 'trash',
      in: ['contextMenu'],
      group: 'insert',
      order: 6,
      command: 'unsetRuby',
      visible: (editor) => editor.isActive('ruby'),
    },
  ],
  register: (ctx) => {
    const { lexical, editor } = ctx;
    const storage = ctx.storage as RubyStorage;
    const rtAt = (target: EventTarget | null) =>
      target && (target as Node).nodeType === 1 ? (target as Element).closest('rt') : null;
    // A press on the reading keeps the caret; a click on it edits the annotation.
    const onPointerDown = (event: PointerEvent) => {
      if (rtAt(event.target) && event.pointerType !== 'touch') event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      const rt = rtAt(event.target);
      if (!rt || !lexical.isEditable() || !hasUi(storage.edit)) return;
      event.preventDefault();
      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(rt);
        const ruby = node && ($isRubyNode(node) ? node : $rubyOf(node));
        if (ruby) $selectBase(ruby);
      });
      editor.focus();
      editor.commands.openRubyEditor();
    };
    return mergeRegister(
      lexical.registerRootListener((root, prev) => {
        prev?.removeEventListener('pointerdown', onPointerDown);
        prev?.removeEventListener('click', onClick);
        root?.addEventListener('pointerdown', onPointerDown);
        root?.addEventListener('click', onClick);
      }),
      // An annotation with no reading is no annotation.
      lexical.registerNodeTransform(RubyNode, (node) => {
        if (!node.getAnnotation().trim()) $unwrap(node);
      }),
    );
  },
});
