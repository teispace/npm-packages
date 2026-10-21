import { $insertGeneratedNodes, ClipboardImportExtension } from '@lexical/clipboard';
import {
  $generateDOMFromNodes,
  $generateNodesFromDOMViaExtension,
  CoreImportExtension,
  contextValue,
  DOMImportExtension,
  type DOMPreprocessFn,
  ImportSource,
  ImportSourceDataTransfer,
} from '@lexical/html';
import {
  $createParagraphNode,
  $getEditor,
  $getRoot,
  $insertNodes,
  configExtension,
  getStyleObjectFromCSS,
} from 'lexical';
import { getTeiEditor } from '../../core/core-extension.js';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import { neutralizeAttributes, restoreStyles } from '../../utils/html-attributes.js';

/** A Trusted Types policy, or anything with the same `createHTML`. */
export interface HtmlPolicy {
  createHTML(input: string): unknown;
}

export interface HtmlOptions {
  /**
   * Under `require-trusted-types-for 'script'` the parser takes only
   * TrustedHTML. By default (`null`) the editor makes its own policy named
   * `teieditor` where Trusted Types exist — list it in your CSP's
   * `trusted-types` directive. Pass your own policy to use that instead.
   */
  policy: HtmlPolicy | null;
  /**
   * Export storage-ready HTML: no editor classes, no `white-space` styles
   * the text does not need, `<strong>` rather than `<b><strong>`. Turn it
   * off to get Lexical's own output. Default true.
   */
  clean: boolean;
}

/**
 * Elements removed, with everything inside them, before any HTML is read —
 * from `setContent`, `content`, or a paste. None of them carry document
 * content, and some would otherwise leave their source text behind.
 */
export const DROPPED_ELEMENTS: readonly string[] = [
  'script',
  'style',
  'template',
  'noscript',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'title',
];

/**
 * Runs after the stylesheet inliner (it calls `$next` first), so styles a
 * paste carries in `<style>` still reach the import rules before the
 * element itself is dropped.
 */
const dropNonContent: DOMPreprocessFn = (dom, _ctx, $next) => {
  $next();
  for (const el of Array.from(dom.querySelectorAll(DROPPED_ELEMENTS.join(',')))) el.remove();
};

/** Wrappers Lexical adds around a format's own tag, for pasting into Google Docs. */
const REDUNDANT_WRAPPERS: Readonly<Record<string, string>> = {
  B: 'STRONG',
  I: 'EM',
  S: 'S',
  U: 'U',
};

/**
 * Whether HTML would lose whitespace in this text without `pre-wrap`: runs
 * of spaces, tabs and newlines always; a leading or trailing space only at
 * the edge of its block, where HTML drops it.
 */
function needsPreWrap(el: HTMLElement): boolean {
  const text = el.textContent ?? '';
  if (/\s\s|[\t\n]/.test(text)) return true;
  return (/^\s/.test(text) && !el.previousSibling) || (/\s$/.test(text) && !el.nextSibling);
}

/** Strip what only the editor needs from exported HTML. */
export function cleanExportedHTML(container: ParentNode): void {
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
    for (const name of Array.from(el.classList))
      if (name.startsWith('tei-')) el.classList.remove(name);
    if (el.classList.length === 0) el.removeAttribute('class');
    // Lexical turns spellcheck off in code; that is for the editor, not the document.
    el.removeAttribute('spellcheck');
    // The attribute's text, not the CSSOM: under a strict style-src the
    // browser keeps a parsed style attribute but never applies it, so
    // `el.style` reads empty and would lose every style.
    const css = el.getAttribute('style');
    if (css !== null) {
      const { 'white-space': whiteSpace, ...rest } = getStyleObjectFromCSS(css);
      const keep =
        whiteSpace === undefined ||
        (whiteSpace === 'pre-wrap' && (el.closest('pre') !== null || !needsPreWrap(el)))
          ? rest
          : { ...rest, 'white-space': whiteSpace };
      const text = Object.entries(keep)
        .map(([name, value]) => `${name}: ${value};`)
        .join(' ');
      if (text) el.setAttribute('style', text);
      else el.removeAttribute('style');
    }
  }
  // Lexical writes plain text as <span>; with nothing left on it, it is just text.
  for (const span of Array.from(container.querySelectorAll('span'))) {
    if (span.attributes.length === 0) span.replaceWith(...Array.from(span.childNodes));
  }
  container.normalize();
  // Code as `<pre><code class="language-x">` with real newlines, as
  // highlighters, Markdown renderers and copy-paste expect. `data-language`
  // stays for the editor to read back; the highlight copy of it goes.
  for (const pre of Array.from(container.querySelectorAll('pre'))) {
    for (const br of Array.from(pre.querySelectorAll('br'))) br.replaceWith('\n');
    pre.removeAttribute('data-highlight-language');
    const code = pre.ownerDocument.createElement('code');
    const language = pre.getAttribute('data-language');
    if (language) code.className = `language-${language}`;
    code.append(...Array.from(pre.childNodes));
    pre.append(code);
  }
  // Lexical numbers every list item; only a number that differs from the
  // count the list would give it says anything.
  for (const list of Array.from(container.querySelectorAll('ol, ul'))) {
    const ordered = list.tagName === 'OL';
    let expected = Number(list.getAttribute('start') ?? 1);
    for (const li of Array.from(list.children)) {
      if (li.tagName !== 'LI') continue;
      const value = li.getAttribute('value');
      if (value === null) continue;
      if (!ordered || Number(value) === expected) li.removeAttribute('value');
      expected = Number(value) + 1;
    }
  }
  // Check lists in GitHub's task-list markup, which Markdown renderers, other
  // editors and this one read back. Lexical's own form is a widget (role,
  // tabindex) that a static page cannot operate; a disabled checkbox says
  // what it is.
  for (const list of Array.from(container.querySelectorAll('ul[__lexicallisttype="check"]'))) {
    list.removeAttribute('__lexicallisttype');
    list.classList.add('contains-task-list');
    // An item that only holds a nested list has no aria-checked, and no box.
    for (const li of Array.from(list.children)) {
      if (li.tagName !== 'LI' || !li.hasAttribute('aria-checked')) continue;
      const checked = li.getAttribute('aria-checked') === 'true';
      for (const name of ['role', 'tabindex', 'aria-checked']) li.removeAttribute(name);
      li.classList.add('task-list-item');
      const box = li.ownerDocument.createElement('input');
      box.type = 'checkbox';
      box.setAttribute('disabled', '');
      if (checked) box.setAttribute('checked', '');
      li.prepend(box);
    }
  }
  for (const [outer, inner] of Object.entries(REDUNDANT_WRAPPERS)) {
    for (const el of Array.from(container.querySelectorAll(outer.toLowerCase()))) {
      const only = el.firstElementChild;
      if (
        only &&
        only === el.lastElementChild &&
        only.tagName === inner &&
        el.childNodes.length === 1 &&
        el.attributes.length === 0
      ) {
        el.replaceWith(only);
      }
    }
  }
}

/** The name of the policy the editor creates when the app passes none. */
export const TRUSTED_TYPES_POLICY = 'teieditor';

let ownPolicy: HtmlPolicy | null | undefined;

/**
 * The editor's own Trusted Types policy, made once per page. It passes HTML
 * through unchanged: a DOMParser document is inert, and nothing from it
 * reaches the page until import has dropped what is not content and checked
 * every URL. It is never exported, so no other script can use it to make
 * TrustedHTML for a real sink.
 */
function defaultHtmlPolicy(): HtmlPolicy | null {
  if (ownPolicy !== undefined) return ownPolicy;
  const factory = (
    globalThis as {
      trustedTypes?: {
        createPolicy(name: string, rules: { createHTML(s: string): string }): HtmlPolicy;
      };
    }
  ).trustedTypes;
  if (!factory) {
    ownPolicy = null;
    return null;
  }
  try {
    ownPolicy = factory.createPolicy(TRUSTED_TYPES_POLICY, { createHTML: (s) => s });
  } catch (error) {
    // The CSP does not allow the name, or another script took it. Pages that
    // do not enforce Trusted Types still parse plain strings.
    ownPolicy = null;
    console.warn(
      `teieditor: could not create the "${TRUSTED_TYPES_POLICY}" Trusted Types policy. If your CSP enforces Trusted Types, add "${TRUSTED_TYPES_POLICY}" to its trusted-types directive, or pass Html.configure({ policy }).`,
      error,
    );
  }
  return ownPolicy;
}

/** Elements that end a run of inline text. */
const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, div, section, article';

/**
 * Undo what browsers add when they put a selection on the clipboard:
 * WebKit's `text-align: start` (the default) on every block, its
 * non-breaking spaces where a plain space was copied, and the
 * `Apple-interchange-newline` break Chromium and WebKit end a block
 * selection with, which would paste as an empty paragraph.
 */
function normalizeImported(body: HTMLElement): void {
  // `<pre><code class="language-ts">`, as GitHub, Markdown renderers and
  // highlighters write it: the language goes where the code block reads it.
  for (const el of Array.from(body.querySelectorAll('pre[class], pre > code[class]'))) {
    const pre = el.closest('pre');
    const language = /(?:^|\s)lang(?:uage)?-([\w#+.-]+)/.exec(el.getAttribute('class') ?? '')?.[1];
    if (pre && language && !pre.hasAttribute('data-language'))
      pre.setAttribute('data-language', language);
  }
  for (const br of Array.from(body.querySelectorAll('br.Apple-interchange-newline'))) br.remove();
  for (const el of Array.from(body.querySelectorAll<HTMLElement>('[style]'))) {
    if (el.style.textAlign === 'start') el.style.removeProperty('text-align');
  }
  for (const span of Array.from(body.querySelectorAll('span.Apple-converted-space'))) {
    span.replaceWith((span.textContent ?? '').replace(/\u00a0/g, ' '));
  }
  // A lone NBSP between two words is a copied space; runs, block edges and
  // code keep theirs. Neighbours are looked up across text nodes, since
  // WebKit puts the NBSP right before or after an inline tag.
  const texts: Text[] = [];
  const walker = body.ownerDocument.createTreeWalker(body, SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  const blockOf = (text: Text) => text.parentElement?.closest(BLOCK_SELECTOR) ?? null;
  const isWordChar = (c: string | undefined) => c !== undefined && !/\s/.test(c);
  texts.forEach((text, index) => {
    if (!text.data.includes('\u00a0') || text.parentElement?.closest('pre, code')) return;
    const block = blockOf(text);
    const prev = texts[index - 1];
    const next = texts[index + 1];
    const before = prev && blockOf(prev) === block ? prev.data.at(-1) : undefined;
    const after = next && blockOf(next) === block ? next.data[0] : undefined;
    const chars = [...text.data];
    text.data = chars
      .map((c, i) => {
        if (c !== '\u00a0') return c;
        const left = i > 0 ? chars[i - 1] : before;
        const right = i < chars.length - 1 ? chars[i + 1] : after;
        return isWordChar(left) && isWordChar(right) ? ' ' : c;
      })
      .join('');
  });
}

/** `NodeFilter.SHOW_TEXT`; the `NodeFilter` global exists in browsers only, not in a server DOM. */
const SHOW_TEXT = 4;

/** Parse HTML into an inert document, through the app's policy or the editor's own. */
function parseHTML(editor: TeiEditor, html: string): Document {
  const policy = editor.extension(Html)?.output.options.policy.value ?? defaultHtmlPolicy();
  // No style or handler attribute reaches the parser (see neutralizeAttributes).
  const safe = neutralizeAttributes(html);
  const doc = new DOMParser().parseFromString(
    (policy ? policy.createHTML(safe) : safe) as string,
    'text/html',
  );
  restoreStyles(doc);
  normalizeImported(doc.body);
  return doc;
}

/**
 * Pasted HTML, through the same import rules as `setContent`. Replaces
 * Lexical's own handler, which makes a Trusted Types policy named `lexical`
 * on every paste and so fails under a strict CSP. When parsing fails, the
 * paste falls back to its plain text.
 */
const $pasteHTML = (
  html: string,
  selection: Parameters<typeof $insertGeneratedNodes>[2],
  _next: () => boolean,
  dataTransfer: DataTransfer,
): boolean => {
  const lexical = $getEditor();
  let doc: Document;
  try {
    doc = parseHTML(getTeiEditor(lexical), html);
  } catch (error) {
    console.warn('teieditor: could not parse pasted HTML; pasting its text instead.', error);
    return false;
  }
  const nodes = $generateNodesFromDOMViaExtension(doc, {
    context: [
      contextValue(ImportSource, 'paste'),
      contextValue(ImportSourceDataTransfer, dataTransfer),
    ],
  });
  $insertGeneratedNodes(lexical, nodes, selection);
  return true;
};

/**
 * The `html` content format and the paste pipeline: HTML in through
 * Lexical's import rules (each installed node brings its own), HTML out
 * through each node's export. `getHTML()` / `setContent(html)`.
 */
export const Html = defineTeiExtension({
  name: '@teispace/teieditor/html',
  config: { policy: null, clean: true } as HtmlOptions,
  dependencies: [
    configExtension(DOMImportExtension, { preprocess: [dropNonContent] }),
    CoreImportExtension,
    configExtension(ClipboardImportExtension, { $importMimeType: { 'text/html': [$pasteHTML] } }),
  ],
  formats: {
    html: {
      parse: ({ editor }, value) => {
        if (typeof value !== 'string') {
          throw new TypeError('teieditor: HTML content must be a string');
        }
        const nodes = $generateNodesFromDOMViaExtension(parseHTML(editor, value));
        const root = $getRoot();
        root.clear();
        root.select();
        $insertNodes(nodes);
        if (root.getChildrenSize() === 0) root.append($createParagraphNode());
      },
      serialize: ({ editor, lexical }) => {
        // Nothing written is nothing: what a form checks for, and the same
        // answer on a server (no DOM) as in the browser.
        if (editor.isEmpty) return '';
        if (typeof document === 'undefined') {
          throw new Error(
            'teieditor: getHTML() needs a DOM. On a server, use renderToHTML from @teispace/teieditor/server.',
          );
        }
        const container = $generateDOMFromNodes(document.createElement('div'), null, lexical);
        if (editor.extension(Html)?.output.options.clean.value !== false) {
          cleanExportedHTML(container);
        }
        return container.innerHTML;
      },
    },
  },
});
