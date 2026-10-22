import { act, fireEvent, render, screen } from '@testing-library/react';
import { $getRoot, $getSelection, $isRangeSelection, type TextNode } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setExtensionOptions } from '../../src/core/define.js';
import { CharacterCount } from '../../src/extensions/character-count/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { TableOfContents } from '../../src/extensions/table-of-contents/index.js';
import {
  createReactTeiEditor,
  EditorContent,
  limitState,
  TableOfContentsPanel,
  WordCount,
} from '../../src/react/index.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const DOC = '<h1>Intro</h1><p>Some words here</p><h2>Details</h2><h3>Deep</h3><h1>End</h1>';

function mount(
  ui: (editor: ReturnType<typeof createReactTeiEditor>) => React.ReactNode,
  content = DOC,
  ext = {},
) {
  const editor = createReactTeiEditor({
    extensions: [StarterKit, TableOfContents, CharacterCount.configure(ext)],
    content,
  });
  render(<EditorContent editor={editor}>{ui(editor)}</EditorContent>);
  return editor;
}

describe('TableOfContentsPanel', () => {
  it('is a nav of nested links that follows the headings', () => {
    const editor = mount(() => <TableOfContentsPanel />);
    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    const links = () =>
      [...nav.querySelectorAll('a')].map((a) => `${a.getAttribute('href')} ${a.textContent}`);
    expect(links()).toEqual(['#intro Intro', '#details Details', '#deep Deep', '#end End']);
    // Nested: Deep sits in Details' list, inside Intro's.
    expect(nav.querySelector('li li li a')?.textContent).toBe('Deep');
    act(() => {
      editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).setTextContent('Start'));
    });
    expect(links()[0]).toBe('#start Start');
  });

  it('a click puts the caret in the heading; arrows move between links', () => {
    const editor = mount(() => <TableOfContentsPanel />);
    const nav = screen.getByRole('navigation');
    const link = screen.getByRole('link', { name: 'Details' });
    act(() => {
      fireEvent.click(link);
    });
    expect(
      editor.read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) ? selection.anchor.getNode().getTextContent() : null;
      }),
    ).toBe('Details');
    link.focus();
    fireEvent.keyDown(link, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Deep');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement?.textContent).toBe('Intro');
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement?.textContent).toBe('End');
    expect(nav.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
  });

  it('marks the heading in view from an IntersectionObserver', () => {
    let fire = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: () => void) {
          fire = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const tops: Record<string, number> = { Intro: -400, Details: -20, Deep: 300, End: 900 };
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return { top: tops[this.textContent ?? ''] ?? 0 } as DOMRect;
      });
    mount(() => <TableOfContentsPanel />);
    const current = () => document.querySelector('[aria-current="location"]')?.textContent;
    expect(current()).toBe('Details');
    tops.Deep = 50;
    act(() => fire());
    expect(current()).toBe('Deep');
    rect.mockRestore();
  });

  it('folds behind a button when narrow, and says when there are no headings', () => {
    mount(() => <TableOfContentsPanel collapsible />, '<p>No headings</p>');
    const toggle = screen.getByRole('button', { name: 'Table of contents' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const body = document.getElementById(toggle.getAttribute('aria-controls') as string);
    expect(body?.hidden).toBe(true);
    act(() => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(body?.hidden).toBe(false);
    expect(body?.textContent).toBe('Headings you add show here');
  });

  it('works outside the editor frame with an editor prop', () => {
    const editor = createReactTeiEditor({
      extensions: [StarterKit, TableOfContents],
      content: DOC,
    });
    render(<TableOfContentsPanel editor={editor} title="On this page" />);
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeTruthy();
  });
});

describe('WordCount', () => {
  it('shows words and characters, formatted, and the selection', () => {
    const editor = mount(
      () => <WordCount show={['words', 'characters', 'readingMinutes']} locale="en" />,
      `<p>${'word '.repeat(1200)}</p>`,
      {
        countSelection: true,
      },
    );
    act(() => editor.extension(CharacterCount)?.output.storage.flush());
    const group = screen.getByRole('group', { name: 'Document statistics' });
    expect(group.textContent).toContain('1,200 words');
    expect(group.textContent).toContain('5,999 characters');
    expect(group.textContent).toContain('6 min read');
    act(() => {
      editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).select(0, 4));
    });
    expect(group.textContent).toContain('1 word selected');
  });

  it('shows n / limit, warns near it, and tells screen readers only on a change of state', () => {
    const editor = mount(() => <WordCount />, '<p>abc</p>', { limit: 10 });
    const limit = () => document.querySelector('.tei-word-count-limit') as HTMLElement;
    const live = () => document.querySelector('[aria-live="polite"]')?.textContent;
    expect(limit().textContent).toContain('3 / 10');
    expect(limit().dataset.state).toBe('under');
    expect(live()).toBe('');
    act(() => {
      editor.update(() => {
        ($getRoot().getAllTextNodes()[0] as TextNode).select(3, 3);
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText('defghi');
      });
    });
    expect(limit().dataset.state).toBe('near');
    expect(live()).toBe('1 left');
    act(() => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText('jklm');
      });
    });
    // Cut at the limit.
    expect(editor.getText()).toBe('abcdefghij');
    expect(limit().dataset.state).toBe('reached');
    expect(live()).toBe('Limit reached');
    act(() => setExtensionOptions(editor, CharacterCount, { limit: null }));
    expect(document.querySelector('.tei-word-count-limit')).toBeNull();
  });

  it('limitState', () => {
    expect(limitState(5, null)).toBe('under');
    expect(limitState(80, 100)).toBe('under');
    expect(limitState(90, 100)).toBe('near');
    expect(limitState(100, 100)).toBe('reached');
    expect(limitState(101, 100)).toBe('over');
    expect(limitState(0, 1)).toBe('near');
  });
});
