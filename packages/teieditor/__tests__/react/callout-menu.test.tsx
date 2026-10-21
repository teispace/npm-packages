import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Callout } from '../../src/extensions/callout/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { CalloutMenu, createReactTeiEditor, EditorContent } from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

function open() {
  const editor = createReactTeiEditor({
    extensions: [StarterKit, Callout],
    content: '<div data-tei-callout="note"><p>Read this</p></div><p>After</p>',
  });
  render(
    <EditorContent editor={editor}>
      <CalloutMenu />
    </EditorContent>,
  );
  const icon = () => document.querySelector('[data-tei-callout-icon]') as Element;
  const variant = () => document.querySelector('.tei-callout')?.getAttribute('data-variant');
  return { editor, icon, variant };
}

describe('CalloutMenu', () => {
  it('opens from the icon with the kind checked; picking one changes it', () => {
    const { icon, variant } = open();
    expect(screen.queryByRole('menu')).toBeNull();
    act(() => {
      fireEvent.click(icon());
    });
    const menu = screen.getByRole('menu', { name: 'Callout' });
    const radios = [...menu.querySelectorAll('[role="menuitemradio"]')];
    expect(radios.map((r) => r.textContent)).toEqual([
      'Note',
      'Tip',
      'Important',
      'Warning',
      'Caution',
    ]);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
    act(() => {
      fireEvent.click(radios[3] as Element);
    });
    expect(variant()).toBe('warning');
    expect(screen.queryByRole('menu')).toBeNull();
    // It opens again on the kind it is.
    act(() => {
      fireEvent.click(icon());
    });
    const again = screen.getByRole('menu', { name: 'Callout' });
    const active = again.getAttribute('aria-activedescendant');
    expect(active && document.getElementById(active)?.textContent).toBe('Warning');
  });

  it('takes the callout away, keeping its text', () => {
    const { editor, icon } = open();
    act(() => {
      fireEvent.click(icon());
    });
    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove callout' }));
    });
    expect(editor.getHTML()).toBe('<p>Read this</p><p>After</p>');
  });
});
