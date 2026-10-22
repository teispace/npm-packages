import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ShowInvisibles } from '../../src/extensions/show-invisibles/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

// jsdom lays nothing out: every box is at the origin, and ranges have none.
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect(10, 20, 5, 18);
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string, enabled = false) {
  const editor = createTeiEditor({
    extensions: [StarterKit, ShowInvisibles.configure({ enabled })],
    content,
  });
  editors.push(editor);
  const host = document.createElement('div');
  const root = document.createElement('div');
  root.contentEditable = 'true';
  host.append(root);
  document.body.append(host);
  editor.lexical.setRootElement(root);
  return { editor, root };
}

const marks = () =>
  [...document.querySelectorAll<HTMLElement>('.tei-invisible')]
    .filter((m) => !m.hidden)
    .map((m) => m.getAttribute('data-kind'));

describe('ShowInvisibles', () => {
  it('draws a mark for each space, tab, line break and block end, outside the document', async () => {
    const { editor, root } = make('<p>a b</p><p>x<br>y</p><p><br></p>');
    editor.update(() => {
      $getRoot().getFirstDescendant()?.selectEnd();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertRawText('\tc');
    });
    expect(editor.isActive('invisibles')).toBe(false);
    await frame();
    expect(document.querySelector('.tei-invisibles')).toBeNull();

    editor.commands.toggleInvisibles();
    expect(editor.isActive('invisibles')).toBe(true);
    expect(root.hasAttribute('data-tei-invisibles')).toBe(true);
    await frame();
    expect(marks().sort()).toEqual(['break', 'end', 'end', 'end', 'space', 'tab']);
    const layer = document.querySelector('.tei-invisibles') as HTMLElement;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(root.contains(layer)).toBe(false);
    // Marks carry no text: nothing to select or copy.
    expect(layer.textContent).toBe('');
    expect(editor.getHTML()).not.toMatch(/tei-invisible|[·¶↵→]/);

    // They follow edits.
    editor.update(() => {
      $getRoot().getLastDescendant()?.selectEnd();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText('1 2 3');
    });
    await frame();
    expect(marks().filter((m) => m === 'space')).toHaveLength(3);

    editor.commands.toggleInvisibles();
    expect(root.hasAttribute('data-tei-invisibles')).toBe(false);
    expect(document.querySelector('.tei-invisibles')).toBeNull();
  });

  it('starts on when configured so', async () => {
    make('<p>a b</p>', true);
    await frame();
    expect(marks()).toContain('space');
  });
});
