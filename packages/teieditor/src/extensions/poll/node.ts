import {
  $create,
  $getDocument,
  $getEditor,
  $getNodeByKey,
  $getSelection,
  $setSelection,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedLexicalNode,
  SKIP_DOM_SELECTION_TAG,
} from 'lexical';
import { TeiEditor } from '../../core/editor.js';
import { iconElement } from '../../core/icon-dom.js';
import { $selectNode } from '../../core/slot-host.js';
import { editorLocale } from '../../utils/locale.js';

/** One answer, and who chose it. */
export interface PollOption {
  text: string;
  /** Voter ids, each once. */
  voters: readonly string[];
}

export interface SerializedPollNode extends SerializedLexicalNode {
  question: string;
  options: PollOption[];
}

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 10;
/** The longest question or answer kept. */
export const POLL_MAX_TEXT = 500;
const MAX_VOTERS = 10_000;
const MAX_VOTER_ID = 200;
/** The longest `data-voters` read: anything bigger is not one of ours. */
const MAX_VOTERS_JSON = 1_000_000;

const text = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, POLL_MAX_TEXT) : '';

/** Voter ids from anywhere: strings only, each once, within limits. */
export function cleanVoters(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const id of value) {
    if (ids.size >= MAX_VOTERS) break;
    if (typeof id === 'string' && id.length > 0 && id.length <= MAX_VOTER_ID) ids.add(id);
  }
  return [...ids];
}

/** `data-voters` as saved HTML has it; anything malformed is no votes. */
export function parseVoters(json: string | null | undefined): string[] {
  if (!json || json.length > MAX_VOTERS_JSON) return [];
  try {
    return cleanVoters(JSON.parse(json));
  } catch {
    return [];
  }
}

/** Options from anywhere: at least two, at most ten, each clean. */
export function cleanOptions(value: unknown): PollOption[] {
  const list = Array.isArray(value) ? value.slice(0, POLL_MAX_OPTIONS) : [];
  const options = list.map((option): PollOption => {
    const data = typeof option === 'string' ? { text: option } : (option ?? {});
    return { text: text(data.text), voters: cleanVoters(data.voters) };
  });
  while (options.length < POLL_MIN_OPTIONS) options.push({ text: '', voters: [] });
  return options;
}

/** Who votes in each editor; the Poll extension sets it. */
const voters = new WeakMap<LexicalEditor, () => string | null>();

export function setPollVoter(lexical: LexicalEditor, voter: () => string | null): () => void {
  voters.set(lexical, voter);
  return () => voters.delete(lexical);
}

/** The id this editor votes as, or `null` when it cannot vote. */
export function pollVoter(lexical: LexicalEditor): string | null {
  return voters.get(lexical)?.() ?? null;
}

/**
 * A poll: a question, two to ten answers, and who voted for each. It draws
 * its own DOM, so it needs no framework: while editing, the question and
 * answers are plain inputs, with a vote toggle, live counts and a bar for
 * each answer; read-only, the results. Saved as `<div data-tei-poll>`,
 * which shows the same results and reads back with every vote.
 */
export class PollNode extends DecoratorNode<null> {
  __question = '';
  __options: readonly PollOption[] = cleanOptions([]);

  $config() {
    return this.config('poll', { extends: DecoratorNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__question = prev.__question;
    this.__options = prev.__options;
  }

  getQuestion(): string {
    return this.getLatest().__question;
  }

  setQuestion(question: string): this {
    const self = this.getWritable();
    self.__question = text(question);
    return self;
  }

  getOptions(): readonly PollOption[] {
    return this.getLatest().__options;
  }

  /** Cleaned: two to ten answers, voter ids checked. */
  setOptions(options: readonly (PollOption | string)[]): this {
    const self = this.getWritable();
    self.__options = cleanOptions(options);
    return self;
  }

  setOptionText(index: number, value: string): this {
    const options = this.getOptions();
    const option = options[index];
    if (!option) return this;
    return this.setOptions(options.map((o, i) => (i === index ? { ...o, text: text(value) } : o)));
  }

  /** A new answer at the end, unless there are ten. */
  addOption(value = ''): this {
    const options = this.getOptions();
    if (options.length >= POLL_MAX_OPTIONS) return this;
    return this.setOptions([...options, { text: text(value), voters: [] }]);
  }

  /** Takes an answer and its votes away, unless only two are left. */
  removeOption(index: number): this {
    const options = this.getOptions();
    if (options.length <= POLL_MIN_OPTIONS || !options[index]) return this;
    return this.setOptions(options.filter((_, i) => i !== index));
  }

  /**
   * Vote for an answer, or take the vote back. With `multiple` off, a vote
   * moves from any other answer to this one.
   */
  toggleVote(index: number, voter: string, multiple = false): this {
    const options = this.getOptions();
    const option = options[index];
    if (!option || !voter) return this;
    const voted = option.voters.includes(voter);
    return this.setOptions(
      options.map((o, i) => {
        if (i === index)
          return {
            ...o,
            voters: voted ? o.voters.filter((v) => v !== voter) : [...o.voters, voter],
          };
        return multiple ? o : { ...o, voters: o.voters.filter((v) => v !== voter) };
      }),
    );
  }

  /** Every vote cast. */
  getTotalVotes(): number {
    return this.getOptions().reduce((sum, option) => sum + option.voters.length, 0);
  }

  // -- JSON ------------------------------------------------------------------

  updateFromJSON(json: LexicalUpdateJSON<SerializedPollNode>): this {
    const self = super.updateFromJSON(json);
    const data = json as Partial<SerializedPollNode>;
    return self.setQuestion(text(data.question)).setOptions(cleanOptions(data.options));
  }

  exportJSON(): SerializedPollNode {
    return {
      ...super.exportJSON(),
      question: this.getQuestion(),
      options: this.getOptions().map((o) => ({ text: o.text, voters: [...o.voters] })),
    };
  }

  // -- DOM -------------------------------------------------------------------

  createDOM(config: EditorConfig): HTMLElement {
    const box = $getDocument().createElement('div');
    box.className = (config.theme.poll as string | undefined) ?? 'tei-poll';
    box.setAttribute('contenteditable', 'false');
    const lexical = $getEditor();
    bindPoll(box, lexical, this.getKey());
    paintPoll(box, this, lexical, lexical.isEditable() ? 'edit' : 'view');
    return box;
  }

  updateDOM(_prev: this, dom: HTMLElement): false {
    const lexical = $getEditor();
    paintPoll(dom, this, lexical, lexical.isEditable() ? 'edit' : 'view');
    return false;
  }

  /** The results, with each answer's voters in `data-voters`, so it reads back whole. */
  exportDOM(lexical: LexicalEditor): DOMExportOutput {
    const box = $getDocument().createElement('div');
    paintPoll(box, this, lexical, 'export');
    return { element: box };
  }

  decorate(): null {
    return null;
  }

  isInline(): false {
    return false;
  }

  getTextContent(): string {
    return [this.getQuestion(), ...this.getOptions().map((o) => o.text)].join('\n');
  }
}

export function $createPollNode(question = '', options: readonly (PollOption | string)[] = []) {
  return $create(PollNode).setQuestion(question).setOptions(options);
}

export function $isPollNode(node: LexicalNode | null | undefined): node is PollNode {
  return node instanceof PollNode;
}

// -- Drawing ------------------------------------------------------------------

type Mode = 'edit' | 'view' | 'export';

const attr = (el: Element, name: string, value: string | boolean) => {
  if (value === false) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? '' : value);
};

/**
 * Draw a poll into `box`. Its elements are made again only when its shape
 * changes (an answer added, the editor made read-only), so an input keeps
 * focus and caret while the poll updates round it.
 */
function paintPoll(box: HTMLElement, node: PollNode, lexical: LexicalEditor, mode: Mode): void {
  const doc = box.ownerDocument;
  const editor = TeiEditor.of(lexical);
  const t = (id: string, values?: Record<string, string | number>) => editor?.t(id, values) ?? id;
  const locale = editorLocale(mode === 'export' ? null : lexical);
  const question = node.getQuestion();
  const options = node.getOptions();
  const edit = mode === 'edit';
  const shape = `${mode}:${options.length}`;
  if (box.getAttribute('data-shape') !== shape) {
    const el = (tag: string, data: string) => {
      const made = doc.createElement(tag);
      made.setAttribute(`data-tei-poll-${data}`, '');
      return made;
    };
    const button = (data: string, icon: string, label?: string) => {
      const made = el('button', data);
      made.setAttribute('type', 'button');
      const svg = editor?.icon(icon);
      if (svg) made.append(iconElement(doc, svg));
      if (label) made.append(label);
      return made;
    };
    const field = (data: string) => {
      const input = el('input', data) as HTMLInputElement;
      input.type = 'text';
      input.maxLength = POLL_MAX_TEXT;
      input.dir = 'auto';
      return input;
    };
    const list = el('ul', 'options');
    options.forEach((_, i) => {
      const item = el('li', 'option');
      if (mode !== 'export') item.setAttribute('data-index', String(i));
      item.append(
        edit ? button('vote', 'check') : el('span', 'mark'),
        edit ? field('label') : el('span', 'label'),
        el('span', 'count'),
      );
      if (edit) item.append(button('remove', 'close'));
      item.append(el('meter', 'meter'));
      list.append(item);
    });
    const footer = el(edit ? 'div' : 'p', 'footer');
    footer.append(el('span', 'total'));
    if (edit) footer.append(button('add', 'plus', t('poll.addOption')));
    box.replaceChildren(edit ? field('question') : el('p', 'question'), list, footer);
    if (mode !== 'export') box.setAttribute('data-shape', shape);
  }

  attr(box, 'data-tei-poll', true);
  if (mode !== 'export') {
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', t('poll.label'));
  }
  const total = options.reduce((sum, option) => sum + option.voters.length, 0);
  const percent = (n: number) =>
    new Intl.NumberFormat(locale, { style: 'percent' }).format(total ? n / total : 0);
  const votes = (count: number) => {
    const id = `poll.votes.${new Intl.PluralRules(locale).select(count)}`;
    const message = t(id, { count });
    return message === id ? t('poll.votes.other', { count }) : message;
  };
  const isActive = (el: Element) => el.ownerDocument.activeElement === el;
  const setText = (el: Element | null | undefined, value: string, placeholder: string) => {
    if (!el) return;
    if (el.tagName === 'INPUT') {
      const input = el as HTMLInputElement;
      if (!isActive(input) && input.value !== value) input.value = value;
      input.placeholder = placeholder;
      input.setAttribute('aria-label', placeholder);
    } else if (el.textContent !== value) el.textContent = value;
  };
  setText(box.querySelector('[data-tei-poll-question]'), question, t('poll.question'));

  const voter = mode === 'export' ? null : pollVoter(lexical);
  const items = box.querySelectorAll('[data-tei-poll-option]');
  options.forEach((option, i) => {
    const item = items[i];
    if (!item) return;
    const name = t('poll.option', { n: i + 1 });
    const count = option.voters.length;
    const voted = voter !== null && option.voters.includes(voter);
    attr(item, 'data-voted', voted);
    if (mode === 'export') item.setAttribute('data-voters', JSON.stringify(option.voters));
    setText(item.querySelector('[data-tei-poll-label]'), option.text, name);
    const tally = `${count} · ${percent(count)}`;
    const shown = item.querySelector('[data-tei-poll-count]');
    if (shown && shown.textContent !== tally) shown.textContent = tally;
    const vote = item.querySelector('[data-tei-poll-vote]');
    if (vote) {
      vote.setAttribute('aria-pressed', String(voted));
      vote.setAttribute('aria-label', t('poll.vote', { option: option.text || name }));
    }
    const remove = item.querySelector('[data-tei-poll-remove]');
    if (remove) {
      remove.setAttribute('aria-label', t('poll.removeOption', { option: option.text || name }));
      attr(remove, 'disabled', options.length <= POLL_MIN_OPTIONS);
    }
    const meter = item.querySelector('meter');
    if (meter) {
      meter.setAttribute('min', '0');
      meter.setAttribute('max', String(Math.max(total, 1)));
      meter.setAttribute('value', String(count));
      meter.textContent = percent(count);
      if (mode !== 'export')
        meter.setAttribute(
          'aria-label',
          t('poll.result', { option: option.text || name, votes: votes(count) }),
        );
    }
  });
  const sum = box.querySelector('[data-tei-poll-total]');
  if (sum) sum.textContent = votes(total);
  const add = box.querySelector('[data-tei-poll-add]');
  if (add) attr(add, 'disabled', options.length >= POLL_MAX_OPTIONS);
}

/** Paint every poll again: the editor became editable, or stopped being. */
export function repaintPolls(lexical: LexicalEditor): void {
  const mode = lexical.isEditable() ? 'edit' : 'view';
  const state = lexical.getEditorState();
  state.read(
    () => {
      for (const [key, node] of state._nodeMap) {
        const dom = $isPollNode(node) ? lexical.getElementByKey(key) : null;
        if (dom && $isPollNode(node)) paintPoll(dom, node, lexical, mode);
      }
    },
    { editor: lexical },
  );
}

// -- Behaviour ----------------------------------------------------------------

/** Events that belong to a poll's own inputs and buttons, never the document's. */
const OWN_EVENTS = [
  'keydown',
  'keyup',
  'keypress',
  'beforeinput',
  'input',
  'paste',
  'cut',
  'copy',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'pointerdown',
  'mousedown',
  'click',
  'dragstart',
] as const;

/**
 * A poll's inputs and buttons work as a form does: the editor never sees
 * their keys, clicks or text. Enter goes to the next answer (adding one
 * at the end), Backspace in an empty answer takes it out, the arrows move
 * between fields, Escape gives the poll back to the document, selected.
 */
function bindPoll(box: HTMLElement, lexical: LexicalEditor, key: NodeKey): void {
  const control = (target: EventTarget | null): HTMLElement | null => {
    const el = (target as Element | null)?.closest?.('input, button') as HTMLElement | null;
    return el && box.contains(el) ? el : null;
  };
  const run = (name: string, ...args: unknown[]) =>
    TeiEditor.of(lexical)?.command(name, ...args, key) ?? false;
  const fields = () => [...box.querySelectorAll<HTMLInputElement>('input')];
  const indexOf = (el: Element) =>
    Number(el.closest('[data-tei-poll-option]')?.getAttribute('data-index') ?? -1);
  const focusField = (index: number, atEnd = false) => {
    const input = fields()[index];
    if (!input) return;
    input.focus();
    if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
  };
  const commit = (input: HTMLInputElement) => {
    if (input.hasAttribute('data-tei-poll-question')) run('setPollQuestion', input.value);
    else run('setPollOption', indexOf(input), input.value);
  };

  for (const type of OWN_EVENTS) {
    box.addEventListener(type, (event) => {
      if (control(event.target)) event.stopPropagation();
    });
  }
  // The document lets go of its selection, so its keys and caret stay out.
  box.addEventListener('focusin', (event) => {
    if (!control(event.target) || !lexical.isEditable()) return;
    if (lexical.getEditorState().read(() => $getSelection()) === null) return;
    lexical.update(() => $setSelection(null), { tag: SKIP_DOM_SELECTION_TAG, discrete: true });
  });
  box.addEventListener('change', (event) => {
    const input = control(event.target);
    if (input?.tagName === 'INPUT') commit(input as HTMLInputElement);
  });
  box.addEventListener('click', (event) => {
    const button = control(event.target);
    if (button?.tagName !== 'BUTTON' || !lexical.isEditable()) return;
    // Safari keeps focus in an input through a button's click: take its text
    // first, before the answers are drawn again without it.
    const typing = control(box.ownerDocument.activeElement);
    if (typing?.tagName === 'INPUT') commit(typing as HTMLInputElement);
    if (button.hasAttribute('data-tei-poll-vote')) run('togglePollVote', indexOf(button));
    else if (button.hasAttribute('data-tei-poll-remove')) {
      const index = indexOf(button);
      if (run('removePollOption', index)) focusField(Math.max(index, 1), true);
    } else if (button.hasAttribute('data-tei-poll-add') && run('addPollOption', '')) {
      focusField(fields().length - 1);
    }
  });
  box.addEventListener('keydown', (event) => {
    const el = control(event.target);
    if (!el || event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (el.tagName === 'INPUT') commit(el as HTMLInputElement);
      lexical.update(
        () => {
          const node = $getNodeByKey(key);
          if (node) $selectNode(node);
        },
        { discrete: true },
      );
      lexical.getRootElement()?.focus({ preventScroll: true });
      return;
    }
    if (el.tagName !== 'INPUT') return;
    const input = el as HTMLInputElement;
    const all = fields();
    const at = all.indexOf(input);
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (event.key === 'Enter' && plain) {
      event.preventDefault();
      commit(input);
      if (at < all.length - 1) focusField(at + 1);
      else if (run('addPollOption', '')) focusField(at + 1);
    } else if (
      event.key === 'Backspace' &&
      plain &&
      input.value === '' &&
      input.hasAttribute('data-tei-poll-label') &&
      run('removePollOption', indexOf(input))
    ) {
      event.preventDefault();
      focusField(at - 1, true);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && plain) {
      const next = at + (event.key === 'ArrowDown' ? 1 : -1);
      if (next < 0 || next >= all.length) return;
      event.preventDefault();
      commit(input);
      focusField(next, true);
    }
  });
}
