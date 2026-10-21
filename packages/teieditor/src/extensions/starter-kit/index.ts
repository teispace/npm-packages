import type { TeiExtensionInput } from '../../core/create.js';
import { Indent, TextAlign } from '../alignment/index.js';
import { Blockquote } from '../blockquote/index.js';
import { CodeBlock } from '../code-block/index.js';
import { CodeHighlight } from '../code-highlight/index.js';
import {
  Bold,
  ClearFormatting,
  Code,
  Highlight,
  Italic,
  Strike,
  Subscript,
  Superscript,
  Underline,
} from '../formatting/index.js';
import { Heading } from '../heading/index.js';
import { History } from '../history/index.js';
import { HorizontalRule } from '../horizontal-rule/index.js';
import { AutoLink, Link } from '../link/index.js';
import { BulletList, CheckList, OrderedList } from '../list/index.js';
import { Markdown } from '../markdown/index.js';
import { Placeholder } from '../placeholder/index.js';
import { RichText } from '../rich-text/index.js';

/** The parts of the kit, by the key `configure` takes. */
const PARTS = {
  richText: RichText,
  history: History,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strike: Strike,
  code: Code,
  highlight: Highlight,
  subscript: Subscript,
  superscript: Superscript,
  clearFormatting: ClearFormatting,
  heading: Heading,
  blockquote: Blockquote,
  bulletList: BulletList,
  orderedList: OrderedList,
  checkList: CheckList,
  codeBlock: CodeBlock,
  codeHighlight: CodeHighlight,
  horizontalRule: HorizontalRule,
  link: Link,
  autoLink: AutoLink,
  textAlign: TextAlign,
  indent: Indent,
  placeholder: Placeholder,
  markdown: Markdown,
} as const;

type Parts = typeof PARTS;
type OptionsOf<E> = E extends { configure: (options: infer O) => unknown } ? O : never;

/**
 * Per part: `false` leaves it out, an object configures it, anything else
 * keeps the default.
 */
export type StarterKitOptions = {
  [K in keyof Parts]?: false | OptionsOf<Parts[K]>;
};

function build(options: StarterKitOptions = {}): TeiExtensionInput[] {
  return (Object.keys(PARTS) as Array<keyof Parts>).map((key) => {
    const choice = options[key];
    if (choice === false) return null;
    const part = PARTS[key] as Parts[keyof Parts] & { configure: (o: object) => TeiExtensionInput };
    return choice ? part.configure(choice) : part;
  });
}

/**
 * Everything most documents need: text formats, headings, quotes, lists and
 * to-dos, code with highlighting, dividers, links, alignment, history,
 * markdown shortcuts and placeholders. Leave parts out or configure them:
 *
 * ```ts
 * StarterKit.configure({ underline: false, heading: { levels: [1, 2, 3] } })
 * ```
 *
 * Commands, keys and menu items of a part that is left out are gone too.
 */
export const StarterKit: readonly TeiExtensionInput[] & {
  configure: (options: StarterKitOptions) => readonly TeiExtensionInput[];
} = Object.assign(build(), { configure: build });

// Every part, from here too. Besides the convenience, this loads each part's
// types wherever the kit's do, and with them the commands each part adds to
// `TeiCommands`: without it, `editor.commands.toggleBold` would not type-check
// for an app that imports only the kit.
export { Indent, TextAlign } from '../alignment/index.js';
export { Blockquote } from '../blockquote/index.js';
export { CodeBlock } from '../code-block/index.js';
export { CodeHighlight } from '../code-highlight/index.js';
export {
  Bold,
  ClearFormatting,
  Code,
  Highlight,
  Italic,
  Strike,
  Subscript,
  Superscript,
  Underline,
} from '../formatting/index.js';

export { Heading } from '../heading/index.js';
export { History } from '../history/index.js';
export { HorizontalRule } from '../horizontal-rule/index.js';
export { AutoLink, Link } from '../link/index.js';
export { BulletList, CheckList, OrderedList } from '../list/index.js';
export { Markdown } from '../markdown/index.js';
export { Placeholder } from '../placeholder/index.js';
export { RichText } from '../rich-text/index.js';
