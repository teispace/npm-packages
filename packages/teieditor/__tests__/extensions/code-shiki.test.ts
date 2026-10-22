import { $isCodeHighlightNode, $isCodeNode, type CodeHighlightNode } from '@lexical/code-core';
import { $dfs } from '@lexical/utils';
import { $getSelection, $isRangeSelection } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setExtensionOptions } from '../../src/core/define.js';
import { CodeBlock } from '../../src/extensions/code-block/index.js';
import {
  CodeShiki,
  type CodeShikiOptions,
  shikiLanguages,
  shikiScopeType,
  shikiThemes,
} from '../../src/extensions/code-shiki/index.js';
import { History } from '../../src/extensions/history/index.js';
import { Html } from '../../src/extensions/html/index.js';
import { Markdown } from '../../src/extensions/markdown/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(
  content: string,
  {
    options,
    starterKit = false,
  }: { options?: Partial<CodeShikiOptions>; starterKit?: boolean } = {},
) {
  const editor = createTeiEditor({
    extensions: [
      ...(starterKit ? [StarterKit] : [History, Html, Markdown]),
      options ? CodeShiki.configure(options) : CodeShiki,
    ],
    content,
    contentFormat: 'markdown',
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return { editor, root };
}

const tokens = (editor: TeiEditor) =>
  editor.read(() =>
    $dfs()
      .map(({ node }) => node)
      .filter((node): node is CodeHighlightNode => $isCodeHighlightNode(node))
      .map((node) => ({
        text: node.getTextContent(),
        type: node.getHighlightType() ?? null,
        style: node.getStyle(),
      })),
  );

/** Until Shiki has loaded what the blocks need and coloured them. */
const coloured = (editor: TeiEditor, where = 'const') =>
  vi.waitFor(
    () => {
      const token = tokens(editor).find((t) => t.text.includes(where));
      expect(token?.style).toContain('--tei-shiki-light:');
    },
    { timeout: 10_000, interval: 20 },
  );

const TS =
  '```typescript\nconst greeting: string = "hi"; // say it\nfunction f(n) { return n + 1 }\n```';

describe('CodeShiki', () => {
  it('colours a block in both themes at once, with a token kind on each', async () => {
    const { editor } = make(TS);
    await coloured(editor);
    const all = tokens(editor);
    const keyword = all.find((t) => t.text === 'const');
    expect(keyword?.type).toBe('keyword');
    expect(keyword?.style).toMatch(/--tei-shiki-light:#\w+;--tei-shiki-dark:#\w+;/);
    expect(all.find((t) => t.text.includes('"hi"'))?.type).toBe('string');
    expect(all.find((t) => t.text.includes('// say it'))?.type).toBe('comment');
    expect(all.find((t) => t.text === 'f')?.type).toBe('function');
    // The text is untouched.
    expect(editor.getText()).toContain('const greeting: string = "hi"; // say it');
  });

  it('gives the DOM the colours through the CSSOM, and the root its theme', async () => {
    const { editor, root } = make(TS);
    await coloured(editor);
    await vi.waitFor(() => expect(root.style.getPropertyValue('--tei-shiki-dark-bg')).not.toBe(''));
    expect(root.hasAttribute('data-tei-shiki')).toBe(true);
    expect(root.hasAttribute('data-tei-shiki-background')).toBe(true);
    expect(root.style.getPropertyValue('--tei-shiki-light-fg')).toMatch(/^#/);
    const span = Array.from(root.querySelectorAll<HTMLElement>('code span')).find(
      (el) => el.textContent === 'const',
    );
    expect(span?.style.getPropertyValue('--tei-shiki-light')).toMatch(/^#/);
    expect(span?.classList.contains('tei-token-keyword')).toBe(true);
  });

  it('saves HTML with no inline colours, no theme stamp, and the language kept', async () => {
    const { editor } = make(TS);
    await coloured(editor);
    const html = editor.getHTML();
    expect(html).not.toContain('--tei-shiki');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('data-theme');
    expect(html).toContain('language-typescript');
    expect(html).toContain('const greeting');
    // And back: the same code, coloured again.
    const { editor: again } = make('');
    again.setContent(html, 'html');
    await coloured(again);
    expect(again.getText()).toBe(editor.getText());
  });

  it('keeps raw (unclean) HTML free of Shiki properties too', async () => {
    const { editor } = make(TS);
    await coloured(editor);
    setExtensionOptions(editor, Html, { clean: false });
    const html = editor.getHTML();
    expect(html).not.toContain('--tei-shiki');
    expect(html).toContain('tei-token-keyword');
  });

  it('round-trips JSON and Markdown', async () => {
    const { editor } = make(TS);
    await coloured(editor);
    const json = editor.getJSON();
    const { editor: copy } = make('');
    copy.setContent(json, 'json');
    expect(copy.getText()).toBe(editor.getText());
    expect(tokens(copy)).toEqual(tokens(editor));
    expect(editor.getMarkdown()).toBe(TS);
  });

  it('adds nothing to undo history', async () => {
    const { editor } = make(TS);
    await coloured(editor);
    expect(editor.can().undo()).toBe(false);
    // Typing then undoing goes back to the coloured text in one step.
    const before = editor.getText();
    editor.update(() => {
      const code = $dfs().find(({ node }) => $isCodeNode(node))?.node;
      code?.selectEnd();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(' // more');
    });
    await coloured(editor, 'more');
    expect(editor.getText()).not.toBe(before);
    editor.commands.undo();
    expect(editor.getText()).toBe(before);
    expect(editor.can().undo()).toBe(false);
  });

  it('leaves a block with no language, or one Shiki lacks, as plain text', async () => {
    const { editor } = make('```\nconst a = 1\n```\n\n```nope-lang\nconst b = 2\n```');
    // Long enough for a load, had one started.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tokens(editor).every((t) => t.type === null && t.style === '')).toBe(true);
    const languages = editor.read(() =>
      $dfs()
        .map(({ node }) => node)
        .filter($isCodeNode)
        .map((n) => n.getLanguage() ?? null),
    );
    expect(languages).toEqual([null, 'nope-lang']);
    expect(editor.getMarkdown()).toBe('```\nconst a = 1\n```\n\n```nope-lang\nconst b = 2\n```');
  });

  it('colours again in another language', async () => {
    const { editor } = make('```python\ndef f(): pass\n```');
    await coloured(editor, 'def');
    expect(tokens(editor).find((t) => t.text === 'def')?.type).toBe('keyword');
    editor.update(() => {
      const code = $dfs().find(({ node }) => $isCodeNode(node))?.node;
      if ($isCodeNode(code)) code.setLanguage('plaintext');
    });
    await vi.waitFor(() => expect(tokens(editor).every((t) => t.type === null)).toBe(true));
  });

  it('switches Prism off when CodeHighlight is installed too', async () => {
    const { editor } = make(TS, { starterKit: true });
    await coloured(editor);
    const prism = editor.extension('@lexical/code-prism')?.output as {
      disabled: { value: boolean };
    };
    expect(prism.disabled.value).toBe(true);
    // Prism would have marked `const` without any style.
    expect(tokens(editor).every((t) => t.style.includes('--tei-shiki-'))).toBe(true);
  });

  it('follows a theme change at run time', async () => {
    const { editor } = make(TS);
    await coloured(editor);
    const before = tokens(editor).find((t) => t.text === 'const')?.style;
    setExtensionOptions(editor, CodeShiki, { theme: 'monokai' });
    await vi.waitFor(
      () => expect(tokens(editor).find((t) => t.text === 'const')?.style).not.toBe(before),
      { timeout: 10_000 },
    );
    const style = tokens(editor).find((t) => t.text === 'const')?.style ?? '';
    // One theme for both schemes: the same colour twice.
    const [, light] = /--tei-shiki-light:([^;]+)/.exec(style) ?? [];
    const [, dark] = /--tei-shiki-dark:([^;]+)/.exec(style) ?? [];
    expect(light).toBe(dark);
    expect(editor.can().undo()).toBe(false);
  });

  it('turns the theme background off on request', async () => {
    const { editor, root } = make(TS, { options: { background: false } });
    await coloured(editor);
    expect(root.hasAttribute('data-tei-shiki')).toBe(true);
    expect(root.hasAttribute('data-tei-shiki-background')).toBe(false);
  });

  it('marks diff lines', async () => {
    const { editor } = make('```diff-js\n+const a = 1\n-const b = 2\n const c = 3\n```');
    await coloured(editor);
    const all = tokens(editor);
    expect(all.filter((t) => t.type === 'inserted').map((t) => t.text)).toContain('+');
    expect(all.filter((t) => t.type === 'deleted').map((t) => t.text)).toContain('-');
    expect(all.find((t) => t.text === 'const')?.type).toBe('keyword');
  });

  it('survives hostile input: huge lines, huge blocks, odd text', async () => {
    const long = 'x'.repeat(5_000);
    const { editor } = make(`\`\`\`js\nconst a = 1\n${long}\n\`\`\``, {
      options: { maxLineLength: 1_000 },
    });
    await coloured(editor);
    // The long line is one plain token: present, not split into thousands.
    const longTokens = tokens(editor).filter((t) => t.text.includes('xxx'));
    expect(longTokens.map((t) => t.text).join('')).toBe(long);
    expect(longTokens.length).toBeLessThanOrEqual(2);

    const { editor: big } = make(`\`\`\`js\nconst a = 1\n${'a;'.repeat(60)}\n\`\`\``, {
      options: { maxLength: 50 },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tokens(big).every((t) => t.style === '')).toBe(true);

    const odd = '```js\n\u0000‮"unterminated `${\n\t\ttab\r\n```';
    const { editor: weird } = make(odd);
    await vi.waitFor(() =>
      expect(tokens(weird).some((t) => t.style.includes('--tei-shiki-'))).toBe(true),
    );
    expect(weird.getText()).toContain('unterminated');
  });

  it('declares itself by its directory name and needs CodeBlock', () => {
    expect(CodeShiki.name).toBe('@teispace/teieditor/code-shiki');
    const { editor } = make(TS);
    expect(editor.extension(CodeBlock)).toBeDefined();
  });
});

describe('shikiScopeType', () => {
  it('maps TextMate scopes to token kinds', () => {
    expect(shikiScopeType(['source.ts', 'keyword.control.flow.ts'])).toBe('keyword');
    expect(shikiScopeType(['source.ts', 'storage.type.ts'])).toBe('keyword');
    expect(shikiScopeType(['source.ts', 'keyword.operator.arithmetic.ts'])).toBe('operator');
    expect(shikiScopeType(['source.ts', 'constant.numeric.decimal.ts'])).toBe('number');
    expect(shikiScopeType(['source.ts', 'meta.function.ts', 'entity.name.function.ts'])).toBe(
      'function',
    );
    expect(shikiScopeType(['source.json', 'support.type.property-name.json'])).toBe('property');
    expect(shikiScopeType(['text.html', 'entity.name.tag.html'])).toBe('tag');
    expect(shikiScopeType(['text.html', 'entity.other.attribute-name.html'])).toBe('attr');
    expect(shikiScopeType(['source.ts', 'variable.other.readwrite.ts'])).toBe('variable');
    expect(shikiScopeType(['source.ts', 'punctuation.terminator.statement.ts'])).toBe(
      'punctuation',
    );
    expect(shikiScopeType(['source.ts'])).toBeNull();
    expect(shikiScopeType([])).toBeNull();
  });

  it('lets a string or comment own its punctuation, but not code embedded in it', () => {
    expect(
      shikiScopeType([
        'source.ts',
        'string.quoted.double.ts',
        'punctuation.definition.string.begin.ts',
      ]),
    ).toBe('string');
    expect(
      shikiScopeType(['source.ts', 'comment.line.ts', 'punctuation.definition.comment.ts']),
    ).toBe('comment');
    expect(shikiScopeType(['source.js', 'string.regexp.js'])).toBe('regex');
    expect(
      shikiScopeType([
        'source.ts',
        'string.template.ts',
        'meta.template.expression.ts',
        'variable.other.readwrite.ts',
      ]),
    ).toBe('variable');
  });
});

describe('shikiLanguages and shikiThemes', () => {
  it('lists every bundled language by name, or the ones asked for by id or alias', () => {
    const all = shikiLanguages();
    expect(all.length).toBeGreaterThan(200);
    const names = all.map(([, name]) => name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(shikiLanguages(['ts', 'python', 'typescript', 'not-a-language', 'rs'])).toEqual([
      ['typescript', 'TypeScript'],
      ['python', 'Python'],
      ['rust', 'Rust'],
    ]);
    // Hostile ids find nothing, and break nothing.
    expect(shikiLanguages(['constructor', '__proto__', ''])).toEqual([]);
  });

  it('lists the bundled themes with their kind', () => {
    const themes = shikiThemes();
    expect(themes.find(([id]) => id === 'github-dark')).toEqual([
      'github-dark',
      'GitHub Dark',
      'dark',
    ]);
  });
});
