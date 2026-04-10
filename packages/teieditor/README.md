<div align="center">

# @teispace/teieditor

A feature-rich, lightweight, fully customizable rich text editor built on [Lexical](https://lexical.dev).

**shadcn-style** — UI components live in your project. You own the code. Fully customizable. No vendor lock-in.

[![npm version](https://img.shields.io/npm/v/@teispace/teieditor.svg)](https://www.npmjs.com/package/@teispace/teieditor)
[![license](https://img.shields.io/npm/l/@teispace/teieditor.svg)](https://github.com/teispace/npm-packages/blob/main/packages/teieditor/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

</div>

---

## Why TeiEditor?

|                   | TeiEditor                   | Tiptap            | Plate.js        | LexKit     |
| ----------------- | --------------------------- | ----------------- | --------------- | ---------- |
| **Foundation**    | Lexical (Meta)              | ProseMirror       | Slate           | Lexical    |
| **Extensions**    | 37 built-in                 | 100+ (many paid)  | 40+             | 25+        |
| **Cost**          | Free & open source          | Paid pro features | Free            | Free       |
| **Customization** | shadcn-style (own the code) | Props/CSS only    | shadcn registry | Headless   |
| **Format I/O**    | HTML, Markdown, JSON, Text  | HTML, JSON        | HTML, JSON      | HTML, JSON |
| **Bundle**        | ~138KB (tree-shakable)      | ~60KB             | ~80KB           | ~40KB      |

---

## Features

**Text** — Bold, Italic, Underline, Strikethrough, Code, Highlight, Sub/Superscript, Font Size, Font Family, Text/Background Color

**Blocks** — Headings (H1-H6), Paragraphs, Blockquotes, Code Blocks (syntax highlighted), Callouts (5 variants), Toggle/Collapsible, Horizontal Rules

**Lists** — Ordered, Unordered, Checklists (with nesting)

**Media** — Images (upload, paste, drag & drop), Tables (insert/resize/delete rows & columns), Embeds (YouTube, Twitter, URLs), File Attachments

**Notion-like UX** — Slash commands (`/`), Floating bubble menu, Drag-handle block reordering, Per-block placeholders, Turn-into block conversion

**Advanced** — @Mentions (async search), Emoji picker (`:` trigger), Live Markdown shortcuts, Find & Replace, Word Count, Table of Contents, Math/KaTeX blocks

**I/O** — Import & export HTML, Markdown, JSON, and plain text. Mix input/output formats freely.

**DX** — TypeScript strict mode, 45 subpath exports, tree-shakable, `sideEffects: false`, dark mode built-in

---

## Table of Contents

- [Quick Start](#quick-start)
- [CLI](#cli)
- [Content Formats](#content-formats)
- [Advanced Setup](#advanced-setup)
- [Extensions](#extensions)
  - [StarterKit](#starterkit)
  - [Individual Extensions](#individual-extensions)
  - [Configuring Extensions](#configuring-extensions)
  - [Complete Extension Reference](#complete-extension-reference)
- [Creating Custom Extensions](#creating-custom-extensions)
- [Adding Custom Slash Commands](#adding-custom-slash-commands)
- [Theming](#theming)
- [Table of Contents Sidebar](#table-of-contents-sidebar)
- [Subpath Exports](#subpath-exports)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Props Reference](#props-reference)
- [Peer Dependencies](#peer-dependencies)
- [Architecture](#architecture)
- [Contributing](#contributing)

---

## Quick Start

### 1. Install

```bash
npm install @teispace/teieditor lexical @lexical/react @lexical/rich-text \
  @lexical/selection @lexical/utils @lexical/history @lexical/html \
  @lexical/list @lexical/link @lexical/code @lexical/table @lexical/markdown
```

### 2. Scaffold UI

```bash
npx teieditor init
```

This copies customizable `.tsx` files into `src/components/teieditor/`. You own them — edit freely.

### 3. Use

```tsx
import { TeiEditor } from '@/components/teieditor/editor';

<TeiEditor onChange={(html) => console.log(html)} />;
```

Done. Full Notion-like editor with 37 extensions.

---

## CLI

```bash
npx teieditor init                      # Scaffold all UI components
npx teieditor add <component>           # Add a specific component
npx teieditor list                      # List available components

# Options
npx teieditor init --path src/editor    # Custom output directory
npx teieditor add toolbar --path lib/ui # Custom path for single component
```

### Available Components

| Component | Description                                                                                   |
| --------- | --------------------------------------------------------------------------------------------- |
| `toolbar` | Full-featured toolbar: formatting, blocks, lists, fonts, colors, alignment                    |
| `editor`  | Zero-config `<TeiEditor>` with toolbar, bubble menu, slash commands, and all plugins wired up |

---

## Content Formats

Import and export in 4 formats. Mix them freely.

### Import + Export via Props

```tsx
// Default: HTML in, HTML out
<TeiEditor onChange={setContent} />

// Markdown workflow
<TeiEditor
  initialValue="# Hello\n\n**Bold** text with [links](https://example.com)"
  initialFormat="markdown"
  onChange={setMarkdown}
  format="markdown"
/>

// Load HTML, export as Markdown
<TeiEditor
  initialValue="<h1>Hello</h1><p>World</p>"
  initialFormat="html"
  onChange={setMarkdown}
  format="markdown"
/>

// JSON round-trip (best for database persistence — lossless)
<TeiEditor
  initialValue={savedJson}
  initialFormat="json"
  onChange={setSavedJson}
  format="json"
/>

// Plain text output (strips all formatting)
<TeiEditor onChange={setText} format="text" />
```

### Programmatic Serialization

```tsx
import { serialize, deserialize } from '@teispace/teieditor/utils';

// Export
const html = serialize(editor, 'html');
const markdown = serialize(editor, 'markdown');
const json = serialize(editor, 'json');
const text = serialize(editor, 'text');

// Import
deserialize(editor, markdownString, 'markdown');
deserialize(editor, htmlString, 'html');
deserialize(editor, jsonString, 'json');
```

### Format Comparison

| Format       | Lossless                              | Human-readable | Best for                             |
| ------------ | ------------------------------------- | -------------- | ------------------------------------ |
| **JSON**     | Yes — preserves all Lexical state     | No             | Database storage, exact round-trips  |
| **HTML**     | Mostly — loses some Lexical metadata  | Yes            | Rendering, emails, CMS output        |
| **Markdown** | Partial — complex blocks may simplify | Yes            | Documentation, git-friendly content  |
| **Text**     | No — strips all formatting            | Yes            | Search indexing, previews, summaries |

---

## Advanced Setup

For full control over extensions and layout, use the core API directly:

```tsx
import { createTeiEditor, TeiEditorProvider } from '@teispace/teieditor/core';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { Image } from '@teispace/teieditor/extensions/image';
import {
  EditorContent,
  OnChangePlugin,
  KeyboardShortcutsPlugin,
  BubbleMenuPlugin,
  InitialValuePlugin,
} from '@teispace/teieditor/plugins';

const editor = createTeiEditor({
  extensions: [
    ...StarterKit,
    Image.configure({
      onUpload: async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const { url } = await res.json();
        return url;
      },
      maxSize: 5 * 1024 * 1024,
    }),
  ],
});

export function MyEditor() {
  return (
    <TeiEditorProvider editor={editor}>
      <MyCustomToolbar />
      <EditorContent placeholder="Write something..." />
      <InitialValuePlugin value={savedContent} format="html" />
      <OnChangePlugin onChange={handleSave} format="json" />
      <KeyboardShortcutsPlugin />
      <BubbleMenuPlugin />
    </TeiEditorProvider>
  );
}
```

---

## Extensions

### StarterKit

The default bundle includes all 37 extensions. Use it as-is or cherry-pick.

```tsx
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';

const editor = createTeiEditor({ extensions: StarterKit });
```

### Individual Extensions

Import only what you need for a minimal bundle:

```tsx
import { Bold } from '@teispace/teieditor/extensions/bold';
import { Italic } from '@teispace/teieditor/extensions/italic';
import { Heading } from '@teispace/teieditor/extensions/heading';
import { History } from '@teispace/teieditor/extensions/history';
import { Paragraph } from '@teispace/teieditor/extensions/paragraph';

const editor = createTeiEditor({
  extensions: [Paragraph, Heading, Bold, Italic, History],
});
```

### Configuring Extensions

Every extension accepts `.configure()` returning a new immutable instance:

```tsx
import { Heading } from '@teispace/teieditor/extensions/heading';
import { Image } from '@teispace/teieditor/extensions/image';
import { List } from '@teispace/teieditor/extensions/list';
import { Mention } from '@teispace/teieditor/extensions/mention';

const editor = createTeiEditor({
  extensions: [
    Heading.configure({ levels: ['h1', 'h2', 'h3'] }),
    Image.configure({
      onUpload: myUploadFn,
      maxSize: 10 * 1024 * 1024,
      accept: ['image/png', 'image/jpeg', 'image/webp'],
    }),
    List.configure({ checklist: true, maxDepth: 5 }),
    Mention.configure({
      trigger: '@',
      onSearch: async (query) => {
        const res = await fetch(`/api/users?q=${query}`);
        return res.json();
      },
    }),
  ],
});
```

### Complete Extension Reference

#### Text Formatting

| Extension         | Import                     | Config         | Shortcut       |
| ----------------- | -------------------------- | -------------- | -------------- |
| **Bold**          | `extensions/bold`          | `{ shortcut }` | `Ctrl+B`       |
| **Italic**        | `extensions/italic`        | `{ shortcut }` | `Ctrl+I`       |
| **Underline**     | `extensions/underline`     | `{ shortcut }` | `Ctrl+U`       |
| **Strikethrough** | `extensions/strikethrough` | `{ shortcut }` | `Ctrl+Shift+S` |
| **InlineCode**    | `extensions/code`          | `{ shortcut }` | `Ctrl+E`       |
| **Highlight**     | `extensions/highlight`     | `{ shortcut }` | `Ctrl+Shift+H` |
| **Subscript**     | `extensions/subscript`     | —              | —              |
| **Superscript**   | `extensions/superscript`   | —              | —              |

#### Block-Level

| Extension          | Import                       | Config                                              |
| ------------------ | ---------------------------- | --------------------------------------------------- |
| **Paragraph**      | `extensions/paragraph`       | —                                                   |
| **Heading**        | `extensions/heading`         | `{ levels: HeadingTagType[] }`                      |
| **Blockquote**     | `extensions/blockquote`      | —                                                   |
| **HorizontalRule** | `extensions/horizontal-rule` | —                                                   |
| **CodeBlock**      | `extensions/code-block`      | `{ defaultLanguage }`                               |
| **Callout**        | `extensions/callout`         | — (5 variants: info, warning, error, success, note) |
| **Toggle**         | `extensions/toggle`          | — (collapsible blocks)                              |

#### Lists

| Extension | Import            | Config                                     |
| --------- | ----------------- | ------------------------------------------ |
| **List**  | `extensions/list` | `{ checklist: boolean, maxDepth: number }` |

Shortcuts: `Ctrl+Shift+7` (ordered), `Ctrl+Shift+8` (bullet), `Ctrl+Shift+9` (checklist)

#### Links

| Extension | Import            | Config                                                 |
| --------- | ----------------- | ------------------------------------------------------ |
| **Link**  | `extensions/link` | `{ autoLink: boolean, validateUrl: (url) => boolean }` |

Shortcut: `Ctrl+K`. Auto-detects URLs and emails.

#### Media & Embeds

| Extension | Import             | Config                            |
| --------- | ------------------ | --------------------------------- |
| **Image** | `extensions/image` | `{ onUpload, maxSize, accept }`   |
| **Table** | `extensions/table` | `{ defaultRows, defaultColumns }` |
| **Embed** | `extensions/embed` | `{ customDetectors }`             |
| **File**  | `extensions/file`  | `{ onUpload, maxSize }`           |

Image supports upload via file picker, paste from clipboard, and drag & drop. YouTube embeds render as iframes. File attachments display icon by MIME type with download link.

#### Alignment & Fonts

| Extension      | Import                   | Config                   |
| -------------- | ------------------------ | ------------------------ |
| **Alignment**  | `extensions/alignment`   | `{ alignments }`         |
| **FontSize**   | `extensions/font-size`   | `{ sizes, defaultSize }` |
| **FontFamily** | `extensions/font-family` | `{ families }`           |
| **Color**      | `extensions/color`       | `{ colors }`             |

Alignment shortcuts: `Ctrl+Shift+L/E/R/J`. Indent: `Tab` / `Shift+Tab`.

#### Notion-Like UX

| Extension        | Import                     | Config                                     |
| ---------------- | -------------------------- | ------------------------------------------ |
| **SlashCommand** | `extensions/slash-command` | `{ commands: SlashCommandItem[] }`         |
| **DragHandle**   | `extensions/drag-handle`   | `{ handleClass }`                          |
| **Placeholder**  | `extensions/placeholder`   | `{ placeholders: Record<string, string> }` |
| **TurnInto**     | `extensions/turn-into`     | `{ items }`                                |

Type `/` to open the command palette with 17 built-in commands.

#### Advanced

| Extension       | Import                    | Config                   |
| --------------- | ------------------------- | ------------------------ |
| **Mention**     | `extensions/mention`      | `{ trigger, onSearch }`  |
| **Emoji**       | `extensions/emoji`        | `{ extraEmojis }`        |
| **Markdown**    | `extensions/markdown`     | `{ shortcuts: boolean }` |
| **FindReplace** | `extensions/find-replace` | `{ shortcut }`           |
| **WordCount**   | `extensions/word-count`   | `{ showCharacters }`     |
| **Toc**         | `extensions/toc`          | `{ minLevel, maxLevel }` |
| **Math**        | `extensions/math`         | —                        |
| **History**     | `extensions/history`      | `{ delay }`              |

Mention: `@` trigger with async search. Emoji: `:` trigger with fuzzy search. Markdown: live shortcuts (`#` heading, `**bold**`, etc.). Find & Replace: `Ctrl+F`.

---

## Creating Custom Extensions

```tsx
import { BaseExtension } from '@teispace/teieditor/core';
import type { Klass, LexicalNode, LexicalEditor } from 'lexical';

interface MyConfig {
  enabled: boolean;
}

class MyExtension extends BaseExtension<MyConfig> {
  readonly name = 'my-extension';
  protected readonly defaults: MyConfig = { enabled: true };

  // Register custom Lexical nodes
  getNodes(): Array<Klass<LexicalNode>> {
    return [MyCustomNode];
  }

  // Mount React plugins inside the editor
  getPlugins() {
    return [MyPlugin];
  }

  // Register keyboard shortcuts
  getKeyBindings(): Record<string, (editor: LexicalEditor) => boolean> {
    return {
      'Mod+Shift+M': (editor) => {
        // Your command here
        return true;
      },
    };
  }

  // Lifecycle: called when editor mounts this extension
  onRegister(editor: LexicalEditor) {
    // Register commands, listeners, etc.
    return () => {
      /* cleanup */
    };
  }
}

export const MyExt = new MyExtension();

// Usage
const editor = createTeiEditor({
  extensions: [...StarterKit, MyExt.configure({ enabled: true })],
});
```

---

## Adding Custom Slash Commands

```tsx
import {
  SlashCommand,
  defaultSlashCommands,
  type SlashCommandItem,
} from '@teispace/teieditor/extensions/slash-command';

const myCommands: SlashCommandItem[] = [
  ...defaultSlashCommands,
  {
    name: 'myBlock',
    label: 'My Custom Block',
    description: 'Insert a custom block',
    keywords: ['custom', 'special'],
    group: 'Custom',
    onSelect: (editor) => {
      // Insert your custom node here
    },
  },
];

const editor = createTeiEditor({
  extensions: [
    ...StarterKit.filter((ext) => ext.name !== 'slashCommand'),
    SlashCommand.configure({ commands: myCommands }),
  ],
});
```

---

## Theming

The default theme uses Tailwind classes with `tei-` prefixed names. Override by passing a custom theme:

```tsx
import { createTeiEditor } from '@teispace/teieditor/core';
import { defaultTheme } from '@teispace/teieditor/themes';

const editor = createTeiEditor({
  extensions: StarterKit,
  theme: {
    ...defaultTheme,
    paragraph: 'my-paragraph text-gray-800 dark:text-gray-200',
    heading: {
      h1: 'text-4xl font-black tracking-tight',
      h2: 'text-3xl font-bold',
      h3: 'text-2xl font-semibold',
    },
    text: {
      ...defaultTheme.text,
      bold: 'font-extrabold',
      code: 'bg-gray-100 dark:bg-gray-800 rounded px-1 font-mono text-sm text-pink-600',
    },
  },
});
```

---

## Table of Contents Sidebar

Use the `useToc()` hook to build a custom sidebar:

```tsx
import { useToc } from '@teispace/teieditor/extensions/toc';

function Sidebar() {
  const entries = useToc();

  return (
    <nav>
      {entries.map((entry) => (
        <a key={entry.key} href={`#${entry.key}`} style={{ paddingLeft: (entry.level - 1) * 16 }}>
          {entry.text}
        </a>
      ))}
    </nav>
  );
}
```

---

## Subpath Exports

Every module is accessible via subpath imports for optimal tree-shaking:

```tsx
// Full package
import { ... } from '@teispace/teieditor';

// Core engine
import { createTeiEditor, TeiEditorProvider, useTeiEditor, BaseExtension } from '@teispace/teieditor/core';

// All extensions
import { Bold, Italic, StarterKit, ... } from '@teispace/teieditor/extensions';

// Individual extensions (best for tree-shaking)
import { Bold } from '@teispace/teieditor/extensions/bold';
import { Image } from '@teispace/teieditor/extensions/image';
import { SlashCommand } from '@teispace/teieditor/extensions/slash-command';

// Plugins
import { EditorContent, OnChangePlugin, BubbleMenuPlugin, InitialValuePlugin } from '@teispace/teieditor/plugins';

// Themes
import { defaultTheme } from '@teispace/teieditor/themes';

// Utilities
import { serialize, deserialize, type SerializationFormat } from '@teispace/teieditor/utils';
```

---

## Keyboard Shortcuts

| Shortcut | Action         |     | Shortcut          | Action           |
| -------- | -------------- | --- | ----------------- | ---------------- |
| `Ctrl+B` | Bold           |     | `Ctrl+Shift+7`    | Ordered List     |
| `Ctrl+I` | Italic         |     | `Ctrl+Shift+8`    | Bullet List      |
| `Ctrl+U` | Underline      |     | `Ctrl+Shift+9`    | Checklist        |
| `Ctrl+E` | Inline Code    |     | `Ctrl+Shift+L`    | Align Left       |
| `Ctrl+K` | Insert Link    |     | `Ctrl+Shift+E`    | Align Center     |
| `Ctrl+F` | Find & Replace |     | `Ctrl+Shift+R`    | Align Right      |
| `Ctrl+Z` | Undo           |     | `Ctrl+Shift+J`    | Justify          |
| `Ctrl+Y` | Redo           |     | `Tab / Shift+Tab` | Indent / Outdent |

### Triggers

| Trigger | Action                                |
| ------- | ------------------------------------- |
| `/`     | Open slash command menu (17 commands) |
| `@`     | Open mention suggestions              |
| `:`     | Open emoji picker                     |

### Markdown Shortcuts (live)

| Type              | Result            |
| ----------------- | ----------------- |
| `# ` `## ` `### ` | Headings          |
| `> `              | Blockquote        |
| ` ``` `           | Code block        |
| `- ` or `* `      | Bullet list       |
| `1. `             | Numbered list     |
| `[] `             | Checklist         |
| `**text**`        | **Bold**          |
| `*text*`          | _Italic_          |
| `` `text` ``      | `Code`            |
| `~~text~~`        | ~~Strikethrough~~ |
| `[text](url)`     | Link              |

---

## Props Reference

### `<TeiEditor>` (registry component)

| Prop              | Type                                       | Default              | Description                                |
| ----------------- | ------------------------------------------ | -------------------- | ------------------------------------------ |
| `extensions`      | `TeiExtension[]`                           | `[]`                 | Additional extensions on top of StarterKit |
| `initialValue`    | `string`                                   | —                    | Initial content string                     |
| `initialFormat`   | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'`             | Format of initialValue                     |
| `onChange`        | `(value: string) => void`                  | —                    | Called on content change                   |
| `format`          | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'`             | Output format for onChange                 |
| `placeholder`     | `string`                                   | `'Start writing...'` | Placeholder text                           |
| `className`       | `string`                                   | —                    | Wrapper CSS class                          |
| `editorClassName` | `string`                                   | —                    | Content area CSS class                     |
| `showToolbar`     | `boolean`                                  | `true`               | Show/hide toolbar                          |
| `showBubbleMenu`  | `boolean`                                  | `true`               | Show/hide floating selection menu          |
| `readOnly`        | `boolean`                                  | `false`              | Read-only mode                             |
| `config`          | `Partial<TeiEditorConfig>`                 | —                    | Override editor config                     |

---

## Peer Dependencies

All heavy dependencies are peer deps — your project controls the versions.

**Required:**

```json
{
  "react": ">=18.0.0",
  "react-dom": ">=18.0.0",
  "lexical": ">=0.43.0",
  "@lexical/react": ">=0.43.0",
  "@lexical/rich-text": ">=0.43.0",
  "@lexical/selection": ">=0.43.0",
  "@lexical/utils": ">=0.43.0",
  "@lexical/history": ">=0.43.0"
}
```

**Optional (for specific extensions):**

```json
{
  "@lexical/list": ">=0.43.0",
  "@lexical/link": ">=0.43.0",
  "@lexical/code": ">=0.43.0",
  "@lexical/table": ">=0.43.0",
  "@lexical/markdown": ">=0.43.0",
  "@lexical/html": ">=0.43.0"
}
```

---

## Architecture

```
@teispace/teieditor (npm package)
├── core/           createTeiEditor, BaseExtension, Provider, hooks
├── extensions/     37 extensions, each self-contained
├── plugins/        React plugins (EditorContent, OnChange, BubbleMenu, InitialValue, etc.)
├── themes/         Tailwind-based default theme
├── utils/          Serialization (HTML/MD/JSON/text), format helpers
└── cli/            npx teieditor init/add/list (commander + picocolors + ora)

registry/ (copied to your project via CLI)
├── editor.tsx      Zero-config <TeiEditor> component
└── toolbar.tsx     Full-featured toolbar (customize freely)
```

**Why shadcn-style?** The npm package contains headless logic (extensions, plugins, serialization). The UI components (toolbar, editor wrapper) are copied into your project so you can customize them without fighting a library's API. Core logic updates come via `npm update`. UI is yours to own.

---

## Contributing

```bash
git clone https://github.com/teispace/npm-packages.git
cd npm-packages
yarn install
cd packages/teieditor
yarn dev          # Watch mode
yarn build        # Production build
yarn type-check   # TypeScript validation
yarn lint         # ESLint
yarn format       # Prettier
```

### Adding a New Extension

1. Create `src/extensions/<name>/index.ts`
2. Extend `BaseExtension` with your config type
3. Implement `getNodes()`, `getPlugins()`, `getKeyBindings()` as needed
4. Add to `src/extensions/index.ts` barrel export
5. Add entry to `tsup.config.ts`
6. Optionally add to StarterKit and default slash commands

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for full guidelines.

---

## License

MIT — free for personal and commercial use.
