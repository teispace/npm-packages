import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import katex from 'katex';
import { $getNearestNodeFromDOMNode, $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Equation, type EquationOptions } from '../../src/extensions/equation/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createReactTeiEditor, EditorContent, EquationEditor } from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

function open(
  content = '<p>Say <span data-tei-equation="inline" data-tex="x^2"></span>!</p>',
  options: Partial<EquationOptions> = { katex },
) {
  const editor = createReactTeiEditor({
    extensions: [StarterKit, Equation.configure(options)],
    content,
  });
  render(
    <EditorContent editor={editor}>
      <EquationEditor />
    </EditorContent>,
  );
  const equation = () => document.querySelector('[data-tei-equation]') as HTMLElement | null;
  return { editor, equation };
}

const dialog = () => screen.queryByRole('dialog', { name: 'Equation' });
const input = () => screen.getByLabelText('TeX') as HTMLTextAreaElement;
const preview = () =>
  document.querySelector('[data-tei-control="equation-preview"]') as HTMLElement;

describe('EquationEditor', () => {
  it('opens from a click on an equation, on its TeX, with a live preview', async () => {
    const { equation } = open();
    expect(dialog()).toBeNull();
    act(() => {
      equation()?.click();
    });
    expect(dialog()).not.toBeNull();
    expect(input().value).toBe('x^2');
    expect(document.activeElement).toBe(input());
    await waitFor(() => expect(preview().querySelector('math msup')).not.toBeNull());
    act(() => {
      fireEvent.change(input(), { target: { value: '\\frac{1}{2}' } });
    });
    expect(preview().querySelector('mfrac')).not.toBeNull();
    // Not applied until saved.
    expect(equation()?.getAttribute('data-tex')).toBe('x^2');
  });

  it('Enter saves and puts the caret after it; Escape cancels', async () => {
    const { editor, equation } = open();
    act(() => {
      equation()?.click();
    });
    act(() => {
      fireEvent.change(input(), { target: { value: 'a+b' } });
    });
    // Shift+Enter is a new line, not a save.
    act(() => {
      fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true });
    });
    expect(dialog()).not.toBeNull();
    act(() => {
      fireEvent.keyDown(input(), { key: 'Enter' });
    });
    expect(dialog()).toBeNull();
    expect(equation()?.getAttribute('data-tex')).toBe('a+b');
    expect(editor.read(() => $isRangeSelection($getSelection()))).toBe(true);
    act(() => {
      equation()?.click();
    });
    act(() => {
      fireEvent.change(input(), { target: { value: 'changed' } });
    });
    act(() => {
      fireEvent.keyDown(input(), { key: 'Escape' });
    });
    expect(dialog()).toBeNull();
    expect(equation()?.getAttribute('data-tex')).toBe('a+b');
  });

  it('shows KaTeX’s complaint for a mistake, and marks the field', async () => {
    const { equation } = open();
    act(() => {
      equation()?.click();
    });
    await waitFor(() => expect(preview().querySelector('math')).not.toBeNull());
    act(() => {
      fireEvent.change(input(), { target: { value: '\\frac{1' } });
    });
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/This TeX has a mistake/)).not.toBeNull();
  });

  it('without KaTeX, says the TeX shows as it is', async () => {
    const { equation } = open(undefined, { katex: null });
    act(() => {
      equation()?.click();
    });
    await waitFor(() => expect(screen.getByText(/KaTeX is not available/)).not.toBeNull());
    expect(preview().textContent).toBe('x^2');
  });

  it('a new empty equation opens the editor; cancelled, it goes', async () => {
    const { editor } = open('<p>Hi</p>');
    act(() => {
      editor.update(() => $getRoot().selectEnd());
      editor.commands.insertEquation({ inline: true });
    });
    expect(dialog()).not.toBeNull();
    expect(input().value).toBe('');
    act(() => {
      fireEvent.keyDown(input(), { key: 'Escape' });
    });
    expect(dialog()).toBeNull();
    expect(document.querySelector('[data-tei-equation]')).toBeNull();
    expect(editor.getHTML()).toBe('<p>Hi</p>');
  });

  it('saved empty, it goes; Done saves; the switch makes it a block', () => {
    const { editor, equation } = open();
    act(() => {
      equation()?.click();
    });
    act(() => {
      fireEvent.click(screen.getByRole('switch', { name: 'Display (block)' }));
    });
    expect(equation()?.getAttribute('data-tei-equation')).toBe('block');
    // Still open, on the same equation, now a block.
    expect(dialog()).not.toBeNull();
    act(() => {
      fireEvent.change(input(), { target: { value: 'y' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(equation()?.getAttribute('data-tex')).toBe('y');
    act(() => {
      equation()?.click();
    });
    act(() => {
      fireEvent.change(input(), { target: { value: '   ' } });
    });
    act(() => {
      fireEvent.keyDown(input(), { key: 'Enter' });
    });
    expect(equation()).toBeNull();
    expect(editor.getHTML()).toBe('<p>Say</p><p>!</p>');
  });

  it('Remove takes it out; it closes when the equation goes some other way', async () => {
    const { editor, equation } = open();
    act(() => {
      equation()?.click();
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove equation' }));
    });
    expect(dialog()).toBeNull();
    expect(equation()).toBeNull();
    act(() => {
      editor.commands.undo();
    });
    await waitFor(() => expect(equation()).not.toBeNull());
    act(() => {
      equation()?.click();
    });
    expect(dialog()).not.toBeNull();
    act(() => {
      editor.update(() => {
        const el = equation();
        if (el) $getNearestNodeFromDOMNode(el)?.remove();
      });
    });
    expect(dialog()).toBeNull();
  });
});
