import { $getRoot, $getSelection, $isRangeSelection, type TextNode } from 'lexical';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Callout } from '../../src/extensions/callout/index.js';
import { $isCollapsibleNode, Collapsible } from '../../src/extensions/collapsible/index.js';
import {
  expandReplacement,
  type FindMatch,
  FindReplace,
  type FindReplaceConfig,
  type FindReplaceStorage,
  findPattern,
} from '../../src/extensions/find-replace/index.js';
import { Image } from '../../src/extensions/image/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { Table } from '../../src/extensions/table/index.js';
import { createTeiEditor, holdUi, type TeiEditor } from '../../src/index.js';

/** jsdom has no CSS Custom Highlight API: a stand-in with the same shape. */
class FakeHighlight extends Set<Range> {
  priority = 0;
}
const highlights = new Map<string, FakeHighlight>();

const editors: TeiEditor[] = [];
beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.Highlight = FakeHighlight;
  g.CSS = { ...((g.CSS as object) ?? {}), highlights };
});
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  highlights.clear();
  vi.useRealTimers();
  // Taking down a 10,000-paragraph editor takes a while on a busy machine.
}, 30_000);

function make(
  content: string,
  {
    editable = true,
    ui = true,
    config,
  }: { editable?: boolean; ui?: boolean; config?: Partial<FindReplaceConfig> } = {},
) {
  const editor = createTeiEditor({
    extensions: [
      StarterKit,
      Table,
      Callout,
      Collapsible,
      Image,
      config ? FindReplace.configure(config) : FindReplace,
    ],
    content,
    editable,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = String(editable);
  document.body.append(root);
  editor.lexical.setRootElement(root);
  const storage = editor.extension(FindReplace)?.output.storage as FindReplaceStorage;
  if (ui) holdUi(storage.ui);
  return { editor, storage, root };
}

/** Open the bar and search. */
function find(
  editor: TeiEditor,
  query: string,
  options?: Parameters<TeiEditor['commands']['setFindOptions']>[0],
) {
  editor.commands.openFind();
  if (options) editor.commands.setFindOptions(options);
  editor.commands.setFindQuery(query);
}

const texts = (storage: FindReplaceStorage) => storage.matches.value.map((m) => m.text);

/** The caret at `offset` in the text node whose text is `text`. */
const caret = (editor: TeiEditor, text: string, offset = 0) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text) as TextNode;
    node.select(offset, offset);
  });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('findPattern', () => {
  const plain = { caseSensitive: false, wholeWord: false, regex: false };
  it('escapes literal queries and ignores case unless asked', () => {
    const re = findPattern('a.b', plain) as RegExp;
    expect('A.B axb'.match(re)).toEqual(['A.B']);
    const exact = findPattern('a', { ...plain, caseSensitive: true }) as RegExp;
    expect('aA'.match(exact)).toEqual(['a']);
  });

  it('whole words know every script, not only ASCII', () => {
    const re = findPattern('cat', { ...plain, wholeWord: true }) as RegExp;
    expect('cat concat cats cat.'.match(re)).toEqual(['cat', 'cat']);
    const greek = findPattern('γάτα', { ...plain, wholeWord: true }) as RegExp;
    expect('γάταα γάτα'.match(greek)).toEqual(['γάτα']);
  });

  it('refuses a regular expression that does not parse, wrapped or not', () => {
    expect(findPattern('(a', { ...plain, regex: true })).toBe('invalid');
    expect(findPattern('a)(b', { ...plain, regex: true, wholeWord: true })).toBe('invalid');
    expect(findPattern('', plain)).toBeNull();
    // Legacy syntax still works where Unicode mode refuses it.
    expect(findPattern('\\-', { ...plain, regex: true })).toBeInstanceOf(RegExp);
  });
});

describe('expandReplacement', () => {
  const match: FindMatch = {
    start: { key: 'a', offset: 0 },
    end: { key: 'a', offset: 3 },
    keys: ['a'],
    text: 'x-y',
    groups: ['x', 'y'],
    named: { first: 'x' },
  };
  it('fills in groups, names, the match and dollars', () => {
    expect(expandReplacement('$2$1', match)).toBe('yx');
    expect(expandReplacement('[$&] $<first> $$1', match)).toBe('[x-y] x $1');
    expect(expandReplacement('$12', match)).toBe('x2');
    expect(expandReplacement('$9 $<nope>', match)).toBe('$9 $<nope>');
  });
});

describe('FindReplace: matching', () => {
  it('finds across formatting, never across blocks', () => {
    const { editor, storage } = make('<p>he<b>llo</b> world</p><p>hel</p><p>lo</p>');
    find(editor, 'hello');
    expect(texts(storage)).toEqual(['hello']);
    const [match] = storage.matches.value;
    expect(match?.keys).toHaveLength(2);
    expect(match?.start.offset).toBe(0);
    expect(match?.end.offset).toBe(3);
    find(editor, 'hello');
    editor.commands.setFindQuery('hello world');
    expect(texts(storage)).toEqual(['hello world']);
    editor.commands.setFindQuery('hello world hel');
    expect(texts(storage)).toEqual([]);
  });

  it('a link inside the line is part of it; a line break is not', () => {
    const { editor, storage } = make(
      '<p>see <a href="https://x.dev">the doc</a>s</p><p>a<br>b</p>',
    );
    find(editor, 'the docs');
    expect(texts(storage)).toEqual(['the docs']);
    editor.commands.setFindQuery('ab');
    expect(texts(storage)).toEqual([]);
  });

  it('matches case, whole words and regular expressions', () => {
    const { editor, storage } = make('<p>Cat cat concat CAT</p>');
    find(editor, 'cat');
    expect(storage.matches.value).toHaveLength(4);
    editor.commands.setFindOptions({ caseSensitive: true });
    expect(texts(storage)).toEqual(['cat', 'cat']);
    editor.commands.setFindOptions({ wholeWord: true });
    expect(texts(storage)).toEqual(['cat']);
    editor.commands.setFindOptions({ caseSensitive: false, wholeWord: false, regex: true });
    editor.commands.setFindQuery('c[a-z]+t');
    expect(texts(storage)).toEqual(['Cat', 'cat', 'concat', 'CAT']);
  });

  it('an invalid expression is an error, not a throw; fixing it clears it', () => {
    const { editor, storage } = make('<p>abc</p>');
    find(editor, 'a(', { regex: true });
    expect(storage.error.value).toBe('invalid');
    expect(storage.matches.value).toEqual([]);
    editor.commands.setFindQuery('a(b)');
    expect(storage.error.value).toBeNull();
    expect(texts(storage)).toEqual(['ab']);
  });

  it('skips empty matches, so `a*` or `^` cannot loop', () => {
    const { editor, storage } = make('<p>baab</p><p>😀😀</p>');
    find(editor, 'a*', { regex: true });
    expect(texts(storage)).toEqual(['aa']);
    editor.commands.setFindQuery('^');
    expect(texts(storage)).toEqual([]);
    editor.commands.setFindQuery('(?:)');
    expect(texts(storage)).toEqual([]);
  });

  it('refuses a nested quantifier before it can backtrack for ever', () => {
    const line = `${'a'.repeat(40)}!`;
    const { editor, storage } = make(`<p>${line}</p>`);
    const started = performance.now();
    for (const query of ['(a+)+$', '(?:a*)*b', '((ab)*c)+', '(x+){2,}']) {
      find(editor, query, { regex: true });
      expect(storage.error.value).toBe('timeout');
    }
    expect(performance.now() - started).toBeLessThan(1000);
    // Not nested, or not repeated: fine.
    for (const query of ['(a+)b', '(ab)+', '[(a+)]+', '\\(a+\\)+', '(a+)?']) {
      editor.commands.setFindQuery(query);
      expect(storage.error.value).toBeNull();
    }
  });

  it('stops a search that runs past the time limit', () => {
    const { editor, storage } = make(Array(50).fill('<p>a a a a a a</p>').join(''), {
      config: { timeout: -1 },
    });
    find(editor, 'a|b', { regex: true });
    expect(storage.error.value).toBe('timeout');
    expect(storage.matches.value.length).toBeLessThan(300);
  });

  it('stops at maxMatches and says so', () => {
    const { editor, storage } = make('<p>a a a a a</p><p>a a</p>', { config: { maxMatches: 3 } });
    find(editor, 'a');
    expect(storage.matches.value).toHaveLength(3);
    expect(storage.limited.value).toBe(true);
    editor.commands.setFindQuery('a a a a a');
    expect(storage.limited.value).toBe(false);
  });

  it('searches tables, callouts, sections (closed too) and captions', () => {
    const { editor, storage } = make(
      '<table><tr><td>needle one</td><td>x</td></tr></table>' +
        '<div data-tei-callout="note"><p>needle two</p></div>' +
        '<details><summary>needle three</summary><p>needle four</p></details>' +
        '<figure><img src="https://example.com/p.png" alt="p"><figcaption>needle five</figcaption></figure>',
    );
    find(editor, 'needle \\w+', { regex: true });
    expect(texts(storage)).toEqual([
      'needle one',
      'needle two',
      'needle three',
      'needle four',
      'needle five',
    ]);
  });

  it('starts at the caret, and steps forwards and back, wrapping', () => {
    const { editor, storage } = make('<p>x one</p><p>x two</p><p>x three</p>');
    caret(editor, 'x two', 1);
    find(editor, 'x');
    expect(storage.current.value).toBe(2);
    expect(editor.commands.findNext()).toBe(true);
    expect(storage.current.value).toBe(0);
    editor.commands.findPrevious();
    editor.commands.findPrevious();
    expect(storage.current.value).toBe(1);
    expect(editor.can().findNext()).toBe(true);
    editor.commands.setFindQuery('nothing');
    expect(storage.current.value).toBe(-1);
    expect(editor.commands.findNext()).toBe(false);
  });

  it('takes a short selection as the query', () => {
    const { editor, storage } = make('<p>pick this word</p><p>this</p>');
    editor.update(() => {
      const text = $getRoot().getAllTextNodes()[0] as TextNode;
      text.select(5, 9);
    });
    editor.commands.openFind();
    expect(storage.query.value).toBe('this');
    expect(storage.matches.value).toHaveLength(2);
    expect(storage.current.value).toBe(0);
  });

  it('opens only with a UI to show it; openReplace asks for the replace row', () => {
    const { editor, storage } = make('<p>a</p>', { ui: false });
    expect(editor.commands.openFind()).toBe(false);
    expect(editor.can().openFind()).toBe(false);
    holdUi(storage.ui);
    expect(editor.commands.openReplace()).toBe(true);
    expect(storage.open.value).toBe('replace');
    // ⌘F with the replace row open keeps it.
    editor.commands.openFind();
    expect(storage.open.value).toBe('replace');
    expect(editor.commands.closeFind()).toBe(true);
    expect(storage.open.value).toBe(false);
    expect(editor.commands.closeFind()).toBe(false);
  });

  it('binds ⌘F, ⌘⌥F, ⌘G and ⇧⌘G', () => {
    const { editor } = make('<p>a</p>');
    expect(editor.shortcut('find')?.join('')).toMatch(/F$/);
    expect(editor.shortcut('replace')).toBeDefined();
    expect(editor.shortcut('findNext')).toBeDefined();
    expect(editor.shortcut('findPrevious')).toBeDefined();
  });
});

describe('FindReplace: keeping up with edits', () => {
  it('finds again after an edit, keeping untouched blocks’ matches as they were', () => {
    const { editor, storage } = make('<p>cat one</p><p>cat two</p><p>dog</p>');
    find(editor, 'cat');
    const [first] = storage.matches.value;
    editor.commands.findNext();
    expect(storage.current.value).toBe(1);
    editor.update(() => {
      const dog = $getRoot().getLastChild();
      dog?.getFirstDescendant<TextNode>()?.setTextContent('cat dog');
    });
    expect(texts(storage)).toEqual(['cat', 'cat', 'cat']);
    // The first block was not searched again: its match is the same object.
    expect(storage.matches.value[0]).toBe(first);
    // The current match is still the second.
    expect(storage.current.value).toBe(1);
  });

  it('clears everything when closed, and finds nothing while closed', () => {
    const { editor, storage } = make('<p>cat</p>');
    find(editor, 'cat');
    expect(storage.matches.value).toHaveLength(1);
    editor.commands.closeFind();
    expect(storage.matches.value).toEqual([]);
    editor.update(() => {
      $getRoot().getFirstDescendant<TextNode>()?.setTextContent('cat cat');
    });
    expect(storage.matches.value).toEqual([]);
  });

  it('waits for a pause in typing in a large document', () => {
    vi.useFakeTimers();
    const { editor, storage } = make('<p>cat</p><p>cat</p><p>dog</p>', {
      config: { largeDocument: 2, debounce: 100 },
    });
    find(editor, 'cat');
    editor.update(() => {
      $getRoot().getLastChild()?.getFirstDescendant<TextNode>()?.setTextContent('cat');
    });
    expect(storage.matches.value).toHaveLength(2);
    vi.advanceTimersByTime(100);
    expect(storage.matches.value).toHaveLength(3);
  });

  // Timings are noisy on a busy machine; a retry absorbs a pause, while
  // quadratic growth fails every attempt.
  it('stays quick in a 10,000-paragraph document', { retry: 2, timeout: 30_000 }, () => {
    const lines = (count: number) =>
      Array.from({ length: count }, (_, i) => `<p>line ${i} with some words</p>`).join('');
    /** How long a first search takes in a document of `count` paragraphs. */
    const search = (count: number) => {
      const made = make(lines(count), { config: { maxMatches: 20_000 } });
      const started = performance.now();
      find(made.editor, 'some');
      return { ...made, ms: performance.now() - started };
    };
    // Time depends on the machine; how it grows does not. Five times the
    // paragraphs is about five times the work, never twenty-five.
    const small = search(2_000);
    expect(small.storage.matches.value).toHaveLength(2_000);
    small.editor.destroy();
    const { editor, storage, ms: first } = search(10_000);
    expect(storage.matches.value).toHaveLength(10_000);
    expect(first).toBeLessThan(small.ms * 10);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Over `largeDocument`: debounced, and only the changed block is searched
    // again. The best of three edits, so a pause of the machine's (a GC) in
    // one doesn't count; a full search each time would still be over.
    let fastest = Number.POSITIVE_INFINITY;
    for (const [i, text] of ['some some', 'some', 'some some'].entries()) {
      editor.update(() => {
        $getRoot().getFirstDescendant<TextNode>()?.setTextContent(text);
      });
      const later = performance.now();
      vi.runAllTimers();
      fastest = Math.min(fastest, performance.now() - later);
      expect(storage.matches.value).toHaveLength(i === 1 ? 10_000 : 10_001);
    }
    expect(fastest).toBeLessThan(first);
  });
});

describe('FindReplace: highlights', () => {
  it('paints matches and the current one, never touching the document', () => {
    const { editor, storage, root } = make('<p>he<b>llo</b> hello</p>');
    const html = root.innerHTML;
    find(editor, 'hello');
    const all = highlights.get('tei-find') as FakeHighlight;
    const current = highlights.get('tei-find-current') as FakeHighlight;
    expect(all.size).toBe(2);
    expect(current.size).toBe(1);
    expect(current.priority).toBe(1);
    const range = [...current][0] as Range;
    expect(range.toString()).toBe('hello');
    expect(range.startContainer).not.toBe(range.endContainer);
    expect(root.innerHTML).toBe(html);
    expect(editor.getHTML()).not.toContain('highlight');
    editor.commands.findNext();
    expect([...current][0]?.toString()).toBe('hello');
    expect([...current][0]).not.toBe(range);
    expect(storage.current.value).toBe(1);
    editor.commands.closeFind();
    expect(all.size).toBe(0);
    expect(current.size).toBe(0);
  });

  it('two editors share the highlights without clearing each other’s', () => {
    const one = make('<p>cat</p>');
    const two = make('<p>cat cat</p>');
    find(one.editor, 'cat');
    find(two.editor, 'cat');
    expect(highlights.get('tei-find')?.size).toBe(3);
    one.editor.commands.closeFind();
    expect(highlights.get('tei-find')?.size).toBe(2);
  });

  it('without the API there is no paint, but everything else works', () => {
    const g = globalThis as Record<string, unknown>;
    const saved = g.Highlight;
    delete g.Highlight;
    try {
      const { editor, storage } = make('<p>a a</p>');
      find(editor, 'a');
      expect(editor.commands.findNext()).toBe(true);
      expect(storage.current.value).toBe(1);
      expect(highlights.size).toBe(0);
    } finally {
      g.Highlight = saved;
    }
  });

  it('scrolls the current match into view, without focus', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { editor } = make('<p>a</p><p>b a</p>');
    find(editor, 'a');
    await tick();
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    scroll.mockClear();
    editor.commands.findNext();
    await tick();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.body);
  });

  it('opens a closed section to show a match in it', async () => {
    const { editor, storage } = make(
      '<p>a</p><details><summary>Shut</summary><p>hidden a</p></details>',
    );
    const open = () =>
      editor.read(() => $getRoot().getChildren().find($isCollapsibleNode)?.getOpen());
    expect(open()).toBe(false);
    find(editor, 'a');
    await tick();
    expect(open()).toBe(false);
    editor.commands.findNext();
    await tick();
    expect(open()).toBe(true);
    expect(storage.current.value).toBe(1);
    expect(texts(storage)).toEqual(['a', 'a']);
  });
});

describe('FindReplace: replacing', () => {
  it('replaces the current match with the first node’s formatting, then moves on', () => {
    const { editor, storage } = make('<p><b>he</b><i>llo</i> and hello</p>');
    find(editor, 'hello');
    editor.commands.setFindReplacement('bye');
    expect(editor.commands.replaceCurrent()).toBe(true);
    expect(editor.getText()).toBe('bye and hello');
    expect(editor.getHTML()).toMatch(/^<p><(b|strong)[^>]*>bye<\/(b|strong)> and hello<\/p>$/);
    expect(texts(storage)).toEqual(['hello']);
    expect(storage.current.value).toBe(0);
    editor.commands.replaceCurrent();
    expect(editor.getText()).toBe('bye and bye');
    expect(storage.matches.value).toEqual([]);
    expect(editor.commands.replaceCurrent()).toBe(false);
  });

  it('a replacement that matches again is not replaced again', () => {
    const { editor, storage } = make('<p>a a</p>');
    find(editor, 'a');
    editor.commands.setFindReplacement('aa');
    editor.commands.replaceCurrent();
    expect(editor.getText()).toBe('aa a');
    // The next is the one after what was put in.
    expect(storage.matches.value[storage.current.value]?.start.offset).toBe(3);
    editor.commands.replaceCurrent();
    expect(editor.getText()).toBe('aa aa');
  });

  it('replaces all as one undo step, and says how many', () => {
    const { editor, storage, root } = make('<p>cat <b>ca</b>t</p><p>cat</p>');
    find(editor, 'cat');
    editor.commands.setFindReplacement('dog');
    expect(editor.commands.replaceAll()).toBe(true);
    expect(editor.getText()).toBe('dog dog\n\ndog');
    expect(root.parentElement?.querySelector('[data-tei-live]')?.textContent).toBe('Replaced 3');
    expect(storage.matches.value).toEqual([]);
    editor.commands.undo();
    expect(editor.getText()).toBe('cat cat\n\ncat');
  });

  it('regular expression replacements use groups', () => {
    const { editor } = make('<p>Smith, John and Doe, Jane</p>');
    find(editor, '(\\w+), (?<first>\\w+)', { regex: true });
    editor.commands.setFindReplacement('$<first> $1');
    editor.commands.replaceAll();
    expect(editor.getText()).toBe('John Smith and Jane Doe');
  });

  it('a literal replacement keeps its dollars', () => {
    const { editor } = make('<p>price</p>');
    find(editor, 'price');
    editor.commands.setFindReplacement('$1 $&');
    editor.commands.replaceAll();
    expect(editor.getText()).toBe('$1 $&');
  });

  it('removes a link the match emptied, and keeps a caret that was inside valid', () => {
    const { editor } = make('<p>go <a href="https://x.dev">here</a> now</p>');
    caret(editor, 'here', 4);
    find(editor, 'go here ');
    editor.commands.setFindReplacement('');
    editor.commands.replaceAll();
    expect(editor.getHTML()).toBe('<p>now</p>');
    const valid = editor.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return true;
      const node = selection.anchor.getNode();
      return node.isAttached() && selection.anchor.offset <= node.getTextContentSize();
    });
    expect(valid).toBe(true);
  });

  it('skips a match that changed under it', () => {
    const { editor, storage } = make('<p>cat</p>', {
      config: { largeDocument: 0, debounce: 10_000 },
    });
    find(editor, 'cat');
    // Debounced (over largeDocument): the match is stale for now.
    editor.update(() => {
      $getRoot().getFirstDescendant<TextNode>()?.setTextContent('cot');
    });
    expect(storage.matches.value).toHaveLength(1);
    expect(editor.commands.replaceCurrent()).toBe(false);
    expect(editor.commands.replaceAll()).toBe(false);
    expect(editor.getText()).toBe('cot');
  });

  it('read-only: finds, but never replaces', () => {
    const { editor, storage } = make('<p>cat</p>', { editable: false });
    editor.commands.openReplace();
    expect(storage.open.value).toBe('find');
    editor.commands.setFindQuery('cat');
    expect(storage.matches.value).toHaveLength(1);
    expect(editor.can().replaceAll()).toBe(false);
    expect(editor.commands.replaceCurrent()).toBe(false);
    expect(editor.getText()).toBe('cat');
  });

  it('Escape: the selection goes to the current match', () => {
    const { editor } = make('<p>one cat two</p>');
    find(editor, 'cat');
    editor.commands.closeFind();
    const selected = editor.read(() => $getSelection()?.getTextContent());
    expect(selected).toBe('cat');
  });
});
