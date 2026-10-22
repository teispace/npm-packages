import {
  $getRoot,
  $isElementNode,
  KEY_DOWN_COMMAND,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { PageBreak, PageBreakNode } from '../../src/extensions/page-break/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string, contentFormat?: 'markdown') {
  const editor = createTeiEditor({ extensions: [StarterKit, PageBreak], content, contentFormat });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const types = (editor: TeiEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .map((n: LexicalNode) => n.getType()),
  );

/** Put the caret at `offset` in the text of block `index`. */
const caret = (editor: TeiEditor, index: number, offset: number) =>
  editor.update(() => {
    const block = $getRoot().getChildAtIndex(index);
    if ($isElementNode(block)) (block.getFirstChild() as TextNode).select(offset, offset);
  });

const SAVED = '<p>One</p><hr data-tei-page-break=""><p>Two</p>';

describe('PageBreak', () => {
  it('saves as <hr data-tei-page-break>, and reads it back', () => {
    const editor = make('<p>One</p><hr data-tei-page-break><p>Two</p>');
    expect(types(editor)).toEqual(['paragraph', 'page-break', 'paragraph']);
    expect(editor.getHTML()).toBe(SAVED);
    expect(make(editor.getJSON()).getHTML()).toBe(SAVED);
  });

  it('reads Lexical’s and Google Docs’ page breaks; a plain rule stays a rule', () => {
    const editor = make(
      [
        '<hr data-lexical-page-break="true">',
        '<hr style="page-break-before:always;display:none">',
        '<hr style="break-after: page">',
        '<hr>',
      ].join(''),
    );
    expect(types(editor)).toEqual(['page-break', 'page-break', 'page-break', 'horizontalrule']);
  });

  it('in markdown, <!-- page-break --> on its own line; Pandoc’s \\newpage reads too', () => {
    const editor = make('One\n\n<!-- page-break -->\n\nTwo\n\n\\newpage\n\nThree', 'markdown');
    expect(types(editor)).toEqual([
      'paragraph',
      'page-break',
      'paragraph',
      'page-break',
      'paragraph',
    ]);
    expect(editor.getMarkdown()).toBe(
      'One\n\n<!-- page-break -->\n\nTwo\n\n<!-- page-break -->\n\nThree',
    );
  });

  it('one in a list item splits the list around it', () => {
    const editor = make('<ul><li>a<hr data-tei-page-break>b</li></ul>');
    expect(types(editor)).toEqual(['list', 'page-break', 'list']);
  });

  it('inserts at the caret, the caret going on after it; ⌘↵ does the same', () => {
    const editor = make('<p>OneTwo</p>');
    caret(editor, 0, 3);
    expect(editor.can().insertPageBreak()).toBe(true);
    editor.commands.insertPageBreak();
    expect(editor.getHTML()).toBe(SAVED);
    editor.update(() => $getRoot().selectStart());
    const mac = /Mac|iPhone|iPad/.test(navigator.platform ?? '');
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      cancelable: true,
      ...(mac ? { metaKey: true } : { ctrlKey: true }),
    });
    editor.lexical.update(() => editor.lexical.dispatchCommand(KEY_DOWN_COMMAND, event), {
      discrete: true,
    });
    expect(event.defaultPrevented).toBe(true);
    expect(types(editor)[0]).toBe('page-break');
    expect(editor.shortcut('pageBreak')?.at(-1)).toBe('Enter');
  });

  it('removes the one selected, or the one keyed', () => {
    const editor = make('<p>One</p><hr data-tei-page-break><p>Two</p><hr data-tei-page-break>');
    expect(editor.can().removePageBreak()).toBe(false);
    const [first, second] = editor.read(() =>
      $getRoot()
        .getChildren()
        .filter((n) => n instanceof PageBreakNode)
        .map((n) => n.getKey()),
    );
    editor.update(() => {
      const node = $getRoot().getChildAtIndex(1);
      node?.selectNext();
    });
    editor.commands.removePageBreak(second);
    expect(types(editor)).toEqual(['paragraph', 'page-break', 'paragraph']);
    expect(editor.commands.removePageBreak(second)).toBe(false);
    editor.commands.removePageBreak(first);
    expect(editor.getHTML()).toBe('<p>One</p><p>Two</p>');
  });

  it('shows a label in the editor’s language, and is in the slash and insert menus', () => {
    const editor = createTeiEditor({
      extensions: [StarterKit, PageBreak],
      content: '<hr data-tei-page-break>',
      messages: { 'block.pageBreak': 'Saut de page' },
    });
    editors.push(editor);
    const root = document.createElement('div');
    editor.lexical.setRootElement(root);
    const dom = root.querySelector('[data-tei-page-break]');
    expect(dom?.getAttribute('aria-label')).toBe('Saut de page');
    expect(dom?.textContent).toBe('Saut de page');
    expect(dom?.getAttribute('contenteditable')).toBe('false');
    expect(editor.items('slash').some((i) => i.id === 'pageBreak')).toBe(true);
    expect(editor.items('insert').some((i) => i.id === 'pageBreak')).toBe(true);
  });
});
