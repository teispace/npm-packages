import {
  $createCodeHighlightNode,
  $isCodeHighlightNode,
  $plainifyCodeContent,
  CodeHighlightNode,
  CodeNode,
} from '@lexical/code-core';
import { CodeShikiExtension, type Tokenizer } from '@lexical/code-shiki';
import { effect, getPeerDependencyFromEditor, type Signal } from '@lexical/extension';
import { DOMRenderExtension, domOverride } from '@lexical/html';
import {
  $createLineBreakNode,
  $createTabNode,
  $getEditor,
  $getNodeByKey,
  $isLineBreakNode,
  $isTabNode,
  configExtension,
  HISTORY_MERGE_TAG,
  isHTMLElement,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
  tokenizeRawText,
} from 'lexical';
import {
  createHighlighterCoreSync,
  isSpecialLang,
  type ThemedToken,
  type ThemeRegistrationAny,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguagesInfo } from 'shiki/langs';
import { bundledThemesInfo } from 'shiki/themes';
import { defineTeiExtension } from '../../core/define.js';
import type { CodeLanguage } from '../../utils/code-language.js';
import { CodeBlock } from '../code-block/index.js';

/** A Shiki theme: a bundled one by id (`'github-dark'`), or a theme object of your own. */
export type ShikiTheme = string | ThemeRegistrationAny;

export interface CodeShikiOptions {
  /**
   * The theme, or one for each colour scheme. Both load on first use and
   * the editor's scheme picks between them with CSS (`light-dark()`), so
   * switching scheme re-renders nothing. Default GitHub light and dark.
   */
  theme: ShikiTheme | { light: ShikiTheme; dark: ShikiTheme };
  /** Paint code blocks with the theme's background, not the editor's. Default true. */
  background: boolean;
  /** Longer lines are left uncoloured, so minified code cannot stall typing. Default 2,000. */
  maxLineLength: number;
  /** Longer blocks are left uncoloured. Default 100,000 characters. */
  maxLength: number;
}

const PREFIX = '--tei-shiki-';
/** The theme a code block is stamped with: "the editor's", which Lexical's loader skips. */
const EDITOR_THEME = 'none';

// -- The highlighter ------------------------------------------------------------

type Core = ReturnType<typeof createHighlighterCoreSync>;
let shared: Core | undefined;

/**
 * One highlighter for every editor, made on first use. The JavaScript
 * regex engine, not the WebAssembly one: no `.wasm` to fetch, and nothing
 * a strict `script-src` (which blocks `wasm-unsafe-eval`) would refuse.
 */
function core(): Core {
  shared ??= createHighlighterCoreSync({
    engine: createJavaScriptRegexEngine({ forgiving: true }),
    langs: [],
    themes: [],
  });
  return shared;
}

/** Loads in flight, by `lang:` or `theme:` and name, so each starts once. */
const loading = new Map<string, Promise<void>>();

let languageIndex: Map<string, (typeof bundledLanguagesInfo)[number]> | undefined;
/** A bundled language by its id or any alias, in lower case. */
function bundledLanguage(name: string) {
  if (!languageIndex) {
    languageIndex = new Map();
    for (const info of bundledLanguagesInfo) {
      languageIndex.set(info.id, info);
      for (const alias of info.aliases ?? [])
        if (!languageIndex.has(alias)) languageIndex.set(alias, info);
    }
  }
  return languageIndex.get(name.toLowerCase());
}

const themeName = (theme: ShikiTheme): string =>
  typeof theme === 'string' ? theme : (theme.name ?? '');

/** The light and dark theme of these options. */
function themesOf(options: Readonly<CodeShikiOptions>): { light: ShikiTheme; dark: ShikiTheme } {
  const { theme } = options;
  return typeof theme === 'object' && theme !== null && 'light' in theme && 'dark' in theme
    ? (theme as { light: ShikiTheme; dark: ShikiTheme })
    : { light: theme as ShikiTheme, dark: theme as ShikiTheme };
}

const languageLoaded = (id: string) =>
  isSpecialLang(id) || core().getLoadedLanguages().includes(id);
const themeLoaded = (theme: ShikiTheme) => core().getLoadedThemes().includes(themeName(theme));

/**
 * Load a language's grammar; `true` once it is in. `null` for one Shiki
 * does not have, which stays plain.
 */
function ensureLanguage(id: string, done: () => void): boolean | null {
  if (languageLoaded(id)) return true;
  const info = bundledLanguage(id);
  if (!info) return null;
  const key = `lang:${info.id}`;
  let task = loading.get(key);
  if (!task) {
    task = core()
      .loadLanguage(info.import())
      .catch((error: unknown) => {
        console.warn(`teieditor: could not load the Shiki grammar for "${id}".`, error);
      });
    loading.set(key, task);
  }
  task.then(done);
  return false;
}

/** Load themes; `true` once they all are in. A bundled one by id, or an object as given. */
function ensureThemes(themes: readonly ShikiTheme[], done: () => void): boolean {
  const missing = themes.filter((theme) => !themeLoaded(theme));
  if (missing.length === 0) return true;
  const tasks = missing.map((theme) => {
    const name = themeName(theme);
    const key = `theme:${name}`;
    let task = loading.get(key);
    if (!task) {
      const info = typeof theme === 'string' ? bundledThemesInfo.find((t) => t.id === theme) : null;
      task =
        typeof theme === 'string' && !info
          ? Promise.reject(new Error(`no bundled theme "${theme}"`))
          : core().loadTheme(info ? info.import() : (theme as ThemeRegistrationAny));
      task = task.catch((error: unknown) => {
        console.warn(`teieditor: could not load the Shiki theme "${name}".`, error);
      });
      loading.set(key, task);
    }
    return task;
  });
  Promise.all(tasks).then(done);
  return false;
}

// -- Tokens ---------------------------------------------------------------------

/**
 * TextMate scope prefixes to the token kinds Lexical's theme names
 * (`theme.codeHighlight`), most specific first. They put a class on each
 * token as well as its colours: what colours it where the Shiki styles
 * are not loaded, and in HTML exported with classes kept.
 */
const SCOPE_TYPES: ReadonlyArray<readonly [prefix: string, type: string]> = [
  ['markup.inserted', 'inserted'],
  ['markup.deleted', 'deleted'],
  ['keyword.operator', 'operator'],
  ['keyword', 'keyword'],
  ['storage', 'keyword'],
  ['constant.numeric', 'number'],
  ['constant.language', 'boolean'],
  ['constant.character', 'char'],
  ['constant.other.color', 'constant'],
  ['constant', 'constant'],
  ['support.type.property-name', 'property'],
  ['meta.object-literal.key', 'property'],
  ['variable.other.property', 'property'],
  ['variable.other.object.property', 'property'],
  ['entity.name.function', 'function'],
  ['support.function', 'function'],
  ['entity.name.tag', 'tag'],
  ['entity.other.attribute-name', 'attr'],
  ['entity.name.namespace', 'namespace'],
  ['entity.name.type', 'class-name'],
  ['entity.name.class', 'class-name'],
  ['entity.other.inherited-class', 'class-name'],
  ['support.class', 'class-name'],
  ['support.type', 'class-name'],
  ['support.constant', 'constant'],
  ['support.variable', 'builtin'],
  ['variable', 'variable'],
  ['entity.name', 'variable'],
  ['punctuation', 'punctuation'],
];

const hasPrefix = (scope: string, prefix: string) =>
  scope === prefix || scope.startsWith(`${prefix}.`);

/**
 * The token kind for a token's scopes, outermost first; `null` for plain
 * text. A comment or a string owns everything in it (its quotes and
 * slashes too), except code embedded in it, like `${x}` in a template.
 */
export function shikiScopeType(scopes: readonly string[]): string | null {
  let start = 0;
  let owner: string | null = null;
  scopes.forEach((scope, index) => {
    if (hasPrefix(scope, 'comment')) {
      owner = 'comment';
      start = index;
    } else if (hasPrefix(scope, 'string')) {
      owner = hasPrefix(scope, 'string.regexp') ? 'regex' : 'string';
      start = index;
    } else if (
      owner !== 'comment' &&
      (hasPrefix(scope, 'meta.embedded') || hasPrefix(scope, 'meta.template.expression'))
    ) {
      owner = null;
      start = index;
    }
  });
  if (owner) return owner;
  for (let i = scopes.length - 1; i >= start; i--) {
    const scope = scopes[i] as string;
    for (const [prefix, type] of SCOPE_TYPES) if (hasPrefix(scope, prefix)) return type;
  }
  return null;
}

/**
 * A token's colours as custom properties, one per scheme, for the CSS to
 * pick with `light-dark()`. A font style only when both themes agree: no
 * CSS function picks a font style by scheme.
 */
function tokenStyle(style: Record<string, string> | undefined): string {
  if (!style) return '';
  let css = '';
  for (const scheme of ['light', 'dark']) {
    const color = style[`${PREFIX}${scheme}`];
    if (color) css += `${PREFIX}${scheme}:${color};`;
  }
  for (const property of ['font-style', 'font-weight', 'text-decoration']) {
    const light = style[`${PREFIX}light-${property}`];
    if (light && light !== 'inherit' && light === style[`${PREFIX}dark-${property}`]) {
      css += `${PREFIX}${property}:${light};`;
    }
  }
  return css;
}

/** One token's pieces, by the kind each one is, run together where the kind repeats. */
function pieces(token: ThemedToken): Array<{ text: string; type: string | null }> {
  const explained = token.explanation;
  const joined = explained?.map((part) => part.content).join('');
  if (!explained?.length || joined !== token.content) {
    const scopes = explained?.[0]?.scopes.map((s) => s.scopeName) ?? [];
    return [{ text: token.content, type: shikiScopeType(scopes) }];
  }
  const out: Array<{ text: string; type: string | null }> = [];
  for (const part of explained) {
    const type = shikiScopeType(part.scopes.map((s) => s.scopeName));
    const last = out[out.length - 1];
    // Whitespace takes the kind before it: fewer nodes, nothing looks different.
    if (last && (last.type === type || !part.content.trim())) last.text += part.content;
    else out.push({ text: part.content, type });
  }
  return out;
}

const DIFF = /^diff-([\w-]+)$/i;
const DIFF_MARKS: Readonly<Record<string, string>> = {
  '+': 'inserted',
  '-': 'deleted',
  '>': 'inserted',
  '<': 'deleted',
  ' ': 'unchanged',
};

/** Lexical nodes for Shiki's tokens: one per run of the same kind and colours. */
function $tokensToNodes(lines: ThemedToken[][], diff: boolean): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  let open: { text: string; type: string | null; style: string } | null = null;
  const flush = () => {
    if (!open) return;
    const { text, type, style } = open;
    open = null;
    tokenizeRawText(text, {
      linebreak: () => nodes.push($createLineBreakNode()),
      tab: () => nodes.push($createTabNode()),
      text: (part) => {
        const node = $createCodeHighlightNode(part, type);
        if (style) node.setStyle(style);
        nodes.push(node);
      },
    });
  };
  lines.forEach((line, index) => {
    flush();
    if (index > 0) nodes.push($createLineBreakNode());
    // `diff-js`: each line's first character marks it added, removed or kept.
    let marked = !diff;
    for (const token of line) {
      const style = tokenStyle(token.htmlStyle as Record<string, string> | undefined);
      for (const piece of pieces(token)) {
        let { text } = piece;
        if (!marked && text) {
          marked = true;
          const mark = DIFF_MARKS[text[0] as string];
          if (mark) {
            nodes.push($createCodeHighlightNode(text[0] as string, mark));
            text = text.slice(1);
            if (!text) continue;
          }
        }
        const current = open as { text: string; type: string | null; style: string } | null;
        if (current && current.type === piece.type && current.style === style) {
          current.text += text;
        } else {
          flush();
          open = { text, type: piece.type, style };
        }
      }
    }
  });
  flush();
  return nodes;
}

/** A block's children as they are, while what colours them loads: no flash of plain text. */
function $keep(code: CodeNode): LexicalNode[] {
  const children = code.getChildren();
  return children.every((c) => $isCodeHighlightNode(c) || $isTabNode(c) || $isLineBreakNode(c))
    ? children
    : $plainifyCodeContent(code.getTextContent());
}

/** What each editor's tokenizer needs: its options, and how to colour its blocks again. */
interface EditorState {
  options: Readonly<CodeShikiOptions>;
  refresh: () => void;
}
const editors = new WeakMap<LexicalEditor, EditorState>();

/**
 * The tokenizer Lexical's Shiki extension runs on each code block. Lexical
 * loads the grammar first (into its own highlighter, which it keeps to
 * itself); this one colours with its own, in both themes at once.
 */
const tokenizer: Tokenizer = {
  // A block keeps the language it was given; CodeBlock's `defaultLanguage` picks one for new blocks.
  defaultLanguage: null,
  defaultTheme: EDITOR_THEME,
  $tokenize(code: CodeNode, language?: string): LexicalNode[] {
    const text = code.getTextContent();
    const state = editors.get($getEditor());
    if (!language || !state || text.length > state.options.maxLength) {
      return $plainifyCodeContent(text);
    }
    const diff = DIFF.exec(language);
    const id = (diff ? diff[1] : language) as string;
    const { light, dark } = themesOf(state.options);
    const grammar = ensureLanguage(id, state.refresh);
    if (grammar === null) return $plainifyCodeContent(text);
    const themes = ensureThemes([light, dark], state.refresh);
    if (!grammar || !themes) return $keep(code);
    const colour = () =>
      core().codeToTokens(text, {
        lang: id,
        themes: { light: themeName(light), dark: themeName(dark) },
        defaultColor: false,
        cssVariablePrefix: PREFIX,
        includeExplanation: 'scopeName',
        tokenizeMaxLineLength: state.options.maxLineLength,
      }).tokens;
    try {
      let tokens: ReturnType<typeof colour>;
      try {
        tokens = colour();
      } catch {
        // Shiki tokenizes each line twice (colours, then scopes), each under
        // a time limit. The first run of a grammar compiles its patterns; on
        // a slow or busy machine that run stops short and the two disagree,
        // which throws. Compiled now, a second run agrees.
        tokens = colour();
      }
      return $tokensToNodes(tokens, diff !== null);
    } catch (error) {
      console.warn(`teieditor: Shiki could not colour "${id}".`, error);
      return $plainifyCodeContent(text);
    }
  },
};

/** Take Shiki's custom properties off an exported element: they colour the editor, not the page. */
function stripShiki(element: HTMLElement): void {
  for (const el of [element, ...Array.from(element.querySelectorAll<HTMLElement>('[style]'))]) {
    for (const name of Array.from(el.style))
      if (name.startsWith(PREFIX)) el.style.removeProperty(name);
    if (el.style.length === 0) el.removeAttribute('style');
  }
}

/** The editor root's theme colours, as custom properties through the CSSOM. */
function paintRoot(root: HTMLElement, options: Readonly<CodeShikiOptions>): void {
  const { light, dark } = themesOf(options);
  root.setAttribute('data-tei-shiki', '');
  root.toggleAttribute('data-tei-shiki-background', options.background);
  for (const [scheme, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    if (!themeLoaded(theme)) continue;
    const { bg, fg } = core().getTheme(themeName(theme));
    root.style.setProperty(`${PREFIX}${scheme}-bg`, bg);
    root.style.setProperty(`${PREFIX}${scheme}-fg`, fg);
  }
}

function unpaintRoot(root: HTMLElement): void {
  root.removeAttribute('data-tei-shiki');
  root.removeAttribute('data-tei-shiki-background');
  for (const name of ['light-bg', 'light-fg', 'dark-bg', 'dark-fg']) {
    root.style.removeProperty(`${PREFIX}${name}`);
  }
}

/**
 * Syntax colours for code blocks with Shiki: VS Code's grammars and
 * themes, an alternative to `CodeHighlight` (Prism). Each language's
 * grammar and each theme loads the first time a block needs it, so the
 * entry costs Shiki's engine and its lists of languages and themes, not
 * the languages themselves.
 *
 * One render serves both colour schemes: each token carries its light and
 * dark colour as custom properties (set through the CSSOM, nothing for a
 * strict `style-src`), and the stylesheet picks one with `light-dark()`.
 * Saved HTML drops them, keeping `<pre><code class="language-x">`. With
 * `CodeHighlight` installed too, it switches Prism off.
 *
 * Offer more languages in the code block's picker with
 * `CodeBlock.configure({ languages: shikiLanguages() })`.
 */
export const CodeShiki = defineTeiExtension({
  name: '@teispace/teieditor/code-shiki',
  config: {
    theme: { light: 'github-light', dark: 'github-dark' },
    background: true,
    maxLineLength: 2_000,
    maxLength: 100_000,
  } as CodeShikiOptions,
  dependencies: [
    CodeBlock,
    configExtension(CodeShikiExtension, { tokenizer }),
    configExtension(DOMRenderExtension, {
      overrides: [
        domOverride([CodeHighlightNode], {
          $exportDOM: (_node, $next) => {
            const output = $next();
            if (isHTMLElement(output.element)) stripShiki(output.element);
            return output;
          },
        }),
        domOverride([CodeNode], {
          $exportDOM: (_node, $next) => {
            const output = $next();
            const { element } = output;
            if (isHTMLElement(element) && element.getAttribute('data-theme') === EDITOR_THEME) {
              element.removeAttribute('data-theme');
            }
            return output;
          },
        }),
      ],
    }),
  ],
  register: ({ lexical, options }) => {
    // Every code block, to colour again when a grammar or theme arrives.
    const blocks = new Set<NodeKey>();
    let queued = false;
    const refresh = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        // A load that lands after the editor is gone has nothing to colour.
        if (!editors.has(lexical)) return;
        const root = lexical.getRootElement();
        if (root) paintRoot(root, options);
        if (blocks.size === 0) return;
        lexical.update(
          () => {
            for (const key of blocks) $getNodeByKey(key)?.markDirty();
          },
          { tag: HISTORY_MERGE_TAG },
        );
      });
    };
    editors.set(lexical, { options, refresh });
    // Prism and Shiki would both colour every block: with both installed, Shiki wins.
    const prism = getPeerDependencyFromEditor(lexical, '@lexical/code-prism' as never) as
      | { output: { disabled: Signal<boolean> } }
      | undefined;
    const prismWas = prism?.output.disabled.peek();
    if (prism) prism.output.disabled.value = true;
    return mergeRegister(
      lexical.registerMutationListener(
        CodeNode,
        (mutations) => {
          for (const [key, mutation] of mutations) {
            if (mutation === 'destroyed') blocks.delete(key);
            else blocks.add(key);
          }
        },
        { skipInitialization: false },
      ),
      lexical.registerRootListener((root, previous) => {
        if (previous) unpaintRoot(previous);
        if (root) paintRoot(root, options);
      }),
      // Another theme colours every block again; the blocks load it, when there are some.
      effect(() => {
        themesOf(options);
        void options.background;
        refresh();
      }),
      () => {
        editors.delete(lexical);
        const root = lexical.getRootElement();
        if (root) unpaintRoot(root);
        if (prism && prismWas !== undefined) prism.output.disabled.value = prismWas;
      },
    );
  },
});

/**
 * Shiki's languages for the code block's picker, as [id, name]: every one
 * it bundles (over 200), or the ones named, in that order, by id or alias.
 *
 * ```ts
 * CodeBlock.configure({ languages: shikiLanguages(['ts', 'tsx', 'python', 'rust', 'sql']) })
 * ```
 */
export function shikiLanguages(ids?: readonly string[]): readonly CodeLanguage[] {
  if (!ids) {
    return bundledLanguagesInfo
      .map((info): CodeLanguage => [info.id, info.name])
      .sort((a, b) => a[1].localeCompare(b[1]));
  }
  const seen = new Set<string>();
  const out: CodeLanguage[] = [];
  for (const id of ids) {
    const info = bundledLanguage(id);
    if (!info || seen.has(info.id)) continue;
    seen.add(info.id);
    out.push([info.id, info.name]);
  }
  return out;
}

/** Shiki's bundled themes, as [id, name, 'light' | 'dark'], for a theme picker. */
export function shikiThemes(): ReadonlyArray<readonly [id: string, name: string, type: string]> {
  return bundledThemesInfo.map((info) => [info.id, info.displayName, info.type] as const);
}
