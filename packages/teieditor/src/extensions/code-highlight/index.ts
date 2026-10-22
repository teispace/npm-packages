import {
  CodePrismExtension,
  getCodeLanguageOptions,
  normalizeCodeLanguage,
  PrismTokenizer,
} from '@lexical/code-prism';
import { configExtension } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { CodeLanguage } from '../../utils/code-language.js';
import { CodeBlock } from '../code-block/index.js';

/**
 * Syntax colours for code blocks, with Prism. Its own entry, apart from
 * `CodeBlock`: Prism registers itself on import, so an app that wants plain
 * blocks (or Shiki) only ships it by importing this.
 */
export const CodeHighlight = defineTeiExtension({
  name: '@teispace/teieditor/code-highlight',
  dependencies: [
    CodeBlock,
    // Prism's own fallback is JavaScript, which would stamp a language on
    // every block without one (and on its Markdown fence). A block keeps
    // the language it was given; `CodeBlock`'s `defaultLanguage` picks one
    // for new blocks.
    configExtension(CodePrismExtension, {
      tokenizer: { ...PrismTokenizer, defaultLanguage: null },
    }),
  ],
});

/** Every language Prism knows, as [id, label] for a picker. */
export const prismLanguages = (): readonly CodeLanguage[] => getCodeLanguageOptions();

export { normalizeCodeLanguage };
