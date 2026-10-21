import { HEADING } from '@lexical/markdown';
import { $createHeadingNode, $isHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $getSelection, $isRangeSelection } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiItem } from '../../core/types.js';
import { heading1, heading2, heading3, heading4, heading5, heading6 } from '../../icons/index.js';
import { $everyBlock } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setHeading: [level: HeadingLevel];
    toggleHeading: [level: HeadingLevel];
  }
  interface TeiActiveStates {
    /** Any heading, or one of a level. */
    heading: [level?: HeadingLevel];
  }
}

export interface HeadingOptions {
  /** The levels on offer: commands refuse others, and only these get menu items. */
  levels: readonly HeadingLevel[];
}

const LEVELS = [1, 2, 3, 4, 5, 6] as const;

const isAllowed = (options: HeadingOptions, level: unknown): level is HeadingLevel =>
  options.levels.includes(level as HeadingLevel);

const $isHeading = (level?: HeadingLevel) =>
  $everyBlock((block) => $isHeadingNode(block) && (!level || block.getTag() === `h${level}`));

const offered = (level: HeadingLevel) => (editor: TeiEditor) =>
  editor.extension(Heading)?.output.options.levels.value.includes(level) ?? false;

/** Headings, h1–h6 (or the levels you allow). Markdown `#`–`######`, ⌘⌥1–6. */
export const Heading = defineTeiExtension({
  name: '@teispace/teieditor/heading',
  config: { levels: LEVELS } as HeadingOptions,
  dependencies: [RichText],
  commands: {
    setHeading: {
      run: ({ options }, level: HeadingLevel) => {
        const selection = $getSelection();
        if (!isAllowed(options, level) || !$isRangeSelection(selection)) return false;
        $setBlocksType(selection, () => $createHeadingNode(`h${level}` as HeadingTagType));
      },
      can: ({ options }, level: HeadingLevel) =>
        isAllowed(options, level) && $isRangeSelection($getSelection()),
    },
    toggleHeading: {
      run: ({ options }, level: HeadingLevel) => {
        const selection = $getSelection();
        if (!isAllowed(options, level) || !$isRangeSelection(selection)) return false;
        $setBlocksType(selection, () =>
          $isHeading(level) ? $createParagraphNode() : $createHeadingNode(`h${level}`),
        );
      },
      can: ({ options }, level: HeadingLevel) =>
        isAllowed(options, level) && $isRangeSelection($getSelection()),
    },
  },
  active: {
    heading: (_ctx, level?: HeadingLevel) => $isHeading(level),
  },
  keymap: Object.fromEntries(
    LEVELS.map((level) => [
      `heading${level}`,
      {
        key: `Mod-Alt-${level}`,
        command: 'toggleHeading',
        args: [level],
        description: `Heading ${level}`,
      },
    ]),
  ),
  markdown: { heading: HEADING },
  icons: { heading1, heading2, heading3, heading4, heading5, heading6 },
  messages: Object.fromEntries(
    LEVELS.flatMap((level) => [
      [`block.heading${level}`, `Heading ${level}`],
      [
        `block.heading${level}.description`,
        level === 1
          ? 'Large section heading'
          : level === 2
            ? 'Medium section heading'
            : 'Small section heading',
      ],
    ]),
  ),
  items: LEVELS.map(
    (level): TeiItem => ({
      id: `heading${level}`,
      label: `block.heading${level}`,
      description: `block.heading${level}.description`,
      icon: `heading${level}`,
      in: level <= 3 ? ['blockType', 'slash', 'blockMenu'] : ['blockType', 'slash'],
      group: 'basic',
      order: level,
      keywords: [`h${level}`, 'heading', 'title', '#'.repeat(level)],
      shortcut: `heading${level}`,
      command: 'setHeading',
      args: [level],
      active: 'heading',
      activeArgs: [level],
      visible: offered(level),
    }),
  ),
});
