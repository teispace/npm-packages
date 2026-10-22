import {
  $createCodeNode,
  $isCodeNode,
  CodeExtension,
  CodeIndentExtension,
  type CodeNode,
} from '@lexical/code-core';
import { CODE } from '@lexical/markdown';
import { $setBlocksType } from '@lexical/selection';
import { $findMatchingParent } from '@lexical/utils';
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { check, codeBlock, copy } from '../../icons/index.js';
import { CODE_LANGUAGES, type CodeLanguage } from '../../utils/code-language.js';
import { $everyBlock } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setCodeBlock: [language?: string];
    toggleCodeBlock: [language?: string];
    /**
     * Change the language of the code block at the selection, or of the
     * one with `key`; `null` for plain text.
     */
    setCodeLanguage: [language: string | null, key?: NodeKey];
  }
  interface TeiActiveStates {
    codeBlock: [language?: string];
  }
}

export interface CodeBlockOptions {
  /** Language for new blocks; `null` for plain text. Default `null`. */
  defaultLanguage: string | null;
  /** Languages the language picker offers, as [id, label]. Default: what Prism colours. */
  languages: readonly CodeLanguage[];
  /** Show a copy button on code blocks. Default true. */
  copyButton: boolean;
}

/** The code block with this key, if it still is one. */
export function $getCodeBlock(key: NodeKey): CodeNode | null {
  const node = $getNodeByKey(key);
  return $isCodeNode(node) ? node : null;
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
  config: {
    defaultLanguage: null,
    languages: CODE_LANGUAGES,
    copyButton: true,
  } as CodeBlockOptions,
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
      run: (_ctx, language: string | null, key?: NodeKey) => {
        const code = key ? $getCodeBlock(key) : $getCodeBlockAtSelection();
        if (!code) return false;
        code.setLanguage(language);
      },
      can: (_ctx, _language: string | null, key?: NodeKey) =>
        (key ? $getCodeBlock(key) : $getCodeBlockAtSelection()) !== null,
    },
  },
  active: { codeBlock: (_ctx, language?: string) => $inCode(language) },
  keymap: {
    codeBlock: { key: 'Mod-Alt-c', command: 'toggleCodeBlock', description: 'Code block' },
  },
  markdown: { codeBlock: CODE },
  icons: { codeBlock, copy, check },
  messages: {
    'block.codeBlock': 'Code',
    'block.codeBlock.description': 'Capture a code snippet',
    'code.language': 'Language',
    'code.copy': 'Copy code',
    'code.copied': 'Copied',
    'code.toolbar': 'Code block',
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

export {
  CODE_LANGUAGES,
  type CodeLanguage,
  codeLanguageLabel,
  normalizeLanguage,
} from '../../utils/code-language.js';
