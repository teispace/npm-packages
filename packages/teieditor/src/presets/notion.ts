import type { TeiPreset } from '../core/preset.js';
import { Blocks } from '../extensions/blocks/index.js';
import { Callout } from '../extensions/callout/index.js';
import { Card } from '../extensions/card/index.js';
import { CharacterCount } from '../extensions/character-count/index.js';
import { Collapsible } from '../extensions/collapsible/index.js';
import { Columns } from '../extensions/columns/index.js';
import { DateTime } from '../extensions/date-time/index.js';
import { Embed } from '../extensions/embed/index.js';
import { Emoji } from '../extensions/emoji/index.js';
import { FileAttachment } from '../extensions/file/index.js';
import { FindReplace } from '../extensions/find-replace/index.js';
import { Hashtag } from '../extensions/hashtag/index.js';
import { Image } from '../extensions/image/index.js';
import { Mention } from '../extensions/mention/index.js';
import { PageBreak } from '../extensions/page-break/index.js';
import { Poll } from '../extensions/poll/index.js';
import { PullQuote } from '../extensions/pull-quote/index.js';
import { Ruby } from '../extensions/ruby/index.js';
import { StarterKit } from '../extensions/starter-kit/index.js';
import { StickyNote } from '../extensions/sticky-note/index.js';
import { Table } from '../extensions/table/index.js';
import { TableOfContents } from '../extensions/table-of-contents/index.js';
import { TextStyle } from '../extensions/text-style/index.js';

/**
 * Every block and inline feature, no toolbar: select text for the bubble
 * menu, type `/` or press + for blocks, drag a block by its handle, `@` for
 * people, `:` for emoji. Tables need the optional peer `@lexical/table`.
 */
export const notion = {
  name: 'notion',
  extensions: [
    StarterKit,
    TextStyle,
    Blocks,
    PullQuote,
    Callout,
    Collapsible,
    Columns,
    Card,
    StickyNote,
    Poll,
    DateTime,
    FindReplace,
    TableOfContents,
    CharacterCount,
    Ruby,
    Emoji,
    Mention,
    Hashtag,
    PageBreak,
    Table,
    Image,
    FileAttachment,
    Embed,
  ],
  ui: { toolbar: false, wordCount: false },
} as const satisfies TeiPreset;
