import { effect, type Signal, signal } from '@lexical/extension';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $onUpdate,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  mergeRegister,
  type RangeSelection,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { CommandName } from '../../core/types.js';
import { microphone } from '../../icons/index.js';
import { createOverlay, frameScheduler, place } from '../../utils/overlay.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Start taking dictation at the selection. */
    startDictation: [];
    /** Stop; what was still being heard is written first. */
    stopDictation: [];
    toggleDictation: [];
  }
  interface TeiActiveStates {
    /** Dictation is on. */
    dictation: [];
  }
}

const NAME = '@teispace/teieditor/speech-to-text';

// -- The Web Speech API, as much of it as is used -------------------------------

/** One recognizer, `SpeechRecognition`'s shape: what a test or another engine provides. */
export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** The `result` event's shape. */
export interface SpeechResultEvent extends Event {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

/** The `error` event's shape. */
export interface SpeechErrorEvent extends Event {
  error: string;
  message?: string;
}

/**
 * What went wrong: the Web Speech API's error code (`not-allowed`,
 * `audio-capture`, `network`, `no-speech`, …), or `unsupported` and
 * `start-failed` from here. `message` is the editor's text for it.
 */
export interface DictationError {
  code: string;
  message: string;
}

// -- Voice commands -------------------------------------------------------------

/**
 * What a spoken phrase does instead of being written: write something else
 * (`'period'` writes `.` against the word before it), start a paragraph or
 * a line, run an editor command (`'undo'`), or run code.
 */
export type VoiceCommand =
  | {
      type: 'text';
      text: string;
      /** No space before it, as for punctuation. */
      attach?: boolean;
    }
  | { type: 'paragraph' }
  | { type: 'lineBreak' }
  | { type: 'command'; command: CommandName; args?: readonly unknown[] }
  | { type: 'run'; run: (editor: TeiEditor) => void };

const punctuation = (text: string): VoiceCommand => ({ type: 'text', text, attach: true });

/**
 * The English voice commands. Extend or replace them, by phrase:
 * `SpeechToText.configure({ voiceCommands: { ...ENGLISH_VOICE_COMMANDS, smiley: { type: 'text', text: '🙂' } } })`.
 */
export const ENGLISH_VOICE_COMMANDS: Readonly<Record<string, VoiceCommand>> = {
  'new line': { type: 'paragraph' },
  'new paragraph': { type: 'paragraph' },
  'line break': { type: 'lineBreak' },
  period: punctuation('.'),
  'full stop': punctuation('.'),
  comma: punctuation(','),
  'question mark': punctuation('?'),
  'exclamation mark': punctuation('!'),
  'exclamation point': punctuation('!'),
  colon: punctuation(':'),
  semicolon: punctuation(';'),
  'open quote': { type: 'text', text: '“' },
  'close quote': punctuation('”'),
  'open parenthesis': { type: 'text', text: '(' },
  'close parenthesis': punctuation(')'),
  undo: { type: 'command', command: 'undo' },
  redo: { type: 'command', command: 'redo' },
  'stop dictation': { type: 'command', command: 'stopDictation' },
  'stop listening': { type: 'command', command: 'stopDictation' },
};

export interface SpeechToTextOptions {
  /**
   * The language to listen for, as a BCP 47 tag (`'en-US'`, `'de-DE'`).
   * Default `null`: the document's `lang`, then the browser's.
   */
  lang: string | null;
  /** Spoken phrases that act instead of being written; see {@link ENGLISH_VOICE_COMMANDS}. */
  voiceCommands: Readonly<Record<string, VoiceCommand | null>>;
  /** Show what is being heard at the caret, before it is final. Default true. */
  preview: boolean;
  /** Capitalize the first word of a sentence. Default true. */
  capitalize: boolean;
  /**
   * The recognizer to use. Default `null`: the browser's
   * `SpeechRecognition` (or `webkitSpeechRecognition`). Pass one to test,
   * or to use another engine with the same shape.
   */
  recognition: SpeechRecognitionConstructor | null;
  /** Called with each error, besides `error` in storage and an announcement. */
  onError: ((error: DictationError, editor: TeiEditor) => void) | null;
}

export interface SpeechToTextStorage {
  /** Whether dictation is on. */
  listening: Signal<boolean>;
  /** What is being heard and not yet final; never in the document. */
  interim: Signal<string>;
  /** The last error, until dictation starts again. */
  error: Signal<DictationError | null>;
}

/** Errors that end dictation: asking again would fail the same way. */
const FATAL = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'language-not-supported',
  'bad-grammar',
  'network',
  'unsupported',
  'start-failed',
]);

/** Restarts in a row with nothing heard before dictation gives up. */
const MAX_RESTARTS = 8;

/** The browser's recognizer, if it has one. */
export function browserSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, SpeechRecognitionConstructor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// -- Parsing what was said ------------------------------------------------------

/** A piece of a final transcript: words to write, or a voice command. */
export type DictationSegment =
  | { type: 'words'; text: string }
  | Exclude<VoiceCommand, { type: 'text' }>
  | { type: 'text'; text: string; attach?: boolean };

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Split a transcript into words and voice commands. Phrases match whole
 * words, in any case, longest first; a line break in the transcript (some
 * engines write one for "new line") starts a paragraph.
 */
export function parseDictation(
  transcript: string,
  commands: Readonly<Record<string, VoiceCommand | null>>,
): DictationSegment[] {
  // A Map, not the object: a phrase is user input, `constructor` is not a command.
  const byPhrase = new Map<string, VoiceCommand>();
  for (const [phrase, command] of Object.entries(commands)) {
    const key = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
    if (command && key) byPhrase.set(key, command);
  }
  const phrases = [...byPhrase.keys()].sort((a, b) => b.length - a.length);
  const segments: DictationSegment[] = [];
  const words = (text: string) => {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed) segments.push({ type: 'words', text: trimmed });
  };
  const lines = transcript.split(/\s*\n\s*/);
  lines.forEach((line, index) => {
    if (index > 0) segments.push({ type: 'paragraph' });
    if (phrases.length === 0) {
      words(line);
      return;
    }
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])(${phrases.map((p) => escape(p).replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`,
      'giu',
    );
    let last = 0;
    for (const match of line.matchAll(pattern)) {
      words(line.slice(last, match.index));
      const command = byPhrase.get((match[1] as string).toLowerCase().replace(/\s+/g, ' '));
      if (command) segments.push(command as DictationSegment);
      last = match.index + match[0].length;
    }
    words(line.slice(last));
  });
  return segments;
}

// -- Writing it -----------------------------------------------------------------

/** The text just before the caret in its block, enough to decide on a space and a capital. */
function $textBefore(selection: RangeSelection): string {
  const { anchor } = selection;
  const node = anchor.getNode();
  if ($isTextNode(node)) {
    const own = node.getTextContent().slice(0, anchor.offset);
    if (own || anchor.offset > 0) return own;
    const previous = node.getPreviousSibling();
    return $isTextNode(previous) ? previous.getTextContent() : previous ? ' ' : '';
  }
  // An element point: the child before it.
  const previous =
    $isElementNode(node) && anchor.offset > 0 ? node.getChildAtIndex(anchor.offset - 1) : null;
  if (!previous) return '';
  return $isTextNode(previous) ? previous.getTextContent() : ' ';
}

/** After these, a word follows with no space. */
const OPENERS = /[\s([{“‘"'¿¡«-]$/u;
/** A sentence ends with these; the next word starts with a capital. */
const SENTENCE_END = /[.!?…]$/u;

/** Write words and voice-command text at the selection, spaced and capitalized like typing. */
function $write(selection: RangeSelection, segment: DictationSegment, capitalize: boolean): void {
  if (segment.type === 'paragraph') {
    selection.insertParagraph();
    return;
  }
  if (segment.type === 'lineBreak') {
    selection.insertLineBreak();
    return;
  }
  if (segment.type !== 'words' && segment.type !== 'text') return;
  if (!selection.isCollapsed()) selection.removeText();
  const before = $textBefore(selection);
  let text = segment.text;
  const attach = segment.type === 'text' && segment.attach;
  const tail = before.trimEnd();
  if (segment.type === 'words' && capitalize && (tail === '' || SENTENCE_END.test(tail))) {
    text = text.charAt(0).toLocaleUpperCase() + text.slice(1);
  }
  const space = !attach && before !== '' && !OPENERS.test(before);
  selection.insertText((space ? ' ' : '') + text);
}

// -- The engine -----------------------------------------------------------------

/** Inner state, out of the public storage. */
interface Engine {
  recognition: SpeechRecognitionLike | null;
  /** On until stopped: an engine that ends by itself is started again. */
  wanted: boolean;
  /** Results already written in this recognition session. */
  handled: number;
  /** The last final transcript, for engines that repeat it in the next. */
  lastFinal: string;
  restarts: number;
  fatal: boolean;
}

const engines = new WeakMap<SpeechToTextStorage, Engine>();
const engineOf = (storage: SpeechToTextStorage) => engines.get(storage) as Engine;

/**
 * Let the toolbar see a change it cannot see in the document (dictation
 * turning on or off): an update with nothing in it but a callback after
 * it, which Lexical commits as a new state with nothing dirty. So no undo
 * step, no `onChange`, and the caret stays put.
 */
function $touch(): void {
  $onUpdate(() => {});
}
const touch = (lexical: LexicalEditor) =>
  lexical.update($touch, {
    discrete: true,
    tag: [HISTORY_MERGE_TAG, SKIP_DOM_SELECTION_TAG, SKIP_SCROLL_INTO_VIEW_TAG],
  });

/** The language for the recognizer: the option, the document's, the browser's. */
function languageFor(lexical: LexicalEditor, option: string | null): string {
  if (option) return option;
  const root = lexical.getRootElement();
  const lang =
    root?.closest('[lang]')?.getAttribute('lang') || root?.ownerDocument.documentElement.lang;
  if (lang) return lang;
  return typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US';
}

interface Ctx {
  editor: TeiEditor;
  lexical: LexicalEditor;
  options: Readonly<SpeechToTextOptions>;
  storage: SpeechToTextStorage;
}

function report({ editor, options, storage }: Ctx, code: string): void {
  const key = `dictation.error.${code}`;
  const known = editor.t(key);
  const message = known === key ? editor.t('dictation.error') : known;
  const error = { code, message };
  storage.error.value = error;
  editor.announce(message);
  options.onError?.(error, editor);
}

/** Write a final transcript: its words as one undo step, its commands each on their own. */
function apply(ctx: Ctx, transcript: string): void {
  const { editor, lexical, options } = ctx;
  if (!editor.isEditable) return;
  const segments = parseDictation(transcript, options.voiceCommands);
  let batch: DictationSegment[] = [];
  const flush = () => {
    if (batch.length === 0) return;
    const writing = batch;
    batch = [];
    lexical.update(
      () => {
        let selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          $getRoot().selectEnd();
          selection = $getSelection();
        }
        for (const segment of writing) {
          if (!$isRangeSelection(selection)) return;
          $write(selection, segment, options.capitalize);
          selection = $getSelection();
        }
      },
      { tag: HISTORY_PUSH_TAG, discrete: true },
    );
  };
  for (const segment of segments) {
    if (segment.type === 'command') {
      flush();
      if (editor.hasCommand(segment.command)) {
        editor.command(segment.command, ...((segment.args ?? []) as unknown[]));
      }
    } else if (segment.type === 'run') {
      flush();
      segment.run(editor);
    } else batch.push(segment);
  }
  flush();
}

function onResult(ctx: Ctx, event: SpeechResultEvent): void {
  const engine = engineOf(ctx.storage);
  const { results } = event;
  let interim = '';
  const finals: string[] = [];
  for (let i = Math.max(0, event.resultIndex); i < results.length; i++) {
    const result = results[i];
    const transcript = result?.[0]?.transcript ?? '';
    if (!result) continue;
    if (result.isFinal) {
      if (i < engine.handled) continue;
      engine.handled = i + 1;
      // Some engines (Chrome on Android) repeat everything said so far in each final result.
      let fresh = transcript;
      const previous = engine.lastFinal.trim();
      const now = transcript.trim();
      if (previous && now.length > previous.length && now.startsWith(previous)) {
        fresh = now.slice(previous.length);
      }
      engine.lastFinal = transcript;
      if (fresh.trim()) finals.push(fresh);
    } else interim += transcript;
  }
  if (finals.length || interim) engine.restarts = 0;
  ctx.storage.interim.value = interim.trim();
  if (finals.length) apply(ctx, finals.join(' '));
}

/** Let go of the recognizer: dictation is off. `quiet` while the editor goes away. */
function finish(ctx: Ctx, quiet = false): void {
  const engine = engineOf(ctx.storage);
  engine.recognition = null;
  engine.wanted = false;
  ctx.storage.interim.value = '';
  if (ctx.storage.listening.peek()) {
    ctx.storage.listening.value = false;
    if (!quiet) touch(ctx.lexical);
  }
}

function start(ctx: Ctx): boolean {
  const { options, storage, lexical } = ctx;
  const engine = engineOf(storage);
  if (engine.wanted) return true;
  const Recognition = options.recognition ?? browserSpeechRecognition();
  if (!Recognition) {
    report(ctx, 'unsupported');
    return false;
  }
  let recognition: SpeechRecognitionLike;
  try {
    recognition = new Recognition();
    recognition.lang = languageFor(lexical, options.lang);
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
  } catch {
    report(ctx, 'start-failed');
    return false;
  }
  Object.assign(engine, {
    recognition,
    wanted: true,
    handled: 0,
    lastFinal: '',
    restarts: 0,
    fatal: false,
  });
  const mine = () => engine.recognition === recognition;
  recognition.addEventListener('result', (event) => {
    if (mine()) onResult(ctx, event as SpeechResultEvent);
  });
  recognition.addEventListener('error', (event) => {
    if (!mine()) return;
    const code = (event as SpeechErrorEvent).error || 'unknown';
    // `aborted` is our own stop; `no-speech` is a pause, and it listens on.
    if (code === 'aborted' || code === 'no-speech') return;
    if (FATAL.has(code)) {
      engine.fatal = true;
      engine.wanted = false;
    }
    report(ctx, code);
  });
  recognition.addEventListener('end', () => {
    if (!mine()) return;
    // Engines stop after a pause even when continuous: start again until stopped.
    if (engine.wanted && !engine.fatal && engine.restarts < MAX_RESTARTS) {
      engine.restarts++;
      engine.handled = 0;
      engine.lastFinal = '';
      storage.interim.value = '';
      try {
        recognition.start();
        return;
      } catch {}
    }
    finish(ctx);
  });
  try {
    recognition.start();
  } catch {
    engine.recognition = null;
    engine.wanted = false;
    report(ctx, 'start-failed');
    return false;
  }
  storage.error.value = null;
  storage.listening.value = true;
  return true;
}

function stop(ctx: Ctx, abort = false, quiet = false): boolean {
  const engine = engineOf(ctx.storage);
  const { recognition } = engine;
  if (!recognition || !engine.wanted) return false;
  engine.wanted = false;
  // Off at once for the UI; `stop` still delivers what was being heard, then `end`.
  ctx.storage.listening.value = false;
  try {
    if (abort) recognition.abort();
    else recognition.stop();
  } catch {}
  if (abort) finish(ctx, quiet);
  return true;
}

/** Draw what is being heard at the caret, in a layer beside the document. */
function preview(lexical: LexicalEditor, storage: SpeechToTextStorage): () => void {
  let layer: HTMLElement | null = null;
  let bubble: HTMLElement | null = null;
  const frame = frameScheduler(() => {
    const text = storage.interim.peek();
    const root = lexical.getRootElement();
    if (!text || !root?.isConnected) {
      layer?.remove();
      layer = bubble = null;
      return;
    }
    if (!layer?.isConnected) {
      layer = createOverlay(root, 'tei-dictation');
      bubble = root.ownerDocument.createElement('span');
      bubble.className = 'tei-dictation-interim';
      layer.append(bubble);
    }
    if (!bubble) return;
    bubble.textContent = text;
    const selection = root.ownerDocument.getSelection();
    const range =
      selection && selection.rangeCount > 0 && root.contains(selection.anchorNode)
        ? selection.getRangeAt(0)
        : null;
    // jsdom has no layout for ranges.
    const caret =
      range && typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : null;
    const at = caret && (caret.width || caret.height) ? caret : root.getBoundingClientRect();
    const origin = layer.getBoundingClientRect();
    place(bubble, at.left - origin.left, at.bottom - origin.top + 4);
  });
  return mergeRegister(
    effect(() => {
      void storage.interim.value;
      frame.schedule();
    }),
    () => {
      frame.cancel();
      layer?.remove();
    },
  );
}

/**
 * Dictation with the Web Speech API: speak, and what is said is written at
 * the caret. What is still being heard shows beside the caret and stays
 * out of the document (and its undo history, and collaborators' view)
 * until it is final; each final phrase is one undo step. Phrases like
 * "new line", "comma" and "undo" act instead of being written (see
 * `voiceCommands`). Errors land in `storage.error`, are announced, and go
 * to `onError`.
 *
 * The toolbar button shows only where the browser can listen (Chrome,
 * Edge and Safari; not Firefox). Speech goes to the browser's speech
 * service, which may be online.
 */
export const SpeechToText = defineTeiExtension({
  name: NAME,
  config: {
    lang: null,
    voiceCommands: ENGLISH_VOICE_COMMANDS,
    preview: true,
    capitalize: true,
    recognition: null,
    onError: null,
  } as SpeechToTextOptions,
  storage: (): SpeechToTextStorage => {
    const storage: SpeechToTextStorage = {
      listening: signal(false),
      interim: signal(''),
      error: signal<DictationError | null>(null),
    };
    engines.set(storage, {
      recognition: null,
      wanted: false,
      handled: 0,
      lastFinal: '',
      restarts: 0,
      fatal: false,
    });
    return storage;
  },
  register: (ctx) => {
    const { lexical, options, storage } = ctx;
    return mergeRegister(
      effect(() => (options.preview ? preview(lexical, storage) : undefined)),
      // Read-only: nothing more is written.
      lexical.registerEditableListener((editable) => {
        if (!editable) stop(ctx, true);
      }),
      () => stop(ctx, true, true),
    );
  },
  commands: {
    startDictation: {
      run: (ctx) => {
        if (!ctx.editor.isEditable || !start(ctx)) return false;
        $touch();
      },
      can: ({ editor, options, storage }) =>
        editor.isEditable &&
        !storage.listening.peek() &&
        (options.recognition ?? browserSpeechRecognition()) !== null,
    },
    stopDictation: {
      run: (ctx) => {
        if (!stop(ctx)) return false;
        $touch();
      },
      can: ({ storage }) => storage.listening.peek(),
    },
    toggleDictation: {
      run: (ctx) => {
        const done = ctx.storage.listening.peek() ? stop(ctx) : ctx.editor.isEditable && start(ctx);
        if (!done) return false;
        $touch();
      },
      can: ({ editor, options, storage }) =>
        storage.listening.peek() ||
        (editor.isEditable && (options.recognition ?? browserSpeechRecognition()) !== null),
    },
  },
  active: { dictation: ({ storage }) => storage.listening.peek() },
  icons: { microphone },
  messages: {
    'dictation.toggle': 'Dictation',
    'dictation.description': 'Speak to write',
    'dictation.error': 'Dictation stopped: something went wrong',
    'dictation.error.unsupported': 'This browser cannot take dictation',
    'dictation.error.start-failed': 'Dictation could not start',
    'dictation.error.not-allowed': 'Dictation needs permission to use the microphone',
    'dictation.error.service-not-allowed': 'Dictation is not allowed here',
    'dictation.error.audio-capture': 'No microphone found',
    'dictation.error.network': 'Dictation stopped: the speech service could not be reached',
    'dictation.error.language-not-supported': 'Dictation does not support this language',
  },
  items: [
    {
      id: 'dictation',
      label: 'dictation.toggle',
      description: 'dictation.description',
      icon: 'microphone',
      in: ['toolbar'],
      group: 'advanced',
      order: 95,
      command: 'toggleDictation',
      active: 'dictation',
      // Always offered, so the server's toolbar and the browser's agree;
      // disabled (`can()`) where the browser cannot listen.
    },
  ],
});

/** The dictation state of an editor, if SpeechToText is installed. */
export function getDictationStorage(editor: TeiEditor): SpeechToTextStorage | undefined {
  return (editor.extension(NAME)?.output as { storage: SpeechToTextStorage } | undefined)?.storage;
}
