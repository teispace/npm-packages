import {
  $createCodeNode,
  $isCodeNode,
  CodeExtension,
  CodeIndentExtension,
  type CodeNode,
} from '@lexical/code-core';
import {
  CodePrismExtension,
  getCodeLanguageOptions,
  normalizeCodeLanguage,
  PrismTokenizer,
} from '@lexical/code-prism';
import { CODE } from '@lexical/markdown';
import { $setBlocksType } from '@lexical/selection';
import { $findMatchingParent } from '@lexical/utils';
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  configExtension,
  type LexicalNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { codeBlock } from '../../icons/index.js';
import { $everyBlock } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setCodeBlock: [language?: string];
    toggleCodeBlock: [language?: string];
    /** Change the language of the code block at the selection. */
    setCodeLanguage: [language: string];
  }
  interface TeiActiveStates {
    codeBlock: [language?: string];
  }
}

export interface CodeBlockOptions {
  /** Language for new blocks; `null` for plain text. Default `null`. */
  defaultLanguage: string | null;
  /** Languages the language picker offers, as [id, label]. */
  languages: ReadonlyArray<readonly [string, string]>;
}

/** The code block holding the selection's anchor. */
export function $getCodeBlockAtSelection(): CodeNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const found = $findMatchingParent(selection.anchor.getNode(), (n: LexicalNode) => $isCodeNode(n));
  return $isCodeNode(found) ? found : null;
}

const $inCode = (language?: string) =>
  $everyBlock((b) => $isCodeNode(b) && (!language || b.getLanguage() === language));

/** Turn the selected blocks into one code block, keeping their text line by line. */
function $toCode(language: string | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  if (selection.isCollapsed()) {
    $setBlocksType(selection, () => $createCodeNode(language));
    return true;
  }
  const text = selection.getTextContent();
  const code = $createCodeNode(language);
  selection.insertNodes([code]);
  const inside = $getSelection();
  if ($isRangeSelection(inside)) inside.insertRawText(text);
  return true;
}

/** Turn the code block at the selection back into paragraphs, one per line. */
function $fromCode(): boolean {
  const code = $getCodeBlockAtSelection();
  if (!code) return false;
  const lines = code.getTextContent().split('\n');
  let last: LexicalNode = code;
  for (const line of lines) {
    const paragraph = $createParagraphNode();
    if (line) paragraph.append($createTextNode(line));
    last.insertAfter(paragraph);
    last = paragraph;
  }
  const first = code.getNextSibling();
  code.remove();
  first?.selectStart();
  return true;
}

/**
 * Code blocks: Tab indents inside them, Enter three times leaves, markdown
 * fences (```js), ⌘⌥C. Add `CodeHighlight` for syntax colours.
 */
export const CodeBlock = defineTeiExtension({
  name: '@teispace/teieditor/code-block',
  config: { defaultLanguage: null, languages: [] } as CodeBlockOptions,
  dependencies: [RichText, CodeExtension, CodeIndentExtension],
  commands: {
    setCodeBlock: {
      run: ({ options }, language?: string) => $toCode(language ?? options.defaultLanguage),
      can: () => $isRangeSelection($getSelection()),
    },
    toggleCodeBlock: {
      run: ({ options }, language?: string) =>
        $inCode() ? $fromCode() : $toCode(language ?? options.defaultLanguage),
      can: () => $isRangeSelection($getSelection()),
    },
    setCodeLanguage: {
      run: (_ctx, language: string) => {
        const code = $getCodeBlockAtSelection();
        if (!code) return false;
        code.setLanguage(language);
      },
      can: () => $getCodeBlockAtSelection() !== null,
    },
  },
  active: { codeBlock: (_ctx, language?: string) => $inCode(language) },
  keymap: {
    codeBlock: { key: 'Mod-Alt-c', command: 'toggleCodeBlock', description: 'Code block' },
  },
  markdown: { codeBlock: CODE },
  icons: { codeBlock },
  messages: {
    'block.codeBlock': 'Code',
    'block.codeBlock.description': 'Capture a code snippet',
    'code.language': 'Language',
    'code.copy': 'Copy code',
    'code.copied': 'Copied',
    'code.plain': 'Plain text',
  },
  items: [
    {
      id: 'codeBlock',
      label: 'block.codeBlock',
      description: 'block.codeBlock.description',
      icon: 'codeBlock',
      in: ['toolbar', 'blockType', 'slash', 'blockMenu'],
      group: 'basic',
      order: 30,
      keywords: ['code', 'pre', 'snippet', 'program', '```'],
      shortcut: 'codeBlock',
      command: 'toggleCodeBlock',
      active: 'codeBlock',
    },
  ],
});

/**
 * Syntax colours for code blocks, with Prism. Separate from `CodeBlock` so
 * an app that wants plain blocks (or Shiki) does not ship Prism.
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
export const prismLanguages = (): ReadonlyArray<readonly [string, string]> =>
  getCodeLanguageOptions();

export { normalizeCodeLanguage };
