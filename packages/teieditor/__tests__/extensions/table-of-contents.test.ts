import { $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setExtensionOptions } from '../../src/core/define.js';
import { Callout } from '../../src/extensions/callout/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import {
  $getOutline,
  $isTocNode,
  getOutline,
  outlineTree,
  slugify,
  TableOfContents,
  type TableOfContentsOptions,
  uniqueIds,
} from '../../src/extensions/table-of-contents/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(
  content: string,
  { options = {}, rooted = true, markdown = false } = {} as {
    options?: Partial<TableOfContentsOptions>;
    rooted?: boolean;
    markdown?: boolean;
  },
) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Callout, TableOfContents.configure(options)],
    content,
    contentFormat: markdown ? 'markdown' : undefined,
  });
  editors.push(editor);
  if (rooted) {
    const root = document.createElement('div');
    root.contentEditable = 'true';
    document.body.append(root);
    editor.lexical.setRootElement(root);
  }
  return editor;
}

const outline = (editor: TeiEditor) =>
  (getOutline(editor)?.peek() ?? []).map((e) => `${e.level} ${e.text} #${e.id}`);

const DOC =
  '<h1>Intro</h1><p>Text</p><h2>Getting started</h2><h3>Install</h3><h2>Intro</h2><div data-tei-callout="note"><h3>Inside</h3></div><h2>Intro</h2>';

describe('slugs and trees', () => {
  it('slugify keeps letters of every script and drops punctuation', () => {
    expect(slugify('  Hello, World! ')).toBe('hello-world');
    expect(slugify('Überblick & Ziele')).toBe('überblick-ziele');
    expect(slugify('مقدمة الكتاب')).toBe('مقدمة-الكتاب');
    expect(slugify('C++ / Rust_tips -- 2024')).toBe('c-rust-tips-2024');
    expect(slugify('!!!')).toBe('');
  });

  it('uniqueIds numbers repeats, and steps round a literal clash', () => {
    expect(uniqueIds(['Intro', 'Intro', 'Intro-1', 'Intro', '', '?'])).toEqual([
      'intro',
      'intro-1',
      'intro-1-1',
      'intro-2',
      'section',
      'section-1',
    ]);
  });

  it('outlineTree nests deeper levels under the last shallower one', () => {
    const e = (level: number, text: string) => ({ key: text, level, text, id: text }) as never;
    const tree = outlineTree([e(2, 'a'), e(3, 'b'), e(4, 'c'), e(3, 'd'), e(1, 'f'), e(3, 'g')]);
    const shape = (nodes: ReturnType<typeof outlineTree>): unknown =>
      nodes.map((n) => (n.children.length ? [n.text, shape(n.children)] : n.text));
    expect(shape(tree)).toEqual([
      ['a', [['b', ['c']], 'd']],
      ['f', ['g']],
    ]);
  });
});

describe('TableOfContents: the outline', () => {
  it('lists every heading in order, nested ones too, with unique ids', () => {
    const editor = make(DOC);
    expect(outline(editor)).toEqual([
      '1 Intro #intro',
      '2 Getting started #getting-started',
      '3 Install #install',
      '2 Intro #intro-1',
      '3 Inside #inside',
      '2 Intro #intro-2',
    ]);
  });

  it('follows typing, new headings, removal and moves', () => {
    const editor = make('<h1>One</h1><p>p</p><h2>Two</h2>');
    const signal = getOutline(editor);
    const seen = vi.fn();
    const off = signal?.subscribe(seen);
    seen.mockClear();
    // Typing in a paragraph changes nothing.
    editor.update(() => ($getRoot().getAllTextNodes()[1] as TextNode).setTextContent('pp'));
    expect(seen).not.toHaveBeenCalled();
    // Typing in a heading changes its text and id.
    editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).setTextContent('One more'));
    expect(outline(editor)).toEqual(['1 One more #one-more', '2 Two #two']);
    expect(seen).toHaveBeenCalledTimes(1);
    // A new heading, then a move of the last block to the top.
    editor.update(() => {
      $getRoot().append($createHeadingNode('h3').append($createTextNode('Three')));
    });
    expect(outline(editor).at(-1)).toBe('3 Three #three');
    editor.update(() => {
      const root = $getRoot();
      root.getFirstChild()?.insertBefore(root.getLastChild() as never);
    });
    expect(outline(editor)[0]).toBe('3 Three #three');
    // A heading made a paragraph leaves the outline.
    editor.update(() => {
      const two = $getRoot()
        .getChildren()
        .find((n) => n.getTextContent() === 'Two');
      two?.replace($createParagraphNode().append($createTextNode('Two')));
    });
    expect(outline(editor)).toEqual(['3 Three #three', '1 One more #one-more']);
    off?.();
  });

  it('a block holding a heading moving reorders it', () => {
    const editor = make('<h2>A</h2><div data-tei-callout="note"><h2>B</h2></div>');
    expect(outline(editor).map((l) => l.split(' ')[1])).toEqual(['A', 'B']);
    editor.update(() => {
      const root = $getRoot();
      (root.getFirstChild() as never as { insertBefore(n: unknown): void }).insertBefore(
        root.getLastChild(),
      );
    });
    expect(outline(editor).map((l) => l.split(' ')[1])).toEqual(['B', 'A']);
  });

  it('works without a root element, and for a whole new state', () => {
    const editor = make('<h1>A</h1>', { rooted: false });
    expect(outline(editor)).toEqual(['1 A #a']);
    const other = make('<p>x</p><h2>B</h2>', { rooted: false });
    editor.lexical.setEditorState(other.lexical.getEditorState());
    expect(outline(editor)).toEqual(['2 B #b']);
  });

  it('lists only the levels asked for, and follows option changes', () => {
    const editor = make(DOC, { options: { levels: [1, 2] } });
    expect(outline(editor)).toHaveLength(4);
    setExtensionOptions(editor, TableOfContents, {
      levels: [3],
      slugify: (text: string) => text.toUpperCase(),
    });
    expect(outline(editor)).toEqual(['3 Install #INSTALL', '3 Inside #INSIDE']);
  });

  it('is cheap: 10,000 paragraphs, and typing in one does not walk them', () => {
    const editor = make('<h1>Top</h1>');
    editor.update(() => {
      const root = $getRoot();
      for (let i = 0; i < 10_000; i++) {
        root.append(
          i % 1000 === 0
            ? $createHeadingNode('h2').append($createTextNode(`Part ${i / 1000}`))
            : $createParagraphNode().append($createTextNode(`Line ${i}`)),
        );
      }
    });
    expect(outline(editor)).toHaveLength(11);
    const started = performance.now();
    for (let i = 0; i < 20; i++) {
      editor.update(() => {
        const last = $getRoot().getLastChild()?.getFirstChild() as TextNode;
        last.setTextContent(`${last.getTextContent()}x`);
      });
    }
    expect(performance.now() - started).toBeLessThan(500);
    expect(outline(editor)).toHaveLength(11);
  }, 30_000);
});

describe('TableOfContents: HTML, markdown and commands', () => {
  it('gives saved headings their ids, and can leave them off', () => {
    const editor = make('<h1>Intro</h1><h2>Intro</h2><h2>Next step</h2>');
    expect(editor.getHTML()).toBe(
      '<h1 id="intro">Intro</h1><h2 id="intro-1">Intro</h2><h2 id="next-step">Next step</h2>',
    );
    setExtensionOptions(editor, TableOfContents, { headingIds: false });
    expect(editor.getHTML()).toBe('<h1>Intro</h1><h2>Intro</h2><h2>Next step</h2>');
  });

  it('ids are right for HTML made inside the same update', () => {
    const editor = make('<h1>A</h1>');
    let html = '';
    editor.update(() => {
      $getRoot().append($createHeadingNode('h2').append($createTextNode('A')));
      html = editor.getHTML();
    });
    expect(html).toBe('<h1 id="a">A</h1><h2 id="a-1">A</h2>');
  });

  it('a table of contents block: inserted, live, saved as nested links, read back', () => {
    const editor = make('<p>Start</p><h1>One</h1><h2>Two</h2><h1>Three</h1>');
    editor.update(() => ($getRoot().getFirstChild() as never as { selectEnd(): void }).selectEnd());
    expect(editor.commands.insertTableOfContents()).toBe(true);
    const nav = () => editor.lexical.getRootElement()?.querySelector('nav[data-tei-toc]');
    expect(nav()?.getAttribute('aria-label')).toBe('Table of contents');
    expect(nav()?.getAttribute('contenteditable')).toBe('false');
    expect([...(nav()?.querySelectorAll('a') ?? [])].map((a) => a.textContent)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
    // Live: a new heading shows up in it.
    editor.update(() => {
      $getRoot().append($createHeadingNode('h2').append($createTextNode('Four')));
    });
    expect(nav()?.querySelectorAll('a')).toHaveLength(4);
    expect(nav()?.querySelector('li li a')?.getAttribute('href')).toBe('#two');

    const html = editor.getHTML();
    expect(html).toBe(
      '<p>Start</p><nav data-tei-toc="" aria-label="Table of contents"><ol><li><a href="#one">One</a><ol><li><a href="#two">Two</a></li></ol></li><li><a href="#three">Three</a><ol><li><a href="#four">Four</a></li></ol></li></ol></nav><h1 id="one">One</h1><h2 id="two">Two</h2><h1 id="three">Three</h1><h2 id="four">Four</h2>',
    );
    // Read back: one block, the links made again from the headings.
    const again = make(html);
    expect(
      again.read(() =>
        $getRoot()
          .getChildren()
          .map((n) => n.getType()),
      ),
    ).toEqual(['paragraph', 'table-of-contents', 'heading', 'heading', 'heading', 'heading']);
    expect(again.getHTML()).toBe(html);
    // Its text is not counted twice.
    expect(again.getText()).not.toMatch(/One[\s\S]*One/);
  });

  it('markdown [TOC]', () => {
    const editor = make('# A\n\n[TOC]\n\n## B', { markdown: true });
    expect(editor.read(() => $isTocNode($getRoot().getChildAtIndex(1)))).toBe(true);
    expect(editor.getMarkdown()).toBe('# A\n\n[TOC]\n\n## B');
  });

  it('removes a selected one, or one by key', () => {
    const editor = make('<nav data-tei-toc></nav><h1>A</h1>');
    const key = editor.read(() => $getRoot().getFirstChild()?.getKey() as string);
    expect(editor.can().removeTableOfContents()).toBe(false);
    expect(editor.commands.removeTableOfContents(key)).toBe(true);
    expect(editor.read(() => $getRoot().getChildrenSize())).toBe(1);
  });

  it('scrollToHeading puts the caret in it and scrolls it into view, by key or id', () => {
    const editor = make(DOC);
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const entry = getOutline(editor)?.peek()[2];
    expect(editor.commands.scrollToHeading(entry?.key as string)).toBe(true);
    expect(scrolled).toHaveBeenCalledTimes(1);
    const at = () =>
      editor.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return null;
        const node = selection.anchor.getNode();
        const heading = $isHeadingNode(node) ? node : node.getParent();
        return `${heading?.getTextContent()} ${selection.anchor.offset}`;
      });
    expect(at()).toBe('Install 0');
    expect(editor.commands.scrollToHeading('inside')).toBe(true);
    expect(at()).toBe('Inside 0');
    expect(editor.can().scrollToHeading('nowhere')).toBe(false);
    expect(editor.commands.scrollToHeading('nowhere')).toBe(false);
    // @ts-expect-error: jsdom has none; put it back as it was.
    delete Element.prototype.scrollIntoView;
  });

  it('a click on a link in the block goes to the heading, even read-only', () => {
    const editor = make('<nav data-tei-toc></nav><p>x</p><h2>Target</h2>');
    editor.setEditable(false);
    const link = editor.lexical.getRootElement()?.querySelector('nav a') as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(
      editor.read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) ? selection.anchor.getNode().getTextContent() : null;
      }),
    ).toBe('Target');
  });

  it('$getOutline works on any state', () => {
    const editor = make('<h1>A</h1><h4>B</h4>');
    expect(editor.read(() => $getOutline({ levels: [4] }).map((e) => e.id))).toEqual(['b']);
  });
});
