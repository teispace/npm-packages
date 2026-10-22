import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  HIGHLIGHT,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  type Transformer,
} from '@lexical/markdown';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  FORMAT_TEXT_COMMAND,
  type TextFormatType,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiContext, TeiIconNode } from '../../core/types.js';
import * as icons from '../../icons/index.js';
import { $canFormat, $hasFormat } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    toggleBold: [];
    setBold: [];
    unsetBold: [];
    toggleItalic: [];
    setItalic: [];
    unsetItalic: [];
    toggleUnderline: [];
    setUnderline: [];
    unsetUnderline: [];
    toggleStrike: [];
    setStrike: [];
    unsetStrike: [];
    toggleCode: [];
    setCode: [];
    unsetCode: [];
    toggleHighlight: [];
    setHighlight: [];
    unsetHighlight: [];
    toggleSubscript: [];
    setSubscript: [];
    unsetSubscript: [];
    toggleSuperscript: [];
    setSuperscript: [];
    unsetSuperscript: [];
    toggleLowercase: [];
    setLowercase: [];
    unsetLowercase: [];
    toggleUppercase: [];
    setUppercase: [];
    unsetUppercase: [];
    toggleCapitalize: [];
    setCapitalize: [];
    unsetCapitalize: [];
    clearFormatting: [];
  }
  interface TeiActiveStates {
    bold: [];
    italic: [];
    underline: [];
    strike: [];
    code: [];
    highlight: [];
    subscript: [];
    superscript: [];
    lowercase: [];
    uppercase: [];
    capitalize: [];
  }
}

interface MarkSpec {
  /** Name used in commands, active states, items and icons: `bold` → `toggleBold`. */
  name: string;
  format: TextFormatType;
  label: string;
  key?: string | readonly string[];
  icon: TeiIconNode;
  order: number;
  keywords?: readonly string[];
  markdown?: Record<string, Transformer>;
  /** Shown in the bubble menu as well as the toolbar. Default true. */
  bubble?: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One inline format as an extension: toggle/set/unset commands, an active
 * state, a shortcut, a toolbar and bubble-menu item, an icon and its
 * markdown. Commands go through Lexical's `FORMAT_TEXT_COMMAND`, so table
 * selections and every other listener behave as they do natively.
 */
function defineMark(spec: MarkSpec) {
  const Name = cap(spec.name);
  const toggle = ({ lexical }: TeiContext) =>
    $canFormat() && lexical.dispatchCommand(FORMAT_TEXT_COMMAND, spec.format);
  return defineTeiExtension({
    name: `@teispace/teieditor/${spec.name}`,
    dependencies: [RichText],
    commands: {
      [`toggle${Name}`]: { run: toggle, can: $canFormat },
      [`set${Name}`]: { run: (ctx) => $hasFormat(spec.format) || toggle(ctx), can: $canFormat },
      [`unset${Name}`]: { run: (ctx) => !$hasFormat(spec.format) || toggle(ctx), can: $canFormat },
    },
    active: { [spec.name]: () => $hasFormat(spec.format) },
    keymap: spec.key
      ? { [spec.name]: { key: spec.key, command: `toggle${Name}`, description: spec.label } }
      : undefined,
    icons: { [spec.name]: spec.icon },
    messages: { [`format.${spec.name}`]: spec.label },
    markdown: spec.markdown,
    items: [
      {
        id: spec.name,
        label: `format.${spec.name}`,
        icon: spec.name,
        in: spec.bubble === false ? ['toolbar'] : ['toolbar', 'bubble'],
        group: 'format',
        order: spec.order,
        keywords: spec.keywords,
        shortcut: spec.key ? spec.name : undefined,
        command: `toggle${Name}`,
        active: spec.name,
      },
    ],
  });
}

export const Bold = defineMark({
  name: 'bold',
  format: 'bold',
  label: 'Bold',
  key: 'Mod-b',
  icon: icons.bold,
  order: 0,
  keywords: ['strong'],
  markdown: {
    boldItalicStar: BOLD_ITALIC_STAR,
    boldItalicUnderscore: BOLD_ITALIC_UNDERSCORE,
    boldStar: BOLD_STAR,
    boldUnderscore: BOLD_UNDERSCORE,
  },
});

export const Italic = defineMark({
  name: 'italic',
  format: 'italic',
  label: 'Italic',
  key: 'Mod-i',
  icon: icons.italic,
  order: 1,
  keywords: ['emphasis'],
  markdown: {
    boldItalicStar: BOLD_ITALIC_STAR,
    boldItalicUnderscore: BOLD_ITALIC_UNDERSCORE,
    italicStar: ITALIC_STAR,
    italicUnderscore: ITALIC_UNDERSCORE,
  },
});

export const Underline = defineMark({
  name: 'underline',
  format: 'underline',
  label: 'Underline',
  key: 'Mod-u',
  icon: icons.underline,
  order: 2,
});

export const Strike = defineMark({
  name: 'strike',
  format: 'strikethrough',
  label: 'Strikethrough',
  key: ['Mod-Shift-x', 'Mod-Shift-s'],
  icon: icons.strikethrough,
  order: 3,
  keywords: ['strikethrough', 'delete'],
  markdown: { strikethrough: STRIKETHROUGH },
});

export const Code = defineMark({
  name: 'code',
  format: 'code',
  label: 'Inline code',
  key: 'Mod-e',
  icon: icons.code,
  order: 4,
  keywords: ['monospace'],
  markdown: { inlineCode: INLINE_CODE },
});

export const Highlight = defineMark({
  name: 'highlight',
  format: 'highlight',
  label: 'Highlight',
  key: 'Mod-Shift-h',
  icon: icons.highlight,
  order: 5,
  keywords: ['mark', 'marker'],
  markdown: { highlight: HIGHLIGHT },
});

export const Subscript = defineMark({
  name: 'subscript',
  format: 'subscript',
  label: 'Subscript',
  key: 'Mod-,',
  icon: icons.subscript,
  order: 6,
  bubble: false,
});

export const Superscript = defineMark({
  name: 'superscript',
  format: 'superscript',
  label: 'Superscript',
  key: 'Mod-.',
  icon: icons.superscript,
  order: 7,
  bubble: false,
});

export const Lowercase = defineMark({
  name: 'lowercase',
  format: 'lowercase',
  label: 'Lowercase',
  key: 'Ctrl-Shift-1',
  icon: icons.lowercase,
  order: 8,
  bubble: false,
});

export const Uppercase = defineMark({
  name: 'uppercase',
  format: 'uppercase',
  label: 'Uppercase',
  key: 'Ctrl-Shift-2',
  icon: icons.uppercase,
  order: 9,
  bubble: false,
});

export const Capitalize = defineMark({
  name: 'capitalize',
  format: 'capitalize',
  label: 'Capitalize',
  key: 'Ctrl-Shift-3',
  icon: icons.capitalize,
  order: 10,
  bubble: false,
});

/**
 * Remove every inline format and inline style from the selected text —
 * bold, colour, font size — keeping the blocks and links as they are.
 */
export const ClearFormatting = defineTeiExtension({
  name: '@teispace/teieditor/clear-formatting',
  dependencies: [RichText],
  commands: {
    clearFormatting: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          if ($isRangeSelection(selection)) {
            selection.setFormat(0);
            selection.setStyle('');
            return true;
          }
          return false;
        }
        // extract() splits the text at the selection edges, so only the
        // selected part loses its formatting.
        for (const node of selection.extract()) {
          if ($isTextNode(node)) {
            node.setFormat(0);
            node.setStyle('');
          }
        }
        selection.setFormat(0);
        selection.setStyle('');
      },
      can: () => $isRangeSelection($getSelection()),
    },
  },
  keymap: {
    clearFormatting: { key: 'Mod-\\', command: 'clearFormatting', description: 'Clear formatting' },
  },
  icons: { clearFormatting: icons.clearFormatting },
  messages: { 'format.clear': 'Clear formatting' },
  items: [
    {
      id: 'clearFormatting',
      label: 'format.clear',
      icon: 'clearFormatting',
      in: ['toolbar', 'bubble', 'contextMenu'],
      group: 'format',
      order: 100,
      keywords: ['reset', 'remove', 'plain'],
      shortcut: 'clearFormatting',
      command: 'clearFormatting',
    },
  ],
});

/** Every inline format, as a preset: `extensions: [Formatting]`. */
export const Formatting = [
  Bold,
  Italic,
  Underline,
  Strike,
  Code,
  Highlight,
  Subscript,
  Superscript,
  Lowercase,
  Uppercase,
  Capitalize,
  ClearFormatting,
] as const;
