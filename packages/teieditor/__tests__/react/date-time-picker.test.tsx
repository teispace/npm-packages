import { act, fireEvent, render, screen } from '@testing-library/react';
import { $getNearestNodeFromDOMNode } from 'lexical';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from '../../src/extensions/date-time/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createReactTeiEditor, DateTimePicker, EditorContent } from '../../src/react/index.js';

afterEach(() => document.body.replaceChildren());
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

function open(content = '<p>Due <time datetime="2026-10-22">x</time>!</p>') {
  const editor = createReactTeiEditor({
    extensions: [StarterKit, DateTime.configure({ locale: 'en-US' })],
    content,
  });
  render(
    <EditorContent editor={editor}>
      <DateTimePicker />
    </EditorContent>,
  );
  const chip = () => document.querySelector('[data-tei-date-time]') as HTMLElement;
  return { editor, chip };
}

const dialog = () => screen.queryByRole('dialog', { name: 'Date and time' });

describe('DateTimePicker', () => {
  it('opens from a click on a date, on its day', () => {
    const { chip } = open();
    expect(dialog()).toBeNull();
    act(() => {
      fireEvent.click(chip());
    });
    const day = screen.getByLabelText('Date') as HTMLInputElement;
    expect(dialog()).not.toBeNull();
    expect(day.type).toBe('date');
    expect(day.value).toBe('2026-10-22');
    expect(document.activeElement).toBe(day);
    expect((screen.getByRole('switch', { name: 'Include time' }) as HTMLInputElement).checked).toBe(
      false,
    );
    expect(screen.queryByLabelText('Time')).toBeNull();
  });

  it('a new day applies at once; with a time, it keeps the time', () => {
    const { editor, chip } = open();
    act(() => {
      fireEvent.click(chip());
    });
    act(() => {
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2027-01-05' } });
    });
    expect(chip().getAttribute('datetime')).toBe('2027-01-05');
    expect(chip().textContent).toBe('Jan 5, 2027');
    act(() => {
      fireEvent.click(screen.getByRole('switch', { name: 'Include time' }));
    });
    const time = screen.getByLabelText('Time') as HTMLInputElement;
    expect(time.value).toBe('09:00');
    act(() => {
      fireEvent.change(time, { target: { value: '14:45' } });
    });
    expect(chip().getAttribute('datetime')).toBe(new Date(2027, 0, 5, 14, 45).toISOString());
    // Half filled in (the browser reads it as empty): nothing changes.
    act(() => {
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    });
    expect(chip().getAttribute('datetime')).toBe(new Date(2027, 0, 5, 14, 45).toISOString());
    expect(editor.getHTML()).toContain(
      `<time datetime="${new Date(2027, 0, 5, 14, 45).toISOString()}">`,
    );
  });

  it('Done and Escape close it; Remove takes the date out', () => {
    const { editor, chip } = open();
    act(() => {
      fireEvent.click(chip());
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(dialog()).toBeNull();
    act(() => {
      fireEvent.click(chip());
    });
    act(() => {
      fireEvent.keyDown(screen.getByLabelText('Date'), { key: 'Escape' });
    });
    expect(dialog()).toBeNull();
    act(() => {
      fireEvent.click(chip());
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove date' }));
    });
    expect(dialog()).toBeNull();
    expect(editor.getHTML()).toBe('<p>Due !</p>');
  });

  it('closes when its date goes some other way (undo, delete)', () => {
    const { editor, chip } = open();
    act(() => {
      fireEvent.click(chip());
    });
    act(() => {
      editor.update(() => $getNearestNodeFromDOMNode(chip())?.remove());
    });
    expect(dialog()).toBeNull();
  });
});
