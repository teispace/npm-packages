import { $getRoot, $getSelection, $isNodeSelection, type LexicalNode } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { setExtensionOptions } from '../../src/core/define.js';
import { $selectNode } from '../../src/core/slot-host.js';
import {
  $getPoll,
  $isPollNode,
  cleanOptions,
  Poll,
  type PollNode,
  parseVoters,
} from '../../src/extensions/poll/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(
  content: string | object = '<p>Hi</p>',
  { markdown = false, editable = true, voter = 'me' as string | null, multiple = false } = {},
) {
  const editor = createTeiEditor({
    extensions: [
      StarterKit,
      Poll.configure({ voter: voter === null ? null : () => voter, multiple }),
    ],
    content,
    contentFormat: markdown ? 'markdown' : undefined,
    editable,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = String(editable);
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const polls = (editor: TeiEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .filter((n: LexicalNode): n is PollNode => $isPollNode(n))
      .map((n) => ({ key: n.getKey(), question: n.getQuestion(), options: n.getOptions() })),
  );
const first = (editor: TeiEditor) => {
  const poll = polls(editor)[0];
  if (!poll) throw new Error('no poll');
  return poll;
};
const box = () => document.querySelector('[data-tei-poll]') as HTMLElement;

const SAVED =
  '<div data-tei-poll=""><p data-tei-poll-question="">Lunch?</p><ul data-tei-poll-options="">' +
  '<li data-tei-poll-option="" data-voters="[&quot;a&quot;,&quot;b&quot;]"><span data-tei-poll-mark=""></span><span data-tei-poll-label="">Pizza</span><span data-tei-poll-count="">2 · 67%</span><meter data-tei-poll-meter="" min="0" max="3" value="2">67%</meter></li>' +
  '<li data-tei-poll-option="" data-voters="[&quot;c&quot;]"><span data-tei-poll-mark=""></span><span data-tei-poll-label="">Soup</span><span data-tei-poll-count="">1 · 33%</span><meter data-tei-poll-meter="" min="0" max="3" value="1">33%</meter></li>' +
  '</ul><p data-tei-poll-footer=""><span data-tei-poll-total="">3 votes</span></p></div>';

describe('Poll: commands', () => {
  it('inserts a poll with two empty answers, or the ones given', () => {
    const editor = make();
    editor.chain().focus('end').insertPoll().run();
    expect(first(editor)).toMatchObject({
      question: '',
      options: [
        { text: '', voters: [] },
        { text: '', voters: [] },
      ],
    });
    editor.commands.insertPoll('Lunch?', ['Pizza', 'Soup', 'Salad']);
    expect(polls(editor)[1]?.options.map((o) => o.text)).toEqual(['Pizza', 'Soup', 'Salad']);
  });

  it('edits the question and answers, two to ten of them', () => {
    const editor = make();
    editor.chain().focus('end').insertPoll('Q', ['a', 'b']).run();
    const { key } = first(editor);
    expect(editor.commands.setPollQuestion('Lunch?', key)).toBe(true);
    expect(editor.commands.setPollOption(1, 'Soup', key)).toBe(true);
    expect(editor.commands.setPollOption(5, 'x', key)).toBe(false);
    expect(editor.can().removePollOption(0, key)).toBe(false);
    expect(editor.commands.removePollOption(0, key)).toBe(false);
    for (let i = 0; i < 8; i++) expect(editor.commands.addPollOption(`o${i}`, key)).toBe(true);
    expect(first(editor).options).toHaveLength(10);
    expect(editor.can().addPollOption(undefined, key)).toBe(false);
    expect(editor.commands.addPollOption('eleven', key)).toBe(false);
    expect(editor.commands.removePollOption(2, key)).toBe(true);
    expect(first(editor).question).toBe('Lunch?');
    expect(first(editor).options.map((o) => o.text)).toEqual([
      'a',
      'Soup',
      'o1',
      'o2',
      'o3',
      'o4',
      'o5',
      'o6',
      'o7',
    ]);
  });

  it('votes as the configured voter; a vote moves, or adds with `multiple`', () => {
    const editor = make();
    editor.chain().focus('end').insertPoll('Q', ['a', 'b']).run();
    const { key } = first(editor);
    editor.commands.togglePollVote(0, key);
    expect(first(editor).options.map((o) => o.voters)).toEqual([['me'], []]);
    editor.commands.togglePollVote(1, key);
    expect(first(editor).options.map((o) => o.voters)).toEqual([[], ['me']]);
    editor.commands.togglePollVote(1, key);
    expect(first(editor).options.map((o) => o.voters)).toEqual([[], []]);
    expect(editor.commands.togglePollVote(7, key)).toBe(false);

    setExtensionOptions(editor, Poll, { multiple: true });
    editor.commands.togglePollVote(0, key);
    editor.commands.togglePollVote(1, key);
    expect(first(editor).options.map((o) => o.voters)).toEqual([['me'], ['me']]);
  });

  it('votes as a random id of its own without a voter, the same one each time', () => {
    const editor = make(undefined, { voter: null });
    editor.chain().focus('end').insertPoll('Q', ['a', 'b']).run();
    const { key } = first(editor);
    editor.commands.togglePollVote(0, key);
    const [id] = first(editor).options[0]?.voters ?? [];
    expect(id).toMatch(/^anon-[0-9a-f]{24}$/);
    editor.commands.togglePollVote(1, key);
    expect(first(editor).options[1]?.voters).toEqual([id]);
  });

  it('acts on the selected poll without a key, and removes it', () => {
    const editor = make(`<p>Before</p>${SAVED}<p>After</p>`);
    expect(editor.can().removePoll()).toBe(false);
    const { key } = first(editor);
    editor.update(() => {
      const node = $getPoll(key);
      if (node) $selectNode(node);
    });
    expect(editor.isActive('poll')).toBe(true);
    expect(editor.commands.togglePollVote(1)).toBe(true);
    expect(first(editor).options[1]?.voters).toEqual(['c', 'me']);
    expect(editor.commands.removePoll()).toBe(true);
    expect(polls(editor)).toEqual([]);
    expect(editor.getHTML()).toBe('<p>Before</p><p>After</p>');
  });
});

describe('Poll: HTML, JSON and Markdown', () => {
  it('saves its results with each answer’s voters, and reads that back whole', () => {
    const editor = make(SAVED);
    expect(first(editor)).toMatchObject({
      question: 'Lunch?',
      options: [
        { text: 'Pizza', voters: ['a', 'b'] },
        { text: 'Soup', voters: ['c'] },
      ],
    });
    expect(editor.getHTML()).toBe(SAVED);
    const again = make(editor.getHTML());
    expect(first(again)).toEqual({ ...first(editor), key: first(again).key });
  });

  it('keeps everything in JSON', () => {
    const editor = make(SAVED);
    const json = editor.getJSON();
    expect(json.root.children[0]).toMatchObject({
      type: 'poll',
      question: 'Lunch?',
      options: [
        { text: 'Pizza', voters: ['a', 'b'] },
        { text: 'Soup', voters: ['c'] },
      ],
    });
    expect(make(json).getHTML()).toBe(SAVED);
  });

  it('writes Markdown a reader can follow (votes counted, voters left out)', () => {
    const editor = make(SAVED);
    expect(editor.getMarkdown()).toBe('**Poll:** Lunch?\n\n- Pizza (2)\n- Soup (1)');
  });

  it('refuses hostile and malformed voters, and keeps answers within bounds', () => {
    for (const bad of ['not json', '{"__proto__":{"x":1}}', '[1,2,{"a":"b"}]', '"a"', 'null']) {
      expect(parseVoters(bad)).toEqual([]);
    }
    expect(parseVoters(`["a","a","",${JSON.stringify('x'.repeat(300))},"b"]`)).toEqual(['a', 'b']);
    expect(parseVoters(`[${'"x",'.repeat(600_000)}"y"]`)).toEqual([]);
    expect(cleanOptions(null)).toHaveLength(2);
    expect(cleanOptions(Array.from({ length: 30 }, (_, i) => `o${i}`))).toHaveLength(10);
    expect(cleanOptions([{ text: 5, voters: 'a' }, 'b'])).toEqual([
      { text: '', voters: [] },
      { text: 'b', voters: [] },
    ]);

    const hostile =
      '<div data-tei-poll><p data-tei-poll-question><img src=x onerror="alert(1)">Q</p><ul>' +
      '<li data-tei-poll-option data-voters="{&quot;constructor&quot;:1}"><span data-tei-poll-label>A<script>alert(2)</script></span></li>' +
      '<li data-tei-poll-option data-voters="[&quot;ok&quot;,7]">B</li></ul></div>';
    const editor = make(hostile);
    expect(first(editor)).toMatchObject({
      question: 'Q',
      options: [
        { text: 'A', voters: [] },
        { text: 'B', voters: ['ok'] },
      ],
    });
    expect(editor.getHTML()).not.toMatch(/script|onerror|alert/);
    // A JSON poll with junk in it is cleaned the same way.
    const json = make({
      root: {
        type: 'root',
        version: 1,
        children: [{ type: 'poll', version: 1, question: 7, options: 'nope' }],
        direction: null,
        format: '',
        indent: 0,
      },
    });
    expect(first(json)).toMatchObject({ question: '', options: [{ text: '' }, { text: '' }] });
  });

  it('a lone answer gets a second', () => {
    const editor = make('<div data-tei-poll><ul><li data-tei-poll-option>Only</li></ul></div>');
    expect(first(editor).options.map((o) => o.text)).toEqual(['Only', '']);
  });
});

describe('Poll: in the editor', () => {
  it('draws inputs while editing, and results read-only', () => {
    const editor = make(SAVED);
    const poll = box();
    expect(poll.getAttribute('role')).toBe('group');
    expect(poll.getAttribute('aria-label')).toBe('Poll');
    const question = poll.querySelector('input[data-tei-poll-question]') as HTMLInputElement;
    expect(question.value).toBe('Lunch?');
    expect(question.getAttribute('aria-label')).toBe('Ask a question');
    const labels = [...poll.querySelectorAll<HTMLInputElement>('input[data-tei-poll-label]')];
    expect(labels.map((i) => i.value)).toEqual(['Pizza', 'Soup']);
    expect(labels.map((i) => i.getAttribute('aria-label'))).toEqual(['Option 1', 'Option 2']);
    expect([...poll.querySelectorAll('[data-tei-poll-count]')].map((c) => c.textContent)).toEqual([
      '2 · 67%',
      '1 · 33%',
    ]);
    const meter = poll.querySelector('meter') as HTMLMeterElement;
    expect([meter.getAttribute('max'), meter.getAttribute('value')]).toEqual(['3', '2']);
    expect(meter.getAttribute('aria-label')).toBe('Pizza: 2 votes');
    expect(poll.querySelector('[data-tei-poll-total]')?.textContent).toBe('3 votes');
    // Two answers: neither can go.
    expect(
      [...poll.querySelectorAll('[data-tei-poll-remove]')].every((b) => b.hasAttribute('disabled')),
    ).toBe(true);

    editor.setEditable(false);
    expect(box().querySelector('input')).toBeNull();
    expect(box().querySelector('button')).toBeNull();
    expect(box().querySelector('[data-tei-poll-question]')?.textContent).toBe('Lunch?');
    editor.setEditable(true);
    expect(box().querySelectorAll('input')).toHaveLength(3);
  });

  it('a vote button votes, is pressed, and keeps its place', () => {
    const editor = make(SAVED);
    const vote = () => box().querySelectorAll<HTMLButtonElement>('[data-tei-poll-vote]')[1];
    const button = vote() as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Vote for Soup');
    button.click();
    expect(first(editor).options[1]?.voters).toEqual(['c', 'me']);
    expect(vote()).toBe(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.closest('li')?.hasAttribute('data-voted')).toBe(true);
    expect(box().querySelector('[data-tei-poll-total]')?.textContent).toBe('4 votes');
    button.click();
    expect(first(editor).options[1]?.voters).toEqual(['c']);
  });

  it('typing commits on change; a focused input keeps what is being typed', () => {
    const editor = make(SAVED);
    const question = box().querySelector('input') as HTMLInputElement;
    question.focus();
    question.value = 'Dinner?';
    question.dispatchEvent(new Event('change', { bubbles: true }));
    expect(first(editor).question).toBe('Dinner?');
    // A change from elsewhere while it is focused leaves it alone.
    question.value = 'Dinner at 8?';
    editor.commands.setPollOption(0, 'Pasta', first(editor).key);
    expect(question.value).toBe('Dinner at 8?');
    expect(box().querySelector<HTMLInputElement>('[data-tei-poll-label]')?.value).toBe('Pasta');
  });

  it('a button click takes what the focused input holds first (Safari keeps focus there)', () => {
    const editor = make(SAVED);
    box().querySelector<HTMLButtonElement>('[data-tei-poll-add]')?.click();
    const third = box().querySelectorAll('input')[3] as HTMLInputElement;
    third.focus();
    third.value = 'Salad';
    box().querySelector<HTMLButtonElement>('[data-tei-poll-remove]')?.click();
    expect(first(editor).options.map((o) => o.text)).toEqual(['Soup', 'Salad']);
  });

  it('focus in an input lets go of the document’s selection', () => {
    const editor = make(`<p>Text</p>${SAVED}`);
    editor.update(() => $getRoot().getFirstChild()?.selectEnd());
    expect(editor.read(() => $getSelection())).not.toBeNull();
    (box().querySelector('input') as HTMLInputElement).focus();
    expect(editor.read(() => $getSelection())).toBeNull();
  });

  it('keys: Enter moves on and adds at the end; Backspace in an empty answer takes it out', () => {
    const editor = make(SAVED);
    const fields = () => [...box().querySelectorAll<HTMLInputElement>('input')];
    const press = (el: HTMLElement | undefined, key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      el?.dispatchEvent(event);
      return event;
    };
    const root = editor.lexical.getRootElement() as HTMLElement;
    let reached = 0;
    root.addEventListener('keydown', () => reached++);

    fields()[0]?.focus();
    expect(press(fields()[0], 'Enter').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(fields()[1]);
    press(fields()[1], 'ArrowDown');
    expect(document.activeElement).toBe(fields()[2]);
    // Enter on the last answer adds one, and goes there.
    const last = fields()[2] as HTMLInputElement;
    last.value = 'Soup!';
    press(last, 'Enter');
    expect(first(editor).options.map((o) => o.text)).toEqual(['Pizza', 'Soup!', '']);
    expect(document.activeElement).toBe(fields()[3]);
    // Empty, Backspace takes it out and goes back to the one before.
    expect(press(fields()[3], 'Backspace').defaultPrevented).toBe(true);
    expect(first(editor).options).toHaveLength(2);
    expect(document.activeElement).toBe(fields()[2]);
    // Backspace with only two left is the input's own.
    (fields()[2] as HTMLInputElement).value = '';
    expect(press(fields()[2], 'Backspace').defaultPrevented).toBe(false);
    expect(first(editor).options).toHaveLength(2);
    // None of it reached the document's own key handling.
    expect(reached).toBe(0);
  });

  it('Escape gives the poll back to the document, selected', () => {
    const editor = make(SAVED);
    // jsdom focuses only what has a tab index.
    (editor.lexical.getRootElement() as HTMLElement).tabIndex = -1;
    const input = box().querySelector('input') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(editor.lexical.getRootElement());
    expect(editor.read(() => $isNodeSelection($getSelection()) && $getPoll() !== null)).toBe(true);
  });

  it('the add and remove buttons change the answers and move focus sensibly', () => {
    const editor = make(SAVED);
    const add = () => box().querySelector('[data-tei-poll-add]') as HTMLButtonElement;
    expect(add().textContent).toBe('Add option');
    add().click();
    expect(first(editor).options).toHaveLength(3);
    expect(document.activeElement).toBe(box().querySelectorAll('input')[3]);
    const removes = box().querySelectorAll<HTMLButtonElement>('[data-tei-poll-remove]');
    expect(removes[0]?.getAttribute('aria-label')).toBe('Remove Pizza');
    removes[0]?.click();
    expect(first(editor).options.map((o) => o.text)).toEqual(['Soup', '']);
    for (let i = 0; i < 8; i++) add().click();
    expect(first(editor).options).toHaveLength(10);
    expect(add().hasAttribute('disabled')).toBe(true);
  });
});
