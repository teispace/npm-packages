import {
  $isElementNode,
  type ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiItem } from '../../core/types.js';
import {
  alignCenter,
  alignJustify,
  alignLeft,
  alignRight,
  indent as indentIcon,
  outdent as outdentIcon,
} from '../../icons/index.js';
import { $canFormat, $selectedBlocks } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

export type TextAlignment = Exclude<ElementFormatType, ''>;

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setTextAlign: [alignment: TextAlignment];
    unsetTextAlign: [];
    indent: [];
    outdent: [];
    /** Indent on Tab, when `tabIndents` is on; declines otherwise so Tab moves focus. */
    tabIndent: [];
    tabOutdent: [];
  }
  interface TeiActiveStates {
    textAlign: [alignment: TextAlignment];
  }
}

export interface TextAlignOptions {
  /** The alignments on offer. Default left, center, right, justify. */
  alignments: readonly TextAlignment[];
}

/** The alignment of the selected blocks, if they all agree. `''` is the default (start). */
export function $alignmentAtSelection(): ElementFormatType | null {
  const blocks = $selectedBlocks();
  if (blocks.length === 0) return null;
  const first = blocks[0]?.getFormatType() ?? '';
  return blocks.every((b) => b.getFormatType() === first) ? first : null;
}

const ALIGN: ReadonlyArray<{
  value: TextAlignment;
  label: string;
  key: string;
  icon: string;
}> = [
  { value: 'left', label: 'Align left', key: 'Mod-Shift-l', icon: 'alignLeft' },
  { value: 'center', label: 'Align center', key: 'Mod-Shift-e', icon: 'alignCenter' },
  { value: 'right', label: 'Align right', key: 'Mod-Shift-r', icon: 'alignRight' },
  { value: 'justify', label: 'Justify', key: 'Mod-Shift-j', icon: 'alignJustify' },
];

/** Text alignment for blocks: left, center, right, justify (and start/end). */
export const TextAlign = defineTeiExtension({
  name: '@teispace/teieditor/text-align',
  config: { alignments: ['left', 'center', 'right', 'justify'] } as TextAlignOptions,
  dependencies: [RichText],
  commands: {
    setTextAlign: {
      run: ({ lexical, options }, alignment: TextAlignment) =>
        options.alignments.includes(alignment) &&
        lexical.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment),
      can: ({ options }, alignment: TextAlignment) =>
        options.alignments.includes(alignment) && $canFormat(),
    },
    unsetTextAlign: {
      run: ({ lexical }) => lexical.dispatchCommand(FORMAT_ELEMENT_COMMAND, ''),
      can: $canFormat,
    },
  },
  active: {
    textAlign: (_ctx, alignment: TextAlignment) => {
      const current = $alignmentAtSelection();
      // Unaligned text reads as left-aligned in a left-to-right document.
      return (
        current === alignment || (alignment === 'left' && (current === '' || current === 'start'))
      );
    },
  },
  keymap: Object.fromEntries(
    ALIGN.map((a) => [
      `align-${a.value}`,
      { key: a.key, command: 'setTextAlign', args: [a.value], description: a.label },
    ]),
  ),
  icons: { alignLeft, alignCenter, alignRight, alignJustify },
  messages: {
    ...Object.fromEntries(ALIGN.map((a) => [`align.${a.value}`, a.label])),
    align: 'Align',
  },
  items: ALIGN.map(
    (a, i): TeiItem => ({
      id: `align-${a.value}`,
      label: `align.${a.value}`,
      icon: a.icon,
      in: ['toolbar'],
      group: 'align',
      order: i,
      shortcut: `align-${a.value}`,
      command: 'setTextAlign',
      args: [a.value],
      active: 'textAlign',
      activeArgs: [a.value],
      visible: (editor) =>
        editor.extension(TextAlign)?.output.options.alignments.value.includes(a.value) ?? false,
    }),
  ),
});

export interface IndentOptions {
  /** Deepest indent level; `null` for no limit. Default 7. */
  maxIndent: number | null;
  /** Indent with Tab (lists always do). Off by default: Tab should leave the editor. */
  tabIndents: boolean;
}

/** Block indentation: ⌘] and ⌘[; Tab too, when enabled. */
export const Indent = defineTeiExtension({
  name: '@teispace/teieditor/indent',
  config: { maxIndent: 7, tabIndents: false } as IndentOptions,
  dependencies: [RichText],
  commands: {
    indent: {
      run: ({ lexical, options }) => {
        const max = options.maxIndent;
        if (max !== null && $selectedBlocks().every((b) => b.getIndent() >= max)) return false;
        return lexical.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
      },
      can: ({ options }) => {
        const blocks = $selectedBlocks().filter($isElementNode);
        const max = options.maxIndent;
        return blocks.length > 0 && (max === null || blocks.some((b) => b.getIndent() < max));
      },
    },
    outdent: {
      run: ({ lexical }) => lexical.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined),
      can: () => $selectedBlocks().some((b) => b.getIndent() > 0),
    },
    tabIndent: {
      run: ({ editor, options }) => options.tabIndents && editor.commands.indent(),
    },
    tabOutdent: {
      run: ({ editor, options }) => options.tabIndents && editor.commands.outdent(),
    },
  },
  keymap: {
    indent: { key: 'Mod-]', command: 'indent', description: 'Indent' },
    outdent: { key: 'Mod-[', command: 'outdent', description: 'Outdent' },
    // After the list keymap's Tab (same key): a binding that declines falls through.
    tabIndent: { key: 'Tab', command: 'tabIndent', description: 'Indent' },
    tabOutdent: { key: 'Shift-Tab', command: 'tabOutdent', description: 'Outdent' },
  },
  icons: { indent: indentIcon, outdent: outdentIcon },
  messages: { 'indent.in': 'Indent', 'indent.out': 'Outdent' },
  items: [
    {
      id: 'outdent',
      label: 'indent.out',
      icon: 'outdent',
      in: ['toolbar'],
      group: 'align',
      order: 10,
      shortcut: 'outdent',
      command: 'outdent',
    },
    {
      id: 'indent',
      label: 'indent.in',
      icon: 'indent',
      in: ['toolbar'],
      group: 'align',
      order: 11,
      shortcut: 'indent',
      command: 'indent',
    },
  ],
});
