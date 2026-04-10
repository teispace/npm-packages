import type { TeiExtension } from '../../core/types.js';
import { Alignment } from '../alignment/index.js';
import { Blockquote } from '../blockquote/index.js';
import { Bold } from '../bold/index.js';
import { Callout } from '../callout/index.js';
import { InlineCode } from '../code/index.js';
import { CodeBlock } from '../code-block/index.js';
import { Color } from '../color/index.js';
import { DateTime } from '../datetime/index.js';
import { DragDropPaste } from '../drag-drop-paste/index.js';
import { DragHandle } from '../drag-handle/index.js';
import { Embed } from '../embed/index.js';
import { Emoji } from '../emoji/index.js';
import { Figma } from '../figma/index.js';
import { File } from '../file/index.js';
import { FindReplace } from '../find-replace/index.js';
import { FontFamily } from '../font-family/index.js';
import { FontSize } from '../font-size/index.js';
import { Heading } from '../heading/index.js';
import { Highlight } from '../highlight/index.js';
import { History } from '../history/index.js';
import { HorizontalRule } from '../horizontal-rule/index.js';
import { Image } from '../image/index.js';
import { Italic } from '../italic/index.js';
import { Layout } from '../layout/index.js';
import { Link } from '../link/index.js';
import { List } from '../list/index.js';
import { ListMaxIndent } from '../list-max-indent/index.js';
import { Markdown } from '../markdown/index.js';
import { Math } from '../math/index.js';
import { Mention } from '../mention/index.js';
import { PageBreak } from '../page-break/index.js';
import { Paragraph } from '../paragraph/index.js';
import { Placeholder } from '../placeholder/index.js';
import { SlashCommand } from '../slash-command/index.js';
import { Strikethrough } from '../strikethrough/index.js';
import { Subscript } from '../subscript/index.js';
import { Superscript } from '../superscript/index.js';
import { Table } from '../table/index.js';
import { Toggle } from '../toggle/index.js';
import { TurnInto } from '../turn-into/index.js';
import { Twitter } from '../twitter/index.js';
import { Underline } from '../underline/index.js';
import { WordCount } from '../word-count/index.js';
import { YouTube } from '../youtube/index.js';

/**
 * Full-featured starter kit with all built-in extensions.
 *
 * Includes: text formatting, headings, lists, links, code blocks,
 * alignment, font controls, colors, slash commands, drag handle,
 * placeholders, turn-into, and history.
 */
export const StarterKit: TeiExtension[] = [
  // Block-level
  Paragraph,
  Heading,
  Blockquote,
  HorizontalRule,
  List,
  CodeBlock,

  // Text formatting
  Bold,
  Italic,
  Underline,
  Strikethrough,
  InlineCode,
  Highlight,
  Subscript,
  Superscript,

  // Features
  Link,
  Alignment,
  FontSize,
  FontFamily,
  Color,

  // Notion-like
  SlashCommand,
  DragHandle,
  Placeholder,
  TurnInto,

  // Rich content
  Image,
  Table,
  Embed,
  Callout,
  Toggle,
  File,

  // Media embeds
  YouTube,
  Twitter,
  Figma,

  // Layout & structure
  Layout,
  PageBreak,

  // Advanced
  Mention,
  Emoji,
  Markdown,
  FindReplace,
  WordCount,
  Math,
  DateTime,
  DragDropPaste,
  ListMaxIndent,

  // Utilities
  History,
];

// Re-export commonly needed extensions for editor presets
export { SlashCommand } from '../slash-command/index.js';
