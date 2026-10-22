import {
  $create,
  $getDocument,
  $getEditor,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type SerializedLexicalNode,
} from 'lexical';
import { getPeerOptions } from '../../core/define.js';
import { editorLocale } from '../../utils/locale.js';

/** The extension's name, which the node asks for its options. */
export const DATE_TIME_EXTENSION = '@teispace/teieditor/date-time';

export interface DateTimeOptions {
  /** The language dates are written in. Default: the nearest `lang` round the editor, else the browser's. */
  locale: string | null;
  /** Write a date your own way. Default: `Intl.DateTimeFormat`'s medium date (and short time). */
  format: ((date: Date, showTime: boolean, locale: string | undefined) => string) | null;
}

export interface SerializedDateTimeNode extends SerializedLexicalNode {
  /** `2026-10-22` for a day; an ISO instant, `2026-10-22T14:30:00.000Z`, with a time. */
  value: string;
  showTime: boolean;
}

/** A day or a moment, checked: `null` when it is not a real one. */
export interface DateTimeValue {
  value: string;
  showTime: boolean;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOMENT =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?$/i;

const pad = (n: number) => String(n).padStart(2, '0');

/** A date's own day where it is shown, `2026-10-22`. */
export const localDay = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Whether `2026-02-30` is a day that exists. */
function realDay(value: string): boolean {
  const match = DAY.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Read a date: a `Date`, a day (`2026-10-22`) or an ISO date and time. A
 * day stays a day, whatever the time zone; a time is kept as the instant
 * it names. `showTime` turns one into the other. Anything else is `null`.
 */
export function parseDateTime(input: unknown, showTime?: boolean): DateTimeValue | null {
  let date: Date;
  if (input instanceof Date) date = input;
  else if (typeof input !== 'string') return null;
  else {
    const text = input.trim();
    if (DAY.test(text)) {
      if (!realDay(text)) return null;
      if (!showTime) return { value: text, showTime: false };
      date = new Date(`${text}T09:00`);
    } else if (MOMENT.test(text) && realDay(text.slice(0, 10))) date = new Date(text);
    else return null;
  }
  if (Number.isNaN(date.getTime())) return null;
  return showTime === false
    ? { value: localDay(date), showTime: false }
    : { value: date.toISOString(), showTime: true };
}

/** The `Date` a value stands for; a day is its UTC midnight. */
export function dateOf(value: DateTimeValue): Date {
  return new Date(value.showTime ? value.value : `${value.value}T00:00:00Z`);
}

/** A value written for people, in `locale`. */
export function formatDateTime(
  value: DateTimeValue,
  locale?: string,
  format?: DateTimeOptions['format'],
): string {
  const date = dateOf(value);
  if (format) return format(date, value.showTime, locale);
  return new Intl.DateTimeFormat(
    locale,
    value.showTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium', timeZone: 'UTC' },
  ).format(date);
}

/** The editor at work, if any: none while a node is made outside one. */
function $editor(): LexicalEditor | undefined {
  try {
    return $getEditor();
  } catch {
    return undefined;
  }
}

/**
 * A date, or a date and time, in a line of text: a chip that reads in the
 * editor's language, while the document keeps the ISO value. Saved as
 * `<time datetime="2026-10-22">Oct 22, 2026</time>`.
 */
export class DateTimeNode extends DecoratorNode<null> {
  __value = '1970-01-01';
  __showTime = false;

  $config() {
    return this.config('date-time', { extends: DecoratorNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__value = prev.__value;
    this.__showTime = prev.__showTime;
  }

  getValue(): string {
    return this.getLatest().__value;
  }

  getShowTime(): boolean {
    return this.getLatest().__showTime;
  }

  getDate(): Date {
    const self = this.getLatest();
    return dateOf({ value: self.__value, showTime: self.__showTime });
  }

  /** A new date (a `Date`, a day or an ISO string); one that is not a real date is refused. */
  setDateTime(value: string | Date, showTime?: boolean): this {
    const parsed = parseDateTime(value, showTime);
    const self = this.getWritable();
    if (parsed) {
      self.__value = parsed.value;
      self.__showTime = parsed.showTime;
    }
    return self;
  }

  /** As people read it, in the editor's language. */
  getFormatted(): string {
    const lexical = $editor();
    const options = lexical && getPeerOptions<DateTimeOptions>(lexical, DATE_TIME_EXTENSION);
    const self = this.getLatest();
    return formatDateTime(
      { value: self.__value, showTime: self.__showTime },
      editorLocale(lexical, options?.locale),
      options?.format,
    );
  }

  // -- JSON ------------------------------------------------------------------

  updateFromJSON(json: LexicalUpdateJSON<SerializedDateTimeNode>): this {
    const self = super.updateFromJSON(json);
    const data = json as Partial<SerializedDateTimeNode>;
    return typeof data.value === 'string'
      ? self.setDateTime(data.value, typeof data.showTime === 'boolean' ? data.showTime : undefined)
      : self;
  }

  exportJSON(): SerializedDateTimeNode {
    return { ...super.exportJSON(), value: this.getValue(), showTime: this.getShowTime() };
  }

  // -- DOM -------------------------------------------------------------------

  createDOM(config: EditorConfig): HTMLElement {
    const time = $getDocument().createElement('time');
    time.className = (config.theme.dateTime as string | undefined) ?? 'tei-date-time';
    time.setAttribute('contenteditable', 'false');
    time.setAttribute('data-tei-date-time', '');
    this.#paint(time);
    return time;
  }

  updateDOM(_prev: this, dom: HTMLElement): false {
    this.#paint(dom);
    return false;
  }

  #paint(time: HTMLElement): void {
    time.setAttribute('datetime', this.__value);
    const text = this.getFormatted();
    if (time.textContent !== text) time.textContent = text;
  }

  exportDOM(): DOMExportOutput {
    const time = $getDocument().createElement('time');
    time.setAttribute('datetime', this.getValue());
    time.textContent = this.getFormatted();
    return { element: time };
  }

  decorate(): null {
    return null;
  }

  isInline(): true {
    return true;
  }

  getTextContent(): string {
    return this.getFormatted();
  }
}

export function $createDateTimeNode(value: DateTimeValue): DateTimeNode {
  return $create(DateTimeNode).setDateTime(value.value, value.showTime);
}

export function $isDateTimeNode(node: LexicalNode | null | undefined): node is DateTimeNode {
  return node instanceof DateTimeNode;
}
