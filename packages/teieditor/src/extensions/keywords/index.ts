import { effect } from '@lexical/extension';
import {
  $getNodeByKey,
  $getRoot,
  $isTextNode,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
  TextNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { RichText } from '../rich-text/index.js';

/** A keyword to mark, with the highlight it gets. */
export interface KeywordRule {
  /** A whole word (or phrase), or a pattern. */
  match: string | RegExp;
  /**
   * The CSS highlight's name: style it with `::highlight(name)`. Default the
   * extension's `className`.
   */
  className?: string;
}

export interface KeywordsOptions {
  /** What to mark: words, patterns, or rules with their own highlight. */
  keywords: readonly (string | RegExp | KeywordRule)[];
  /** The highlight name for rules without one. Default `tei-keyword`. */
  className: string;
  /** Match words in their exact case. Default false. */
  caseSensitive: boolean;
  /** Mark keywords in code too. Default false. */
  inCode: boolean;
}

interface Compiled {
  name: string;
  pattern: RegExp;
}

type HighlightLike = Set<AbstractRange>;
type Registry = Map<string, HighlightLike>;

/** The page's highlight registry and constructor, where the browser has them. */
function highlightApi(): { registry: Registry; make: () => HighlightLike } | null {
  const css = (globalThis as { CSS?: { highlights?: Registry } }).CSS;
  const Highlight = (globalThis as { Highlight?: new () => HighlightLike }).Highlight;
  if (!css?.highlights || typeof Highlight !== 'function') return null;
  return { registry: css.highlights, make: () => new Highlight() };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(options: KeywordsOptions): Compiled[] {
  const out: Compiled[] = [];
  for (const entry of options.keywords) {
    const rule: KeywordRule =
      typeof entry === 'string' || entry instanceof RegExp ? { match: entry } : entry;
    const name = rule.className ?? options.className;
    if (typeof rule.match === 'string') {
      if (!rule.match) continue;
      // A whole word: no letter, digit or underscore either side.
      const source = `(?<![\\p{L}\\p{N}_])${escape(rule.match)}(?![\\p{L}\\p{N}_])`;
      out.push({ name, pattern: new RegExp(source, options.caseSensitive ? 'gu' : 'giu') });
    } else {
      const flags = rule.match.flags.includes('g') ? rule.match.flags : `${rule.match.flags}g`;
      out.push({ name, pattern: new RegExp(rule.match.source, flags) });
    }
  }
  return out;
}

/** The DOM text a Lexical text node draws. */
function domText(element: Node | null): Text | null {
  for (let node = element; node; node = node.firstChild) {
    if (node.nodeType === 3) return node as Text;
  }
  return null;
}

function rangeOver(text: Text, start: number, end: number): AbstractRange {
  const StaticRangeClass = (
    globalThis as {
      StaticRange?: new (init: {
        startContainer: Node;
        startOffset: number;
        endContainer: Node;
        endOffset: number;
      }) => AbstractRange;
    }
  ).StaticRange;
  if (StaticRangeClass) {
    return new StaticRangeClass({
      startContainer: text,
      startOffset: start,
      endContainer: text,
      endOffset: end,
    });
  }
  const range = text.ownerDocument.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  return range;
}

type Ctx = { lexical: LexicalEditor; options: KeywordsOptions };

function register({ lexical, options }: Ctx): () => void {
  const api = highlightApi();
  if (!api) return () => {};
  const { registry, make } = api;
  /** This editor's ranges, by the text node they are in. */
  const ranges = new Map<NodeKey, Array<[name: string, range: AbstractRange]>>();
  let rules: Compiled[] = [];

  const highlight = (name: string) => {
    let found = registry.get(name);
    if (!found) {
      found = make();
      registry.set(name, found);
    }
    return found;
  };

  const forget = (key: NodeKey) => {
    const list = ranges.get(key);
    if (!list) return;
    ranges.delete(key);
    for (const [name, range] of list) {
      const set = registry.get(name);
      set?.delete(range);
      if (set?.size === 0) registry.delete(name);
    }
  };

  /** Mark the keywords in one text node, as it is drawn now. */
  const $mark = (key: NodeKey) => {
    forget(key);
    const node = $getNodeByKey(key);
    if (!$isTextNode(node) || rules.length === 0) return;
    if (!options.inCode && (node.hasFormat('code') || node.getParent()?.getType() === 'code'))
      return;
    const text = domText(lexical.getElementByKey(key));
    if (!text) return;
    const content = text.data;
    const list: Array<[string, AbstractRange]> = [];
    for (const { name, pattern } of rules) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(content); match; match = pattern.exec(content)) {
        if (match[0] === '') {
          pattern.lastIndex++;
          continue;
        }
        const range = rangeOver(text, match.index, match.index + match[0].length);
        highlight(name).add(range);
        list.push([name, range]);
      }
    }
    if (list.length > 0) ranges.set(key, list);
  };

  const forgetAll = () => {
    for (const key of [...ranges.keys()]) forget(key);
  };

  /** Everything again: the keywords changed. */
  const markAll = () => {
    forgetAll();
    rules = compile(options);
    if (rules.length === 0) return;
    lexical.getEditorState().read(() => {
      for (const node of $getRoot().getAllTextNodes()) $mark(node.getKey());
    });
  };

  const onMutation = (mutations: Map<NodeKey, string>) => {
    if (rules.length === 0) return;
    lexical.getEditorState().read(() => {
      for (const [key, mutation] of mutations) {
        if (mutation === 'destroyed') forget(key);
        else $mark(key);
      }
    });
  };
  // Mutation listeners are per class: every kind of text (code tokens, hashtags) needs its own.
  const textClasses = [...lexical._nodes.values()]
    .map(({ klass }) => klass)
    .filter((klass) => klass === TextNode || klass.prototype instanceof TextNode);

  return mergeRegister(
    effect(() => {
      // Read each option, so a change to any of them marks everything again.
      void [options.keywords, options.className, options.caseSensitive, options.inCode];
      markAll();
    }),
    // Only the text that changed, each update.
    ...textClasses.map((klass) => lexical.registerMutationListener(klass, onMutation)),
    lexical.registerRootListener((root) => {
      if (root) markAll();
      else forgetAll();
    }),
    forgetAll,
  );
}

/**
 * Mark keywords where they appear: product names, terms to avoid, TODOs.
 * The marks are CSS highlights (`::highlight(tei-keyword)`) over the text
 * as drawn, not part of the document: nothing is saved, undone or sent to
 * collaborators, and only the text that changed is looked at again. Where
 * the browser has no highlight API, nothing is marked.
 */
export const Keywords = defineTeiExtension({
  name: '@teispace/teieditor/keywords',
  config: {
    keywords: [],
    className: 'tei-keyword',
    caseSensitive: false,
    inCode: false,
  } as KeywordsOptions,
  dependencies: [RichText],
  register: (ctx) => register(ctx as unknown as Ctx),
});
