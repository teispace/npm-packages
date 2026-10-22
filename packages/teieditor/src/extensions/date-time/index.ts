import { configExtension, type Signal, signal } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import type { TextMatchTransformer } from '@lexical/markdown';
import {
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getPreviousSelection,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  mergeRegister,
  type NodeKey,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { registerHostSelection, registerSelectedAttribute } from '../../core/slot-host.js';
import { hasUi, requestUi, type UiRequest, uiRequest } from '../../core/ui-request.js';
import { calendar, clock, trash } from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';
import {
  $createDateTimeNode,
  $isDateTimeNode,
  DATE_TIME_EXTENSION,
  DateTimeNode,
  type DateTimeOptions,
  localDay,
  parseDateTime,
} from './node.js';

export type { DateTimeOptions, DateTimeValue, SerializedDateTimeNode } from './node.js';
export {
  $createDateTimeNode,
  $isDateTimeNode,
  DATE_TIME_EXTENSION,
  DateTimeNode,
  dateOf,
  formatDateTime,
  localDay,
  parseDateTime,
} from './node.js';

/** What `insertDateTime` puts in: a value, or a word for one that is read when it runs. */
export interface InsertDateTime {
  /** A `Date`, a day or an ISO string; or `'today'`, `'tomorrow'`, `'now'`. Default today. */
  value?: string | Date;
  /** With the time of day. Default: only for `'now'`, or a value with a time. */
  showTime?: boolean;
  /** Open the picker on it, where there is a UI for one. */
  pick?: boolean;
}

export interface DateTimeStorage {
  /** `openDateTimePicker`'s requests to the UI. */
  readonly picker: UiRequest;
  /** The date the picker is for. */
  readonly pickerFor: Signal<NodeKey | null>;
}

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** A date in the text where the caret is. */
    insertDateTime: [options?: InsertDateTime];
    /** Change the selected date (or the one with `key`). */
    setDateTime: [value: string | Date, showTime?: boolean, key?: NodeKey];
    /** Open the picker for the selected date (or the one with `key`), where there is a UI. */
    openDateTimePicker: [key?: NodeKey];
    removeDateTime: [key?: NodeKey];
  }
  interface TeiActiveStates {
    /** A date is selected. */
    dateTime: [];
  }
}

/** The date with this key, else the selected one. */
export function $getDateTime(key?: NodeKey): DateTimeNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isDateTimeNode(node) ? node : null;
  }
  const selection = $getSelection();
  const nodes = $isNodeSelection(selection) ? selection.getNodes() : [];
  return nodes.length === 1 && $isDateTimeNode(nodes[0]) ? nodes[0] : null;
}

/** `today`, `tomorrow` and `now`, read now; anything else as it is. */
function resolve(value: InsertDateTime['value'], showTime?: boolean) {
  const now = new Date();
  if (value === undefined || value === 'today') return parseDateTime(localDay(now), showTime);
  if (value === 'tomorrow') {
    now.setDate(now.getDate() + 1);
    return parseDateTime(localDay(now), showTime);
  }
  if (value === 'now') return parseDateTime(now, showTime ?? true);
  return parseDateTime(value, showTime);
}

const $canInsert = () => $isRangeSelection($getSelection() ?? $getPreviousSelection());

// -- HTML and Markdown --------------------------------------------------------

/** Any `<time datetime>` with a real date; the rest stay text. */
const TIME_RULE = defineImportRule({
  name: DATE_TIME_EXTENSION,
  match: sel.tag('time'),
  $import: (_ctx, el, $next) => {
    const value = parseDateTime(el.getAttribute('datetime'));
    return value ? [$createDateTimeNode(value)] : $next();
  },
});

const escapeHTML = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
const unescapeHTML = (text: string) =>
  text.replace(/&(amp|lt|gt|quot);/g, (_, n: string) =>
    n === 'amp' ? '&' : n === 'lt' ? '<' : n === 'gt' ? '>' : '"',
  );

/**
 * As the HTML `<time datetime="2026-10-22">Oct 22, 2026</time>`: Markdown
 * allows it inline, renderers show the date, and it reads back whole. One
 * that is not a real date reads back as its text.
 */
export const DATE_TIME: TextMatchTransformer = {
  dependencies: [DateTimeNode],
  export: (node) =>
    $isDateTimeNode(node)
      ? `<time datetime="${escapeHTML(node.getValue())}">${escapeHTML(node.getFormatted())}</time>`
      : null,
  importRegExp: /<time datetime="([^"<>]*)">([^<]*)<\/time>/,
  // Only read whole, never made by typing.
  regExp: /(?!)/,
  replace: (textNode, match) => {
    const value = parseDateTime(unescapeHTML(match[1] ?? ''));
    if (value) textNode.replace($createDateTimeNode(value));
    else textNode.replace($createTextNode(unescapeHTML(match[2] ?? '')));
  },
  type: 'text-match',
};

// -- Extension ----------------------------------------------------------------

type Ctx = { storage: DateTimeStorage };

/** Ask the UI for the picker on this date. */
function $openPicker({ storage }: Ctx, node: DateTimeNode): boolean {
  if (!hasUi(storage.picker)) return false;
  storage.pickerFor.value = node.getKey();
  return requestUi(storage.picker);
}

/**
 * Dates in the text: `/date` picks one, `/today`, `/tomorrow` and `/now`
 * put one straight in. Each shows in the editor's language (or the
 * `locale` option) and keeps its ISO value, a day staying the same day in
 * every time zone. A click (or Enter on a selected date) opens the picker
 * where the UI has one. Saved as `<time datetime>`, which reads back from
 * any page.
 *
 * In React, `<DateTimePicker>` is the picker.
 */
export const DateTime = defineTeiExtension({
  name: DATE_TIME_EXTENSION,
  config: { locale: null, format: null } as DateTimeOptions,
  nodes: [DateTimeNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [TIME_RULE] })],
  storage: (): DateTimeStorage => ({ picker: uiRequest(), pickerFor: signal(null) }),
  markdown: { dateTime: DATE_TIME },
  register: (ctx) => {
    const { lexical, editor } = ctx;
    const { storage } = ctx as unknown as Ctx;
    // A click on a date opens its picker, when there is one.
    const onClick = (event: MouseEvent) => {
      const chip = (event.target as Element | null)?.closest?.('[data-tei-date-time]');
      if (!chip || !lexical.isEditable() || !hasUi(storage.picker)) return;
      const key = lexical.read(() => {
        const node = $getNearestNodeFromDOMNode(chip);
        return $isDateTimeNode(node) ? node.getKey() : null;
      });
      if (key !== null) editor.commands.openDateTimePicker(key);
    };
    return mergeRegister(
      registerHostSelection(lexical, $isDateTimeNode),
      registerSelectedAttribute(lexical, $isDateTimeNode),
      lexical.registerRootListener((root, prev) => {
        prev?.removeEventListener('click', onClick);
        root?.addEventListener('click', onClick);
      }),
      lexical.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          const node = $getDateTime();
          if (!node || !$openPicker(ctx as unknown as Ctx, node)) return false;
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  },
  commands: {
    insertDateTime: {
      run: (ctx, options?: InsertDateTime) => {
        const value = resolve(options?.value, options?.showTime);
        if (!value) return false;
        let selection = $getSelection();
        const previous = $getPreviousSelection();
        if (!selection && $isRangeSelection(previous)) {
          $setSelection(previous.clone());
          selection = $getSelection();
        }
        if (!$isRangeSelection(selection)) return false;
        const node = $createDateTimeNode(value);
        selection.insertNodes([node]);
        if (options?.pick) $openPicker(ctx as unknown as Ctx, node);
      },
      can: (_ctx, options?: InsertDateTime) =>
        $canInsert() && (options?.value === undefined || resolve(options.value) !== null),
    },
    setDateTime: {
      run: (_ctx, value: string | Date, showTime?: boolean, key?: NodeKey) => {
        const node = $getDateTime(key);
        const parsed = parseDateTime(value, showTime);
        if (!node || !parsed) return false;
        if (node.getValue() !== parsed.value || node.getShowTime() !== parsed.showTime)
          node.setDateTime(parsed.value, parsed.showTime);
      },
      can: (_ctx, value?: string | Date, showTime?: boolean, key?: NodeKey) =>
        $getDateTime(key) !== null &&
        (value === undefined || parseDateTime(value, showTime) !== null),
    },
    openDateTimePicker: {
      run: (ctx, key?: NodeKey) => {
        const node = $getDateTime(key);
        return node !== null && $openPicker(ctx as unknown as Ctx, node);
      },
      can: ({ storage }, key?: NodeKey) => hasUi(storage.picker) && $getDateTime(key) !== null,
    },
    removeDateTime: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getDateTime(key);
        if (!node) return false;
        const before = node.getPreviousSibling();
        if (before) before.selectEnd();
        else node.selectPrevious();
        node.remove();
      },
      can: (_ctx, key?: NodeKey) => $getDateTime(key) !== null,
    },
  },
  active: { dateTime: () => $getDateTime() !== null },
  icons: { calendar, clock, trash },
  messages: {
    'dateTime.insert': 'Date',
    'dateTime.insert.description': 'Pick a date',
    'dateTime.today': 'Today',
    'dateTime.today.description': 'Today’s date',
    'dateTime.tomorrow': 'Tomorrow',
    'dateTime.tomorrow.description': 'Tomorrow’s date',
    'dateTime.now': 'Now',
    'dateTime.now.description': 'The date and time now',
    'dateTime.picker': 'Date and time',
    'dateTime.date': 'Date',
    'dateTime.time': 'Time',
    'dateTime.includeTime': 'Include time',
    'dateTime.remove': 'Remove date',
    'dateTime.done': 'Done',
  },
  items: [
    {
      id: 'insertDate',
      label: 'dateTime.insert',
      description: 'dateTime.insert.description',
      icon: 'calendar',
      in: ['slash', 'insert'],
      group: 'insert',
      order: 70,
      keywords: ['date', 'calendar', 'day', 'time'],
      command: 'insertDateTime',
      args: [{ pick: true }],
    },
    {
      id: 'insertToday',
      label: 'dateTime.today',
      description: 'dateTime.today.description',
      icon: 'calendar',
      in: ['slash'],
      group: 'insert',
      order: 71,
      keywords: ['today', 'date'],
      command: 'insertDateTime',
      args: [{ value: 'today' }],
    },
    {
      id: 'insertTomorrow',
      label: 'dateTime.tomorrow',
      description: 'dateTime.tomorrow.description',
      icon: 'calendar',
      in: ['slash'],
      group: 'insert',
      order: 72,
      keywords: ['tomorrow', 'date'],
      command: 'insertDateTime',
      args: [{ value: 'tomorrow' }],
    },
    {
      id: 'insertNow',
      label: 'dateTime.now',
      description: 'dateTime.now.description',
      icon: 'clock',
      in: ['slash'],
      group: 'insert',
      order: 73,
      keywords: ['now', 'time', 'date', 'timestamp'],
      command: 'insertDateTime',
      args: [{ value: 'now' }],
    },
  ],
});
