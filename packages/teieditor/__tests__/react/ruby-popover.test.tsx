import { act, fireEvent, render, screen } from '@testing-library/react';
import { $getRoot, type TextNode } from 'lexical';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Ruby } from '../../src/extensions/ruby/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createReactTeiEditor, EditorContent, RubyPopover } from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

function open(content: string) {
  const editor = createReactTeiEditor({ extensions: [StarterKit, Ruby], content });
  render(
    <EditorContent editor={editor}>
      <RubyPopover />
    </EditorContent>,
  );
  return editor;
}

const dialog = () => screen.queryByRole('dialog');
const field = () => screen.getByRole('textbox', { name: 'Reading (furigana, pinyin)' });

describe('RubyPopover', () => {
  it('annotates the selection; opens again on the ruby with its reading', () => {
    const editor = open('<p>漢字です</p>');
    act(() => {
      editor.update(() => ($getRoot().getAllTextNodes()[0] as TextNode).select(0, 2));
    });
    expect(dialog()).toBeNull();
    act(() => {
      editor.commands.openRubyEditor();
    });
    expect(dialog()?.getAttribute('aria-label')).toBe('Ruby annotation');
    expect(document.activeElement).toBe(field());
    act(() => {
      fireEvent.change(field(), { target: { value: 'かんじ' } });
      fireEvent.submit(field().closest('form') as HTMLFormElement);
    });
    expect(dialog()).toBeNull();
    expect(editor.getHTML()).toBe('<p><ruby>漢字<rt>かんじ</rt></ruby>です</p>');
    // A click on the reading edits it.
    act(() => {
      fireEvent.click(document.querySelector('rt') as Element);
    });
    expect(dialog()?.getAttribute('aria-label')).toBe('Edit annotation');
    expect(field()).toHaveProperty('value', 'かんじ');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove annotation' }));
    });
    expect(editor.getHTML()).toBe('<p>漢字です</p>');
  });

  it('an empty reading takes the annotation off; Escape closes with nothing changed', () => {
    const editor = open('<p><ruby>漢<rt>kan</rt></ruby></p>');
    act(() => {
      editor.update(() => $getRoot().getAllTextNodes()[0]?.select(0, 0));
      editor.commands.openRubyEditor();
    });
    act(() => {
      fireEvent.keyDown(field(), { key: 'Escape' });
    });
    expect(dialog()).toBeNull();
    expect(editor.getHTML()).toBe('<p><ruby>漢<rt>kan</rt></ruby></p>');
    act(() => {
      editor.commands.openRubyEditor();
    });
    act(() => {
      fireEvent.change(field(), { target: { value: ' ' } });
      fireEvent.submit(field().closest('form') as HTMLFormElement);
    });
    expect(editor.getHTML()).toBe('<p>漢</p>');
  });
});
