import { $getRoot, $getSelection, $isRangeSelection, type TextNode } from 'lexical';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Keywords, type KeywordsOptions } from '../../src/extensions/keywords/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, setExtensionOptions, type TeiEditor } from '../../src/index.js';

// jsdom has no CSS Custom Highlight API: a registry of sets stands in for it.
type Registry = Map<string, Set<StaticRange>>;
const g = globalThis as { CSS?: unknown; Highlight?: unknown };
let registry: Registry;
beforeEach(() => {
  registry = new Map();
  g.CSS = { highlights: registry };
  g.Highlight = class extends Set<StaticRange> {};
});

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  delete g.CSS;
  delete g.Highlight;
});

function make(content: string, options: Partial<KeywordsOptions>) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Keywords.configure(options)],
    content,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/** Each highlight's marked text, in order. */
const marked = (name = 'tei-keyword') =>
  [...(registry.get(name) ?? [])].map((range) =>
    (range.startContainer as Text).data.slice(range.startOffset, range.endOffset),
  );

const typeAt = (editor: TeiEditor, text: string, chars: string) => {
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text) as TextNode;
    node.select(text.length, text.length);
  });
  for (const char of chars) {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(char);
    });
  }
};

describe('Keywords', () => {
  it('marks whole words, any case, without touching the document', () => {
    const editor = make('<p>Congrats! congratulations, CONGRATS</p>', {
      keywords: ['congrats'],
    });
    expect(marked()).toEqual(['Congrats', 'CONGRATS']);
    expect(editor.getHTML()).toBe('<p>Congrats! congratulations, CONGRATS</p>');
    expect(JSON.stringify(editor.getJSON())).not.toContain('keyword');
  });

  it('patterns, and rules with their own highlight; exact case when asked', () => {
    make('<p>TODO fix #12 and todo #7</p>', {
      keywords: [/#\d+/, { match: 'TODO', className: 'todo' }],
      caseSensitive: true,
    });
    expect(marked()).toEqual(['#12', '#7']);
    expect(marked('todo')).toEqual(['TODO']);
  });

  it('follows typing: a keyword finished is marked, one broken is not', () => {
    const editor = make('<p>hello wor</p><p>world</p>', { keywords: ['world'] });
    expect(marked()).toEqual(['world']);
    typeAt(editor, 'hello wor', 'ld');
    expect(marked()).toEqual(['world', 'world']);
    typeAt(editor, 'world', 's');
    expect(marked()).toEqual(['world']);
  });

  it('looks again only at text that changed, in a long document', () => {
    const paragraphs = Array.from({ length: 2000 }, (_, i) => `<p>keyword ${i}</p>`).join('');
    const editor = make(paragraphs, { keywords: ['keyword'] });
    expect(registry.get('tei-keyword')?.size).toBe(2000);
    const before = new Set(registry.get('tei-keyword'));
    typeAt(editor, 'keyword 1999', ' keyword');
    const after = registry.get('tei-keyword') ?? new Set();
    expect(after.size).toBe(2001);
    // Every range but the edited paragraph's is the same object as before.
    expect([...after].filter((range) => !before.has(range))).toHaveLength(2);
  });

  it('skips code unless asked; forgets removed text', () => {
    const editor = make('<p>key <code>key</code></p><pre><code>key</code></pre>', {
      keywords: ['key'],
    });
    expect(marked()).toEqual(['key']);
    setExtensionOptions(editor, Keywords, { inCode: true });
    expect(marked()).toHaveLength(3);
    editor.update(() => $getRoot().clear());
    expect(registry.has('tei-keyword')).toBe(false);
  });

  it('changes keywords live, and clears its marks when destroyed', () => {
    const editor = make('<p>alpha beta</p>', { keywords: ['alpha'] });
    expect(marked()).toEqual(['alpha']);
    setExtensionOptions(editor, Keywords, { keywords: ['beta'] });
    expect(marked()).toEqual(['beta']);
    editor.destroy();
    expect(registry.size).toBe(0);
  });

  it('does nothing where the browser has no highlight API', () => {
    delete g.CSS;
    const editor = make('<p>alpha</p>', { keywords: ['alpha'] });
    expect(editor.getText()).toBe('alpha');
    expect(registry.size).toBe(0);
  });
});
