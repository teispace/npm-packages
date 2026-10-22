import { $getRoot } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ENGLISH_VOICE_COMMANDS,
  getDictationStorage,
  parseDictation,
  SpeechToText,
  type SpeechToTextOptions,
  type SpeechToTextStorage,
} from '../../src/extensions/speech-to-text/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

/** A recognizer to drive by hand: what it heard, when it ends, how it fails. */
class FakeRecognition extends EventTarget {
  static all: FakeRecognition[] = [];
  static get last(): FakeRecognition {
    return FakeRecognition.all[FakeRecognition.all.length - 1] as FakeRecognition;
  }
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  started = 0;
  stopped = 0;
  aborted = 0;
  /** This session's results, as the engine keeps them. */
  session: Array<{ transcript: string; isFinal: boolean }> = [];
  constructor() {
    super();
    FakeRecognition.all.push(this);
  }
  start() {
    this.started++;
    this.session = [];
  }
  stop() {
    this.stopped++;
  }
  abort() {
    this.aborted++;
  }
  /** Hear something: replaces the last result while it is not final, or adds one. */
  hear(transcript: string, isFinal = true) {
    const last = this.session[this.session.length - 1];
    let index = this.session.length;
    if (last && !last.isFinal) index--;
    this.session[index] = { transcript, isFinal };
    const results = this.session.map((r) => Object.assign([{ transcript: r.transcript }], r));
    this.dispatchEvent(Object.assign(new Event('result'), { resultIndex: index, results }));
  }
  fail(error: string) {
    this.dispatchEvent(Object.assign(new Event('error'), { error }));
  }
  end() {
    this.dispatchEvent(new Event('end'));
  }
}

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  FakeRecognition.all = [];
  vi.unstubAllGlobals();
});

function make(
  options: Partial<SpeechToTextOptions> = {},
  { content = '<p></p>', lang = '' }: { content?: string; lang?: string } = {},
) {
  const editor = createTeiEditor({
    extensions: [StarterKit, SpeechToText.configure({ recognition: FakeRecognition, ...options })],
    content,
  });
  editors.push(editor);
  const frame = document.createElement('div');
  if (lang) frame.lang = lang;
  const root = document.createElement('div');
  root.contentEditable = 'true';
  frame.append(root);
  document.body.append(frame);
  editor.lexical.setRootElement(root);
  editor.update(() => $getRoot().selectEnd());
  const storage = getDictationStorage(editor) as SpeechToTextStorage;
  return { editor, storage, root };
}

const text = (editor: TeiEditor) => editor.getText();

describe('SpeechToText', () => {
  it('starts and stops a recognizer set up for continuous dictation', () => {
    const { editor, storage } = make({}, { lang: 'de-DE' });
    expect(editor.can().startDictation()).toBe(true);
    expect(editor.can().stopDictation()).toBe(false);
    expect(editor.commands.startDictation()).toBe(true);
    const rec = FakeRecognition.last;
    expect(rec.started).toBe(1);
    expect(rec.lang).toBe('de-DE');
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(storage.listening.value).toBe(true);
    expect(editor.isActive('dictation')).toBe(true);
    expect(editor.can().startDictation()).toBe(false);
    expect(editor.can().stopDictation()).toBe(true);
    expect(editor.commands.stopDictation()).toBe(true);
    expect(rec.stopped).toBe(1);
    expect(storage.listening.value).toBe(false);
    expect(editor.isActive('dictation')).toBe(false);
    expect(editor.commands.stopDictation()).toBe(false);
  });

  it('toggles, and takes the language from its option first', () => {
    const { editor } = make({ lang: 'fr-FR' }, { lang: 'de-DE' });
    editor.commands.toggleDictation();
    expect(FakeRecognition.last.lang).toBe('fr-FR');
    expect(editor.isActive('dictation')).toBe(true);
    editor.commands.toggleDictation();
    expect(editor.isActive('dictation')).toBe(false);
  });

  it('keeps what is still being heard out of the document and its history', async () => {
    const { editor, storage, root } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.hear('hello', false);
    rec.hear('hello wor', false);
    expect(storage.interim.value).toBe('hello wor');
    expect(text(editor)).toBe('');
    expect(editor.can().undo()).toBe(false);
    // Shown beside the caret instead, outside the editable root.
    await vi.waitFor(() =>
      expect(document.querySelector('.tei-dictation-interim')?.textContent).toBe('hello wor'),
    );
    expect(root.contains(document.querySelector('.tei-dictation-interim'))).toBe(false);
    rec.hear('hello world');
    expect(text(editor)).toBe('Hello world');
    expect(storage.interim.value).toBe('');
    await vi.waitFor(() => expect(document.querySelector('.tei-dictation-interim')).toBeNull());
  });

  it('shows what is being heard from the caret toward the end of the line, either way', async () => {
    const { editor, root } = make();
    // jsdom has no layout: the caret falls back to the root, 100px to 300px.
    root.getBoundingClientRect = () => new DOMRect(100, 0, 200, 20);
    const width = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('tei-dictation-interim') ? 50 : 0;
      });
    try {
      editor.commands.startDictation();
      const rec = FakeRecognition.last;
      getSelection()?.removeAllRanges();
      rec.hear('hello', false);
      const bubble = () => document.querySelector<HTMLElement>('.tei-dictation-interim');
      await vi.waitFor(() => expect(bubble()?.style.transform).toBe('translate(100px, 24px)'));
      expect(bubble()?.dir).toBe('auto');
      root.style.direction = 'rtl';
      rec.hear('שלום', false);
      await vi.waitFor(() => expect(bubble()?.style.transform).toBe('translate(250px, 24px)'));
    } finally {
      width.mockRestore();
    }
  });

  it('writes each final phrase as one undo step, spaced and capitalized', () => {
    const { editor } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.hear('hello world');
    rec.hear('how are you');
    expect(text(editor)).toBe('Hello world how are you');
    editor.commands.undo();
    expect(text(editor)).toBe('Hello world');
    editor.commands.undo();
    expect(text(editor)).toBe('');
  });

  it('turns spoken punctuation and breaks into text and blocks', () => {
    const { editor } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.hear('hello world period how are you question mark');
    rec.hear('new line fine comma thanks exclamation mark');
    rec.hear('she said open quote yes close quote');
    expect(editor.getJSON().root.children).toHaveLength(2);
    expect(text(editor)).toBe('Hello world. How are you?\n\nFine, thanks! She said “yes”');
  });

  it('runs command phrases: undo, redo, stop', () => {
    const { editor, storage } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.hear('first');
    rec.hear('second');
    rec.hear('undo');
    expect(text(editor)).toBe('First');
    rec.hear('redo');
    expect(text(editor)).toBe('First second');
    rec.hear('third stop dictation');
    expect(text(editor)).toBe('First second third');
    expect(storage.listening.value).toBe(false);
    expect(rec.stopped).toBe(1);
  });

  it('matches phrases as whole words in any case, not inside other words', () => {
    const { editor } = make();
    editor.commands.startDictation();
    FakeRecognition.last.hear('a periodic superperiod COMMA check');
    expect(text(editor)).toBe('A periodic superperiod, check');
  });

  it('takes voice commands of your own, and drops ones set to null', () => {
    const run = vi.fn();
    const { editor } = make({
      voiceCommands: {
        ...ENGLISH_VOICE_COMMANDS,
        comma: null,
        smiley: { type: 'text', text: '🙂' },
        'make bold': { type: 'command', command: 'toggleBold' },
        ping: { type: 'run', run },
      },
    });
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.hear('great comma smiley ping');
    expect(text(editor)).toBe('Great comma 🙂');
    expect(run).toHaveBeenCalledWith(editor);
  });

  it('writes what was still being heard when stopped, then lets go', () => {
    const { editor, storage } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.hear('almost', false);
    editor.commands.stopDictation();
    // The engine finalizes it after `stop`.
    rec.hear('almost done');
    rec.end();
    expect(text(editor)).toBe('Almost done');
    expect(storage.interim.value).toBe('');
    expect(rec.started).toBe(1);
  });

  it('starts again when the engine ends by itself, until stopped', () => {
    const { editor, storage } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.hear('one');
    rec.end();
    expect(rec.started).toBe(2);
    expect(storage.listening.value).toBe(true);
    // A new session numbers its results from zero again.
    rec.hear('two');
    expect(text(editor)).toBe('One two');
  });

  it('gives up after ending again and again with nothing heard', () => {
    const { editor, storage } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    for (let i = 0; i < 20; i++) rec.end();
    expect(rec.started).toBe(9);
    expect(storage.listening.value).toBe(false);
  });

  it('reads cumulative results (Chrome on Android) once', () => {
    const { editor } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.hear('hello');
    rec.hear('hello world');
    expect(text(editor)).toBe('Hello world');
    // The same words twice are both meant.
    rec.hear('yes');
    rec.hear('yes');
    expect(text(editor)).toBe('Hello world yes yes');
  });

  it('reports errors: in storage, to onError, out loud; and stops on fatal ones', () => {
    const onError = vi.fn();
    const { editor, storage, root } = make({ onError });
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.fail('no-speech');
    expect(storage.error.value).toBeNull();
    rec.end();
    expect(rec.started).toBe(2);
    rec.fail('not-allowed');
    expect(storage.error.value).toEqual({
      code: 'not-allowed',
      message: 'Dictation needs permission to use the microphone',
    });
    expect(onError).toHaveBeenCalledWith(storage.error.value, editor);
    expect(root.parentElement?.querySelector('[data-tei-live]')?.textContent).toBe(
      'Dictation needs permission to use the microphone',
    );
    rec.end();
    expect(rec.started).toBe(2);
    expect(storage.listening.value).toBe(false);
    expect(editor.isActive('dictation')).toBe(false);
    // An unknown code gets the general message.
    editor.commands.startDictation();
    FakeRecognition.last.fail('mystery');
    expect(storage.error.value?.message).toBe('Dictation stopped: something went wrong');
    // Starting again clears it.
    editor.commands.stopDictation();
    editor.commands.startDictation();
    expect(storage.error.value).toBeNull();
  });

  it('reports a recognizer that throws on start', () => {
    class Broken extends FakeRecognition {
      start(): void {
        throw new Error('busy');
      }
    }
    const { editor, storage } = make({ recognition: Broken });
    expect(editor.commands.startDictation()).toBe(false);
    expect(storage.error.value?.code).toBe('start-failed');
    expect(storage.listening.value).toBe(false);
  });

  it('is unavailable where the browser cannot listen: a disabled button, no command', () => {
    const { editor, storage } = make({ recognition: null });
    // The same toolbar a server renders: only `can()` knows the browser.
    expect(editor.items('toolbar').some((item) => item.id === 'dictation')).toBe(true);
    expect(editor.can().startDictation()).toBe(false);
    expect(editor.can().toggleDictation()).toBe(false);
    expect(editor.commands.startDictation()).toBe(false);
    expect(storage.error.value?.code).toBe('unsupported');
    // The browser's own, when it has one.
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    expect(editor.can().toggleDictation()).toBe(true);
    expect(editor.commands.startDictation()).toBe(true);
  });

  it('stops when the editor turns read-only, and writes nothing more', () => {
    const { editor, storage } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    editor.setEditable(false);
    expect(rec.aborted).toBe(1);
    expect(storage.listening.value).toBe(false);
    rec.hear('ignored');
    expect(text(editor)).toBe('');
    expect(editor.can().startDictation()).toBe(false);
  });

  it('writes nothing that arrives once the editor is read-only', () => {
    const { editor } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    editor.commands.stopDictation();
    editor.setEditable(false);
    rec.hear('late');
    expect(text(editor)).toBe('');
  });

  it('keeps a one-character phrase its own undo step', () => {
    const { editor } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    // Two one-character inserts in a row would merge, as typing does.
    rec.hear('a');
    rec.hear('period');
    expect(text(editor)).toBe('A.');
    editor.commands.undo();
    expect(text(editor)).toBe('A');
  });

  it('lets the toolbar see it turn off by itself, with no change to the document', () => {
    const { editor } = make();
    const onUpdate = vi.fn();
    editor.on('onUpdate', onUpdate);
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    rec.fail('audio-capture');
    const before = editor.lexical.getEditorState();
    rec.end();
    expect(editor.lexical.getEditorState()).not.toBe(before);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(editor.can().undo()).toBe(false);
  });

  it('writes at the end when there is no selection, and over a selected range', () => {
    const { editor } = make({}, { content: '<p>Start here</p>' });
    editor.update(() => {
      const text = $getRoot().getFirstDescendant();
      text?.selectNext?.();
    });
    editor.update(() => $getRoot().getFirstChild()?.selectEnd());
    editor.commands.startDictation();
    FakeRecognition.last.hear('and more');
    expect(text(editor)).toBe('Start here and more');
  });

  it('lets go of the recognizer when the editor goes', () => {
    const { editor } = make();
    editor.commands.startDictation();
    const rec = FakeRecognition.last;
    editors.splice(editors.indexOf(editor), 1);
    editor.destroy();
    expect(rec.aborted).toBe(1);
  });
});

describe('parseDictation', () => {
  it('splits words from commands, longest phrase first', () => {
    expect(parseDictation('hi new line there', ENGLISH_VOICE_COMMANDS)).toEqual([
      { type: 'words', text: 'hi' },
      { type: 'paragraph' },
      { type: 'words', text: 'there' },
    ]);
    expect(
      parseDictation('stop   listening', {
        stop: { type: 'text', text: 'STOP' },
        'stop listening': { type: 'command', command: 'stopDictation' },
      }),
    ).toEqual([{ type: 'command', command: 'stopDictation' }]);
  });

  it('starts a paragraph for a line break in the transcript', () => {
    expect(parseDictation('one\ntwo', {})).toEqual([
      { type: 'words', text: 'one' },
      { type: 'paragraph' },
      { type: 'words', text: 'two' },
    ]);
  });

  it('treats phrases and transcripts as text, never as patterns or keys', () => {
    const commands = {
      'a.b': { type: 'text', text: 'X' },
      '(': { type: 'text', text: 'paren' },
    } as const;
    expect(parseDictation('aXb a.b', commands)).toEqual([
      { type: 'words', text: 'aXb' },
      { type: 'text', text: 'X' },
    ]);
    expect(parseDictation('constructor __proto__ toString', ENGLISH_VOICE_COMMANDS)).toEqual([
      { type: 'words', text: 'constructor __proto__ toString' },
    ]);
    expect(parseDictation('', ENGLISH_VOICE_COMMANDS)).toEqual([]);
    expect(parseDictation('x'.repeat(10_000), ENGLISH_VOICE_COMMANDS)).toHaveLength(1);
  });
});
