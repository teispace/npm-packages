import type { EditorThemeClasses } from 'lexical';

/**
 * Default TeiEditor theme using Tailwind CSS classes.
 *
 * Uses `tei-` prefixed classes so they don't collide with the consumer's
 * styles. The consumer can override any class by passing a custom theme
 * to `createTeiEditor({ theme: { ... } })`.
 */
export const defaultTheme: EditorThemeClasses = {
  // Root
  root: 'tei-root outline-none min-h-[150px] p-4 text-base leading-relaxed',
  // Paragraphs
  paragraph: 'tei-paragraph mb-2 leading-relaxed',
  // Headings
  heading: {
    h1: 'tei-h1 text-3xl font-bold mt-6 mb-4 leading-tight',
    h2: 'tei-h2 text-2xl font-bold mt-5 mb-3 leading-tight',
    h3: 'tei-h3 text-xl font-semibold mt-4 mb-2 leading-snug',
    h4: 'tei-h4 text-lg font-semibold mt-3 mb-2 leading-snug',
    h5: 'tei-h5 text-base font-semibold mt-2 mb-1',
    h6: 'tei-h6 text-sm font-semibold mt-2 mb-1 uppercase tracking-wide',
  },
  // Text formats
  text: {
    bold: 'tei-bold font-bold',
    italic: 'tei-italic italic',
    underline: 'tei-underline underline',
    strikethrough: 'tei-strikethrough line-through',
    underlineStrikethrough: 'tei-underline-strikethrough underline line-through',
    code: 'tei-inline-code rounded bg-muted px-1.5 py-0.5 font-mono text-sm',
    highlight: 'tei-highlight bg-yellow-200 dark:bg-yellow-800',
    subscript: 'tei-subscript',
    superscript: 'tei-superscript',
  },
  // Block-level
  quote:
    'tei-blockquote border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground my-4',
  // Lists
  list: {
    ul: 'tei-ul list-disc ml-6 mb-2',
    ol: 'tei-ol list-decimal ml-6 mb-2',
    listitem: 'tei-li mb-1',
    nested: {
      listitem: 'tei-nested-li list-none',
    },
    listitemChecked: 'tei-li-checked line-through opacity-60',
    listitemUnchecked: 'tei-li-unchecked',
    olDepth: [
      'tei-ol-1 list-decimal',
      'tei-ol-2 list-[lower-alpha]',
      'tei-ol-3 list-[lower-roman]',
      'tei-ol-4 list-decimal',
      'tei-ol-5 list-[lower-alpha]',
    ],
  },
  // Links
  link: 'tei-link text-primary underline cursor-pointer hover:text-primary/80',
  // Code
  code: 'tei-code-block block rounded-lg bg-muted p-4 font-mono text-sm my-4 overflow-x-auto',
  codeHighlight: {
    atrule: 'tei-token-atrule text-purple-600 dark:text-purple-400',
    attr: 'tei-token-attr text-yellow-600 dark:text-yellow-400',
    boolean: 'tei-token-boolean text-red-600 dark:text-red-400',
    builtin: 'tei-token-builtin text-cyan-600 dark:text-cyan-400',
    cdata: 'tei-token-cdata text-gray-500 dark:text-gray-400',
    char: 'tei-token-char text-green-600 dark:text-green-400',
    class: 'tei-token-class text-yellow-600 dark:text-yellow-400',
    'class-name': 'tei-token-class-name text-yellow-600 dark:text-yellow-400',
    comment: 'tei-token-comment text-gray-500 dark:text-gray-400 italic',
    constant: 'tei-token-constant text-red-600 dark:text-red-400',
    deleted: 'tei-token-deleted text-red-600 dark:text-red-400',
    doctype: 'tei-token-doctype text-gray-500 dark:text-gray-400',
    entity: 'tei-token-entity text-red-600 dark:text-red-400',
    function: 'tei-token-function text-blue-600 dark:text-blue-400',
    important: 'tei-token-important text-red-600 dark:text-red-400 font-bold',
    inserted: 'tei-token-inserted text-green-600 dark:text-green-400',
    keyword: 'tei-token-keyword text-purple-600 dark:text-purple-400',
    namespace: 'tei-token-namespace text-gray-600 dark:text-gray-400',
    number: 'tei-token-number text-orange-600 dark:text-orange-400',
    operator: 'tei-token-operator text-gray-600 dark:text-gray-400',
    prolog: 'tei-token-prolog text-gray-500 dark:text-gray-400',
    property: 'tei-token-property text-red-600 dark:text-red-400',
    punctuation: 'tei-token-punctuation text-gray-600 dark:text-gray-400',
    regex: 'tei-token-regex text-orange-600 dark:text-orange-400',
    selector: 'tei-token-selector text-green-600 dark:text-green-400',
    string: 'tei-token-string text-green-600 dark:text-green-400',
    symbol: 'tei-token-symbol text-red-600 dark:text-red-400',
    tag: 'tei-token-tag text-red-600 dark:text-red-400',
    url: 'tei-token-url text-blue-600 dark:text-blue-400',
    variable: 'tei-token-variable text-orange-600 dark:text-orange-400',
  },
};
