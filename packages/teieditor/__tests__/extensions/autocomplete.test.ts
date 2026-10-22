import { $getRoot, $getSelection, $isRangeSelection, KEY_DOWN_COMMAND } from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Autocomplete,
  type AutocompleteOptions,
  type AutocompleteStorage,
  suggestFromWords,
} from '../../src/extensions/autocomplete/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no layout: a range has no boxes.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
});
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function make(options: Partial<AutocompleteOptions> = {}, content = '<p></p>') {
  const editor = createTeiEditor({
    extensions: [StarterKit, Autocomplete.configure({ debounce: 50, ...options })],
    content,
  });
  editors.push(editor);
  const frame = document.createElement('div');
  const root = document.createElement('div');
  root.contentEditable = 'true';
  root.tabIndex = 0;
  frame.append(root);
  document.body.append(frame);
  editor.lexical.setRootElement(root);
  root.focus();
  editor.update(() => $getRoot().selectEnd());
  return editor;
}

const type = (editor: TeiEditor, text: string) => {
  for (const char of text) {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(char);
    });
  }
};

/** Let the debounce pass and the suggestion resolve. */
const settle = async () => {
  await vi.advanceTimersByTimeAsync(60);
};

const key = (editor: TeiEditor, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  let handled = false;
  editor.lexical.update(
    () => {
      handled = editor.lexical.dispatchCommand(KEY_DOWN_COMMAND, event);
    },
    { discrete: true },
  );
  return { handled, prevented: event.defaultPrevented };
};

const ghost = () => document.querySelector<HTMLElement>('[data-tei-autocomplete]');
const storage = (editor: TeiEditor) =>
  editor.extension(Autocomplete)?.output.storage as AutocompleteStorage;

describe('Autocomplete', () => {
  it('suggests the rest of a listed word in a ghost no screen reader hears; Tab takes it', async () => {
    const editor = make();
    type(editor, 'I said beca');
    expect(ghost()).toBeNull();
    await settle();
    expect(storage(editor).suggestion.value).toBe('use');
    expect(ghost()?.textContent).toBe('use');
    expect(ghost()?.getAttribute('aria-hidden')).toBe('true');
    expect(ghost()?.className).toBe('tei-autocomplete');
    // Drawn beside the document, not in it: never saved.
    expect(editor.lexical.getRootElement()?.contains(ghost())).toBe(false);
    expect(editor.getText()).toBe('I said beca');
    expect(key(editor, { key: 'Tab' })).toEqual({ handled: true, prevented: true });
    expect(editor.getText()).toBe('I said because');
    expect(ghost()).toBeNull();
    expect(document.querySelector('[data-tei-live]')?.textContent).toBe('Completed: because');
  });

  it('leaves Tab alone with nothing showing, so indenting and leaving the editor still work', () => {
    const editor = make();
    type(editor, 'xq');
    expect(key(editor, { key: 'Tab' }).prevented).toBe(false);
    expect(editor.getText()).toBe('xq');
  });

  it('→ at the end takes it; Escape drops it; a modifier leaves the key alone', async () => {
    const editor = make();
    type(editor, 'tomo');
    await settle();
    key(editor, { key: 'Tab', shiftKey: true });
    expect(editor.getText()).toBe('tomo');
    expect(key(editor, { key: 'ArrowRight' }).handled).toBe(true);
    expect(editor.getText()).toBe('tomorrow');
    type(editor, ' expe');
    await settle();
    expect(ghost()?.textContent).toBe('rience');
    expect(key(editor, { key: 'Escape' })).toEqual({ handled: true, prevented: true });
    expect(ghost()).toBeNull();
    expect(key(editor, { key: 'Tab' }).prevented).toBe(false);
    expect(editor.getText()).toBe('tomorrow expe');
  });

  it('typing what it shows eats into it without asking again; other typing asks again', async () => {
    const suggest = vi.fn(({ word }: { word: string }) => (word === 'he' ? 'llo world' : null));
    const editor = make({ suggest });
    type(editor, 'he');
    await settle();
    expect(ghost()?.textContent).toBe('llo world');
    type(editor, 'll');
    expect(ghost()?.textContent).toBe('o world');
    await settle();
    expect(suggest).toHaveBeenCalledTimes(1);
    type(editor, 'x');
    expect(ghost()).toBeNull();
    await settle();
    expect(suggest).toHaveBeenCalledTimes(2);
    expect(suggest.mock.calls[1]?.[0]).toEqual({ word: 'hellx', textBefore: 'hellx' });
  });

  it('debounces, and aborts a stale request and ignores its answer', async () => {
    const signals: AbortSignal[] = [];
    const answers: Array<(text: string) => void> = [];
    const editor = make({
      suggest: (_context, { signal }) => {
        signals.push(signal);
        return new Promise<string>((resolve) => answers.push(resolve));
      },
    });
    type(editor, 'abc');
    await settle();
    expect(signals).toHaveLength(1);
    type(editor, 'd');
    expect(signals[0]?.aborted).toBe(true);
    answers[0]?.('stale');
    await settle();
    expect(ghost()).toBeNull();
    expect(signals).toHaveLength(2);
    answers[1]?.('fresh');
    await settle();
    expect(ghost()?.textContent).toBe('fresh');
  });

  it('shows untrusted text as text: one line, no markup', async () => {
    const editor = make({ suggest: () => '<img src=x onerror=alert(1)>\nsecond line' });
    type(editor, 'ab');
    await settle();
    expect(ghost()?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
  });

  it('keeps the case typed', () => {
    expect(suggestFromWords(['because'], 'Beca')).toBe('use');
    expect(suggestFromWords(['because'], 'BECA')).toBe('USE');
    expect(suggestFromWords(['because'], 'because')).toBeNull();
  });

  it('never mid-line, in code, after @ # / :, below minLength, or while composing', async () => {
    const suggest = vi.fn(() => 'zzz');
    const mid = make({ suggest }, '<p>ab cd</p>');
    mid.update(() => $getRoot().getAllTextNodes()[0]?.select(2, 2));
    type(mid, 'x');
    const code = make({ suggest }, '<pre><code>ab</code></pre>');
    type(code, 'cd');
    const mention = make({ suggest });
    type(mention, 'hi @jo /co #ta :sm');
    const short = make({ suggest, minLength: 4 });
    type(short, 'abc');
    const composing = make({ suggest });
    vi.spyOn(composing.lexical, 'isComposing').mockReturnValue(true);
    type(composing, 'abcd');
    await settle();
    expect(suggest).not.toHaveBeenCalled();
    expect(ghost()).toBeNull();
  });

  it('composition, blur and read-only drop a showing suggestion', async () => {
    const editor = make();
    const root = editor.lexical.getRootElement() as HTMLElement;
    type(editor, 'beca');
    await settle();
    expect(ghost()).not.toBeNull();
    root.dispatchEvent(new CompositionEvent('compositionstart'));
    expect(ghost()).toBeNull();
    root.dispatchEvent(new CompositionEvent('compositionend', { data: '' }));
    type(editor, 'u');
    await settle();
    expect(ghost()?.textContent).toBe('se');
    root.blur();
    expect(ghost()).toBeNull();
    root.focus();
    editor.update(() => $getRoot().selectEnd());
    type(editor, 's');
    await settle();
    expect(ghost()?.textContent).toBe('e');
    editor.setEditable(false);
    expect(ghost()).toBeNull();
  });

  it('acceptSuggestion and dismissSuggestion commands', async () => {
    const editor = make();
    expect(editor.can().acceptSuggestion()).toBe(false);
    type(editor, 'wedn');
    await settle();
    expect(editor.can().acceptSuggestion()).toBe(true);
    expect(editor.commands.acceptSuggestion()).toBe(true);
    expect(editor.getText()).toBe('wednesday');
    type(editor, ' thu');
    await settle();
    expect(editor.commands.dismissSuggestion()).toBe(true);
    expect(ghost()).toBeNull();
    expect(editor.getText()).toBe('wednesday thu');
  });
});
