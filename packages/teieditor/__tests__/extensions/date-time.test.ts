import { $dfs } from '@lexical/utils';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_ENTER_COMMAND,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { $selectNode } from '../../src/core/slot-host.js';
import { holdUi } from '../../src/core/ui-request.js';
import {
  $getDateTime,
  $isDateTimeNode,
  DateTime,
  type DateTimeOptions,
  type DateTimeStorage,
  formatDateTime,
  localDay,
  parseDateTime,
} from '../../src/extensions/date-time/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(
  content: string | object = '<p>Hi</p>',
  { markdown = false, options = { locale: 'en-US' } as Partial<DateTimeOptions>, lang = '' } = {},
) {
  const editor = createTeiEditor({
    extensions: [StarterKit, DateTime.configure(options)],
    content,
    contentFormat: markdown ? 'markdown' : undefined,
  });
  editors.push(editor);
  const frame = document.createElement('div');
  if (lang) frame.lang = lang;
  const root = document.createElement('div');
  root.contentEditable = 'true';
  frame.append(root);
  document.body.append(frame);
  editor.lexical.setRootElement(root);
  return editor;
}

const dates = (editor: TeiEditor) =>
  editor.read(() =>
    $dfs()
      .map(({ node }) => node)
      .filter($isDateTimeNode)
      .map((n) => ({ key: n.getKey(), value: n.getValue(), showTime: n.getShowTime() })),
  );
const chip = () => document.querySelector('[data-tei-date-time]') as HTMLElement;
const storage = (editor: TeiEditor) =>
  editor.extension(DateTime)?.output.storage as DateTimeStorage;
const caret = (editor: TeiEditor, text: string, offset = text.length) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text) as TextNode;
    node.select(offset, offset);
  });

const timeFormat = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

describe('DateTime: values', () => {
  it('reads days, ISO times and Dates; refuses the rest', () => {
    expect(parseDateTime('2026-10-22')).toEqual({ value: '2026-10-22', showTime: false });
    expect(parseDateTime(' 2024-02-29 ')).toEqual({ value: '2024-02-29', showTime: false });
    expect(parseDateTime('2026-02-30')).toBeNull();
    expect(parseDateTime('2026-13-01')).toBeNull();
    expect(parseDateTime('2026-10-22T14:30:00Z')).toEqual({
      value: '2026-10-22T14:30:00.000Z',
      showTime: true,
    });
    expect(parseDateTime('2026-10-22T14:30+02:00')?.value).toBe('2026-10-22T12:30:00.000Z');
    expect(parseDateTime(new Date(Date.UTC(2026, 0, 2, 3, 4)))?.value).toBe(
      '2026-01-02T03:04:00.000Z',
    );
    for (const bad of [
      '',
      'tomorrow',
      'javascript:alert(1)',
      '2026-10-22T25:00',
      '22/10/2026',
      '2026-10-22<script>',
      '1e10',
      null,
      42,
      {},
      new Date(Number.NaN),
    ]) {
      expect(parseDateTime(bad)).toBeNull();
    }
  });

  it('turns a day into a time and back with `showTime`', () => {
    const local = new Date(2026, 9, 22, 9, 0);
    expect(parseDateTime('2026-10-22', true)).toEqual({
      value: local.toISOString(),
      showTime: true,
    });
    expect(parseDateTime(local.toISOString(), false)).toEqual({
      value: '2026-10-22',
      showTime: false,
    });
  });

  it('writes a day as that day in every time zone, and a time as the reader’s', () => {
    expect(formatDateTime({ value: '2026-01-01', showTime: false }, 'en-US')).toBe('Jan 1, 2026');
    expect(formatDateTime({ value: '2026-01-01', showTime: false }, 'de')).toBe('01.01.2026');
    const iso = '2026-10-22T14:30:00.000Z';
    expect(formatDateTime({ value: iso, showTime: true }, 'en-US')).toBe(timeFormat(iso));
    expect(
      formatDateTime(
        { value: '2026-01-01', showTime: false },
        'en-US',
        (date, showTime) => `${date.toISOString().slice(0, 10)}${showTime ? '!' : ''}`,
      ),
    ).toBe('2026-01-01');
  });
});

describe('DateTime: commands', () => {
  it('inserts today, tomorrow, now, or a value, at the caret', () => {
    const editor = make('<p>Due</p>');
    caret(editor, 'Due');
    expect(editor.commands.insertDateTime({ value: 'today' })).toBe(true);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(dates(editor)[0]).toMatchObject({ value: localDay(today), showTime: false });
    editor.commands.insertDateTime({ value: 'tomorrow' });
    editor.commands.insertDateTime({ value: 'now' });
    editor.commands.insertDateTime({ value: '2026-10-22T14:30:00Z' });
    editor.commands.insertDateTime();
    expect(dates(editor).map((d) => [d.value.length > 10 ? 'time' : d.value, d.showTime])).toEqual([
      [localDay(today), false],
      [localDay(tomorrow), false],
      ['time', true],
      ['time', true],
      [localDay(today), false],
    ]);
    expect(dates(editor)[3]?.value).toBe('2026-10-22T14:30:00.000Z');
  });

  it('refuses a value that is not a date, and needs a caret', () => {
    const editor = make('<p>Due</p>');
    caret(editor, 'Due');
    expect(editor.can().insertDateTime({ value: 'someday' })).toBe(false);
    expect(editor.commands.insertDateTime({ value: '2026-02-30' })).toBe(false);
    expect(dates(editor)).toEqual([]);
  });

  it('changes and removes the keyed or selected date', () => {
    const editor = make('<p>On <time datetime="2026-10-22">x</time>then</p>');
    const [{ key }] = dates(editor) as [{ key: string }];
    expect(editor.commands.setDateTime('2026-11-01', undefined, key)).toBe(true);
    expect(dates(editor)[0]).toMatchObject({ value: '2026-11-01', showTime: false });
    expect(editor.commands.setDateTime('nope', undefined, key)).toBe(false);
    expect(editor.commands.setDateTime('2026-11-01', true, key)).toBe(true);
    expect(dates(editor)[0]?.showTime).toBe(true);
    expect(editor.can().removeDateTime()).toBe(false);
    editor.update(() => {
      const node = $getDateTime(key);
      if (node) $selectNode(node);
    });
    expect(editor.isActive('dateTime')).toBe(true);
    expect(editor.commands.removeDateTime()).toBe(true);
    expect(editor.getHTML()).toBe('<p>On then</p>');
    // The caret stays where the date was.
    expect(
      editor.read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) ? selection.anchor.offset : null;
      }),
    ).toBe(3);
  });

  it('asks the UI for the picker: from the command, a click, or Enter on a selected date', () => {
    const editor = make('<p>On <time datetime="2026-10-22">x</time></p>');
    const [{ key }] = dates(editor) as [{ key: string }];
    expect(editor.can().openDateTimePicker(key)).toBe(false);
    expect(editor.commands.openDateTimePicker(key)).toBe(false);
    const { picker, pickerFor } = storage(editor);
    const release = holdUi(picker);
    expect(editor.commands.openDateTimePicker(key)).toBe(true);
    expect(pickerFor.peek()).toBe(key);
    const asked = () => picker.requests.peek();
    const before = asked();
    chip().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(asked()).toBe(before + 1);
    editor.update(() => {
      const node = $getDateTime(key);
      if (node) $selectNode(node);
    });
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    editor.lexical.update(() => editor.lexical.dispatchCommand(KEY_ENTER_COMMAND, enter), {
      discrete: true,
    });
    expect(asked()).toBe(before + 2);
    expect(enter.defaultPrevented).toBe(true);
    // `pick` opens it on a new one.
    caret(editor, 'On ');
    editor.commands.insertDateTime({ value: '2027-01-01', pick: true });
    expect(asked()).toBe(before + 3);
    expect(pickerFor.peek()).toBe(dates(editor).find((d) => d.value === '2027-01-01')?.key);
    release();
  });

  it('has slash items for a date, today, tomorrow and now', () => {
    const editor = make();
    expect(
      editor
        .items('slash')
        .filter((item) => item.command === 'insertDateTime')
        .map((item) => [item.id, editor.t(item.label)]),
    ).toEqual([
      ['insertDate', 'Date'],
      ['insertToday', 'Today'],
      ['insertTomorrow', 'Tomorrow'],
      ['insertNow', 'Now'],
    ]);
  });
});

describe('DateTime: HTML, JSON and Markdown', () => {
  const HTML = '<p>Meet on <time datetime="2026-10-22">Oct 22, 2026</time> at noon</p>';

  it('saves <time datetime> and reads any back; one with no real date stays text', () => {
    const editor = make(HTML);
    expect(dates(editor)).toMatchObject([{ value: '2026-10-22', showTime: false }]);
    expect(editor.getHTML()).toBe(HTML);
    const withTime = make('<p><time datetime="2026-10-22T14:30:00Z">later</time></p>');
    expect(withTime.getHTML()).toBe(
      `<p><time datetime="2026-10-22T14:30:00.000Z">${timeFormat('2026-10-22T14:30:00Z')}</time></p>`,
    );
    const bad = make(
      '<p>a <time datetime="soon">Soon</time> b <time>Later</time> c <time datetime="2026-02-30">Never</time></p>',
    );
    expect(dates(bad)).toEqual([]);
    expect(bad.getText()).toBe('a Soon b Later c Never');
  });

  it('keeps its value in JSON; junk in JSON is refused', () => {
    const editor = make(HTML);
    const json = editor.getJSON();
    const paragraph = json.root.children[0] as unknown as { children: object[] };
    expect(paragraph.children[1]).toMatchObject({
      type: 'date-time',
      value: '2026-10-22',
      showTime: false,
    });
    expect(make(json).getHTML()).toBe(HTML);
    const hostile = JSON.parse(JSON.stringify(json));
    hostile.root.children[0].children[1].value = '"><script>alert(1)</script>';
    expect(make(hostile).getHTML()).not.toMatch(/script/);
  });

  it('writes Markdown as inline <time>, which reads back', () => {
    const editor = make(HTML);
    const markdown = editor.getMarkdown();
    expect(markdown).toBe('Meet on <time datetime="2026-10-22">Oct 22, 2026</time> at noon');
    const again = make(markdown, { markdown: true });
    expect(dates(again)).toMatchObject([{ value: '2026-10-22', showTime: false }]);
    expect(again.getHTML()).toBe(HTML);
    const bad = make('Then <time datetime="nope">Soon</time>!', { markdown: true });
    expect(dates(bad)).toEqual([]);
    expect(bad.getText()).toBe('Then Soon!');
  });
});

describe('DateTime: in the editor', () => {
  it('a chip in the editor’s language: the option, else the nearest lang, else the browser’s', () => {
    make('<p><time datetime="2026-10-22">x</time></p>');
    expect(chip().textContent).toBe('Oct 22, 2026');
    expect(chip().getAttribute('datetime')).toBe('2026-10-22');
    expect(chip().getAttribute('contenteditable')).toBe('false');
    document.body.replaceChildren();
    make('<p><time datetime="2026-10-22">x</time></p>', { options: { locale: null }, lang: 'de' });
    expect(chip().textContent).toBe('22.10.2026');
    document.body.replaceChildren();
    make('<p><time datetime="2026-10-22">x</time></p>', {
      options: { format: (date) => `day ${date.getUTCDate()}` },
    });
    expect(chip().textContent).toBe('day 22');
  });

  it('updates the chip as its value changes', () => {
    const editor = make('<p><time datetime="2026-10-22">x</time></p>');
    const [{ key }] = dates(editor) as [{ key: string }];
    const before = chip();
    editor.commands.setDateTime('2027-03-04', false, key);
    expect(chip()).toBe(before);
    expect(chip().textContent).toBe('Mar 4, 2027');
    expect(chip().getAttribute('datetime')).toBe('2027-03-04');
  });
});
