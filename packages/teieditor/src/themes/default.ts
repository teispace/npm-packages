import type { EditorThemeClasses } from 'lexical';

/**
 * Default TeiEditor theme using CSS custom properties.
 *
 * All colors reference `--tei-*` variables defined in `variables.css`.
 * Override the CSS variables in your global styles to theme the editor —
 * no need to modify this object unless you want structural changes.
 *
 * Class naming: `tei-*` prefix prevents collisions with your app's styles.
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
    code: 'tei-inline-code rounded bg-[hsl(var(--tei-muted))] px-1.5 py-0.5 font-mono text-sm',
    highlight: 'tei-highlight bg-[hsl(var(--tei-highlight))]',
    subscript: 'tei-subscript',
    superscript: 'tei-superscript',
    uppercase: 'tei-uppercase uppercase',
    lowercase: 'tei-lowercase lowercase',
    capitalize: 'tei-capitalize capitalize',
  },

  // Block-level
  quote:
    'tei-blockquote border-l-4 border-[hsl(var(--tei-border))] pl-4 italic text-[hsl(var(--tei-muted-fg))] my-4',

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
  link: 'tei-link text-[hsl(var(--tei-primary))] underline cursor-pointer hover:opacity-80',

  // Code blocks
  code: 'tei-code-block block rounded-lg bg-[hsl(var(--tei-muted))] p-4 font-mono text-sm my-4 overflow-x-auto',
  codeHighlight: {
    atrule: 'tei-token-atrule text-[hsl(var(--tei-token-atrule))]',
    attr: 'tei-token-attr text-[hsl(var(--tei-token-attr))]',
    boolean: 'tei-token-boolean text-[hsl(var(--tei-token-boolean))]',
    builtin: 'tei-token-builtin text-[hsl(var(--tei-token-builtin))]',
    cdata: 'tei-token-cdata text-[hsl(var(--tei-token-comment))]',
    char: 'tei-token-char text-[hsl(var(--tei-token-char))]',
    class: 'tei-token-class text-[hsl(var(--tei-token-class-name))]',
    'class-name': 'tei-token-class-name text-[hsl(var(--tei-token-class-name))]',
    comment: 'tei-token-comment text-[hsl(var(--tei-token-comment))] italic',
    constant: 'tei-token-constant text-[hsl(var(--tei-token-constant))]',
    deleted: 'tei-token-deleted text-[hsl(var(--tei-token-deleted))]',
    doctype: 'tei-token-doctype text-[hsl(var(--tei-token-comment))]',
    entity: 'tei-token-entity text-[hsl(var(--tei-token-tag))]',
    function: 'tei-token-function text-[hsl(var(--tei-token-function))]',
    important: 'tei-token-important text-[hsl(var(--tei-token-important))] font-bold',
    inserted: 'tei-token-inserted text-[hsl(var(--tei-token-inserted))]',
    keyword: 'tei-token-keyword text-[hsl(var(--tei-token-keyword))]',
    namespace: 'tei-token-namespace text-[hsl(var(--tei-token-punctuation))]',
    number: 'tei-token-number text-[hsl(var(--tei-token-number))]',
    operator: 'tei-token-operator text-[hsl(var(--tei-token-operator))]',
    prolog: 'tei-token-prolog text-[hsl(var(--tei-token-comment))]',
    property: 'tei-token-property text-[hsl(var(--tei-token-property))]',
    punctuation: 'tei-token-punctuation text-[hsl(var(--tei-token-punctuation))]',
    regex: 'tei-token-regex text-[hsl(var(--tei-token-regex))]',
    selector: 'tei-token-selector text-[hsl(var(--tei-token-selector))]',
    string: 'tei-token-string text-[hsl(var(--tei-token-string))]',
    symbol: 'tei-token-symbol text-[hsl(var(--tei-token-constant))]',
    tag: 'tei-token-tag text-[hsl(var(--tei-token-tag))]',
    url: 'tei-token-url text-[hsl(var(--tei-token-url))]',
    variable: 'tei-token-variable text-[hsl(var(--tei-token-variable))]',
  },

  // Table
  table: 'tei-table border-collapse w-full my-4',
  tableCell:
    'tei-table-cell border border-[hsl(var(--tei-border))] px-3 py-2 min-w-[75px] relative',
  tableCellHeader:
    'tei-table-cell-header border border-[hsl(var(--tei-border))] px-3 py-2 bg-[hsl(var(--tei-muted))] font-semibold',
  tableSelection: 'tei-table-selection bg-[hsl(var(--tei-selection))]',
  tableScrollableWrapper: 'tei-table-scroll-wrapper overflow-x-auto relative',
  tableCellActionButton:
    'tei-table-cell-action-btn absolute top-0 right-0 p-1 cursor-pointer opacity-0 hover:opacity-100',
  tableCellActionButtonContainer: 'tei-table-cell-action-container absolute top-0 right-0 z-10',
  tableCellPrimarySelected:
    'tei-table-cell-primary-selected outline-2 outline-[hsl(var(--tei-primary))] outline-offset-[-2px]',
  tableCellSortedIndicator:
    'tei-table-cell-sorted-indicator absolute bottom-0 left-0 w-full h-0.5 bg-[hsl(var(--tei-primary))]',
  tableResizeRuler:
    'tei-table-resize-ruler absolute top-0 bottom-0 w-0.5 bg-[hsl(var(--tei-primary))] cursor-col-resize z-10',
  tableSelected: 'tei-table-selected outline-2 outline-[hsl(var(--tei-primary))]',

  // Horizontal rule
  horizontalRule: 'tei-hr border-t border-[hsl(var(--tei-border))] my-6 cursor-pointer',

  // Embed
  embedBlock: {
    base: 'tei-embed-block select-none my-4',
    focus: 'tei-embed-block-focus outline-2 outline-[hsl(var(--tei-primary))] outline-offset-2',
  },

  // Collapsible / Toggle
  collapsibleContainer:
    'tei-collapsible-container border border-[hsl(var(--tei-border))] rounded-lg my-3',
  collapsibleTitle:
    'tei-collapsible-title cursor-pointer select-none font-medium px-4 py-2 flex items-center gap-2 bg-[hsl(var(--tei-muted)/.3)] rounded-t-lg',
  collapsibleContent: 'tei-collapsible-content px-4 py-3',

  // Layout
  layoutContainer: 'tei-layout-container grid gap-3 my-4',
  layoutItem:
    'tei-layout-item border border-dashed border-[hsl(var(--tei-border))] rounded-lg p-3 min-h-[100px]',

  // Mark (for comments)
  mark: 'tei-mark bg-[hsl(var(--tei-highlight)/.4)] border-b-2 border-[hsl(var(--tei-primary)/.5)]',
  markOverlap: 'tei-mark-overlap bg-[hsl(var(--tei-highlight)/.6)]',

  // Block cursor
  blockCursor:
    'tei-block-cursor block pointer-events-none absolute w-full border-t-2 border-[hsl(var(--tei-primary))]',

  // Character limit
  characterLimit: 'tei-character-limit text-red-500',

  // Hashtag
  hashtag: 'tei-hashtag text-[hsl(var(--tei-primary))]',

  // Autocomplete
  autocomplete: 'tei-autocomplete text-[hsl(var(--tei-muted-fg))] inline-block',

  // Image
  image: 'tei-image cursor-default inline-block relative select-none',

  // Indent (Lexical applies indent level as data attribute; use CSS to handle each level)
  indent: 'tei-indent',

  // Mention
  mention: 'tei-mention bg-[hsl(var(--tei-accent))] rounded px-1 py-0.5 text-sm font-medium',

  // Sticky note
  stickyNote: 'tei-sticky-note absolute shadow-lg rounded-lg min-w-[200px] min-h-[100px]',

  // Page break
  pageBreak:
    'tei-page-break my-6 border-t-2 border-dashed border-[hsl(var(--tei-border))] relative text-center',
};
