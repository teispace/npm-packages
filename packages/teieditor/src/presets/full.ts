import type { TeiPreset } from '../core/preset.js';
import { Comments } from '../extensions/comments/index.js';
import { DocumentActions } from '../extensions/document-actions/index.js';
import { MarkdownSource } from '../extensions/markdown-source/index.js';
import { Pages } from '../extensions/pages/index.js';
import { ShowInvisibles } from '../extensions/show-invisibles/index.js';
import { SpeechToText } from '../extensions/speech-to-text/index.js';
import { TabFocus } from '../extensions/tab-focus/index.js';
import { notion } from './notion.js';

/**
 * Everything: `notion`'s features with a toolbar and a word count, plus the
 * document's own tools (import and export, markdown source, pages, visible
 * whitespace, Tab to leave), comments and dictation. Tables need the
 * optional peer `@lexical/table`, comments `@lexical/mark`. Equations,
 * drawings, Shiki and collaboration need packages of their own: add them.
 */
export const full = {
  name: 'full',
  extensions: [
    ...notion.extensions,
    DocumentActions,
    MarkdownSource,
    ShowInvisibles,
    Pages,
    TabFocus,
    Comments,
    SpeechToText,
  ],
  ui: {},
} as const satisfies TeiPreset;
