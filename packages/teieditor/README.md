<div align="center">

# @teispace/teieditor

A feature-rich, lightweight, fully customizable rich text editor built on [Lexical](https://lexical.dev).

**shadcn-style** — UI lives in your project. You own the code. Fully customizable. No vendor lock-in.

[![npm version](https://img.shields.io/npm/v/@teispace/teieditor.svg)](https://www.npmjs.com/package/@teispace/teieditor)
[![license](https://img.shields.io/npm/l/@teispace/teieditor.svg)](https://github.com/teispace/npm-packages/blob/main/packages/teieditor/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

</div>

---

## Why TeiEditor?

|                   | TeiEditor                   | Tiptap            | Plate.js        | LexKit     |
| ----------------- | --------------------------- | ----------------- | --------------- | ---------- |
| **Foundation**    | Lexical (Meta)              | ProseMirror       | Slate           | Lexical    |
| **Extensions**    | 46 built-in                 | 100+ (many paid)  | 40+             | 25+        |
| **Cost**          | Free & open source          | Paid pro features | Free            | Free       |
| **Customization** | shadcn-style (own the code) | Props/CSS only    | shadcn registry | Headless   |
| **Format I/O**    | HTML, Markdown, JSON, Text  | HTML, JSON        | HTML, JSON      | HTML, JSON |
| **Editor Modes**  | WYSIWYG, Notion, Minimal   | WYSIWYG only      | WYSIWYG         | Headless   |
| **Theming**       | CSS variables (`--tei-*`)   | CSS               | CSS variables    | CSS        |

---

## Features

**Text** — Bold, Italic, Underline, Strikethrough, Code, Highlight, Sub/Superscript, Font Size, Font Family, Text/Background Color

**Blocks** — Headings (H1-H6), Paragraphs, Blockquotes, Code Blocks (syntax highlighted + language selector + copy), Callouts (5 variants), Toggle/Collapsible, Horizontal Rules, Page Breaks

**Lists** — Ordered, Unordered, Checklists (with nesting + max indent control)

**Media** — Images (upload, paste, drag & drop, **click-to-select, resize handles**), Tables (**right-click context menu** for insert/delete rows & columns), YouTube embeds (iframe), Twitter/X embeds, Figma embeds, File Attachments

**Layout** — Column layout system (2-col, 3-col, etc.), Element alignment (left/center/right/justify), Indent/outdent

**Notion-like UX** — Slash commands (`/`) with grouped command palette, Floating bubble menu on text selection, Drag-handle block reordering, Per-block placeholders, Turn-into block conversion

**Floating UI** — **Bubble menu** (format bar on selection), **Link editor** (view/edit modes, no `window.prompt`), **Code bar** (language selector + copy on hover), **Table menu** (right-click context), **Context menu** (right-click any block: copy, cut, paste, duplicate, delete)

**Advanced** — @Mentions (async search, avatar list), Emoji picker (`:` trigger), Live Markdown shortcuts, Find & Replace, Word Count, Table of Contents, Math/KaTeX blocks, DateTime insertion

**I/O** — Import & export HTML, Markdown, JSON, and plain text. Mix input/output formats freely.

**3 Editor Modes** — Full WYSIWYG (toolbar), Notion-style (slash + bubble + drag, no toolbar), Minimal (bubble menu only, for comments/inputs)

**DX** — TypeScript strict mode, 55+ subpath exports, tree-shakable, `sideEffects: false`, CSS variable theming, dark mode, SSR-safe

---

## Architecture

```
npm package (headless, no UI deps)
├── core/           createTeiEditor, BaseExtension, Provider, hooks
├── extensions/     46 extensions — nodes, configs, commands
├── plugins/        Lexical plugins (EditorContent, OnChange, TabIndent, ClickableLink)
├── themes/         CSS variable system (--tei-*) + default theme
├── utils/          Serialization (4 formats), positioning, format helpers
└── cli/            npx teieditor init/add/list

registry/ (copied to your project via CLI — you own these files)
├── ui/             Primitives: button, dropdown, modal, color-picker,
│                   image-resizer, separator, input, icons (40+ inline SVGs)
├── components/     Feature UI:
│   ├── toolbar/    Modular toolbar (7 sub-components, SVG icons, proper dropdowns)
│   ├── bubble-menu/  Floating format bar on text selection
│   ├── slash-menu/   Grouped command palette
│   ├── link-editor/  Floating view/edit link editor
│   ├── table-menu/   Right-click table operations
│   ├── code-bar/     Language selector + copy on code blocks
│   ├── context-menu/ Right-click block actions
│   ├── mention-list/ Avatar-initialed suggestions
│   ├── drag-handle/  GripVertical icon for reordering
│   └── emoji-picker/ Emoji suggestions
└── editors/        Presets:
    ├── editor.tsx         Full WYSIWYG
    ├── editor-notion.tsx  Notion-style (no toolbar)
    └── editor-minimal.tsx Minimal (bubble only)
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [Editor Modes](#editor-modes)
- [CLI](#cli)
- [Content Formats](#content-formats)
- [Extensions](#extensions)
- [Creating Custom Extensions](#creating-custom-extensions)
- [Theming](#theming)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Props Reference](#props-reference)
- [Peer Dependencies](#peer-dependencies)
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

Copies customizable `.tsx` files into `src/components/teieditor/`. You own them — edit freely.

### 3. Use

```tsx
import { TeiEditor } from '@/components/teieditor/editors/editor';

<TeiEditor onChange={(html) => console.log(html)} />
```

Done. Full editor with toolbar, bubble menu, slash commands, and all 46 extensions.

---

## Editor Modes

### Full WYSIWYG (default)

```tsx
import { TeiEditor } from '@/components/teieditor/editors/editor';

<TeiEditor onChange={setContent} showToolbar showBubbleMenu />
```

Toolbar + bubble menu + link editor + code bar + table menu + context menu.

### Notion-style

```tsx
import { TeiEditorNotion } from '@/components/teieditor/editors/editor-notion';

<TeiEditorNotion onChange={setContent} />
```

No toolbar. Slash commands (`/`), floating bubble menu, drag handles, placeholders.

### Minimal

```tsx
import { TeiEditorMinimal } from '@/components/teieditor/editors/editor-minimal';

<TeiEditorMinimal onChange={setContent} placeholder="Write a comment..." />
```

Bubble menu only. Great for comments, chat inputs, small rich text fields.

---

## CLI

```bash
npx teieditor init                      # Scaffold all UI components
npx teieditor add <component>           # Add a specific component
npx teieditor list                      # List available components
npx teieditor init --path src/editor    # Custom output directory
```

---

## Content Formats

Import and export in 4 formats. Mix them freely.

```tsx
// Default: HTML
<TeiEditor onChange={setContent} />

// Markdown in → Markdown out
<TeiEditor initialValue="# Hello" initialFormat="markdown" onChange={setMd} format="markdown" />

// HTML in → Markdown out
<TeiEditor initialValue="<h1>Hello</h1>" initialFormat="html" onChange={setMd} format="markdown" />

// JSON round-trip (lossless, best for databases)
<TeiEditor initialValue={savedJson} initialFormat="json" onChange={save} format="json" />

// Programmatic
import { serialize, deserialize } from '@teispace/teieditor/utils';
const md = serialize(editor, 'markdown');
deserialize(editor, htmlString, 'html');
```

| Format | Lossless | Best for |
|--------|----------|----------|
| **JSON** | Yes | Database persistence |
| **HTML** | Mostly | Rendering, emails, CMS |
| **Markdown** | Partial | Docs, git-friendly content |
| **Text** | No | Search indexing, previews |

---

## Extensions

### 46 Built-in Extensions

#### Text Formatting
Bold, Italic, Underline, Strikethrough, InlineCode, Highlight, Subscript, Superscript

#### Block-Level
Heading (H1-H6), Paragraph, Blockquote, HorizontalRule, CodeBlock (language selector + copy), Callout (info/warning/error/success/note), Toggle (collapsible), PageBreak

#### Lists
List (ordered/unordered/checklist), ListMaxIndent

#### Media & Embeds
Image (upload/paste/drop, **resize handles**), Table (**context menu**), YouTube, Twitter/X, Figma, Embed (generic URL), File attachment

#### Layout & Alignment
Layout (column system), Alignment (left/center/right/justify), FontSize, FontFamily, Color (text + background)

#### Notion-like UX
SlashCommand (17 commands, extensible), DragHandle (using Lexical experimental plugin), Placeholder (per-block-type), TurnInto, DragDropPaste

#### Advanced
Mention (@trigger, async search), Emoji (:trigger, fuzzy search), Markdown (live shortcuts), FindReplace (Ctrl+F), WordCount, TOC (useToc hook), Math/KaTeX, DateTime, MaxLength, History

### Configuring Extensions

```tsx
import { Heading } from '@teispace/teieditor/extensions/heading';
import { Image } from '@teispace/teieditor/extensions/image';
import { Mention } from '@teispace/teieditor/extensions/mention';
import { SlashCommand } from '@teispace/teieditor/extensions/slash-command';

const editor = createTeiEditor({
  extensions: [
    Heading.configure({ levels: ['h1', 'h2', 'h3'] }),
    Image.configure({ onUpload: uploadFn, maxSize: 5_000_000 }),
    Mention.configure({
      trigger: '@',
      onSearch: fetchUsers,
      menuRenderFn: myCustomMentionUI, // Plug in your own UI
    }),
    SlashCommand.configure({
      commands: [...defaultSlashCommands, myCustomCommand],
      menuRenderFn: myCustomSlashUI, // Plug in your own UI
    }),
  ],
});
```

---

## Creating Custom Extensions

```tsx
import { BaseExtension } from '@teispace/teieditor/core';

class MyExtension extends BaseExtension<{ color: string }> {
  readonly name = 'my-extension';
  protected readonly defaults = { color: 'blue' };

  getNodes() { return [MyCustomNode]; }
  getPlugins() { return [MyPlugin]; }
  getKeyBindings() {
    return { 'Mod+Shift+M': (editor) => { /* ... */ return true; } };
  }
  onRegister(editor) {
    return editor.registerCommand(MY_COMMAND, handler, COMMAND_PRIORITY_LOW);
  }
}

export const MyExt = new MyExtension();
```

---

## Theming

All colors use CSS custom properties. Override in your global CSS:

```css
:root {
  --tei-bg: 0 0% 100%;
  --tei-fg: 0 0% 3.9%;
  --tei-border: 0 0% 89.8%;
  --tei-primary: 0 0% 9%;
  --tei-accent: 0 0% 96.1%;
  --tei-bubble-bg: 0 0% 9%;
  --tei-bubble-fg: 0 0% 98%;
  --tei-highlight: 48 96% 89%;
  --tei-radius: 0.5rem;
  /* ... see themes/variables.css for all */
}
.dark {
  --tei-bg: 0 0% 3.9%;
  --tei-fg: 0 0% 98%;
  /* ... */
}
```

Or override the Lexical theme object:

```tsx
import { defaultTheme } from '@teispace/teieditor/themes';
const editor = createTeiEditor({
  theme: { ...defaultTheme, paragraph: 'my-custom-class' },
});
```

---

## Keyboard Shortcuts

| Shortcut | Action | | Shortcut | Action |
|----------|--------|-|----------|--------|
| `Ctrl+B` | Bold | | `Ctrl+Shift+7` | Ordered List |
| `Ctrl+I` | Italic | | `Ctrl+Shift+8` | Bullet List |
| `Ctrl+U` | Underline | | `Ctrl+Shift+9` | Checklist |
| `Ctrl+E` | Inline Code | | `Ctrl+Shift+L` | Align Left |
| `Ctrl+K` | Link Editor | | `Ctrl+Shift+R` | Align Right |
| `Ctrl+F` | Find & Replace | | `Tab / Shift+Tab` | Indent / Outdent |
| `Ctrl+Z` | Undo | | `/` | Slash Commands |
| `Ctrl+Y` | Redo | | `@` | Mentions |

**Markdown shortcuts:** `#` heading, `>` quote, `` ``` `` code, `- ` list, `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `[text](url)`

---

## Props Reference

### `<TeiEditor>` / `<TeiEditorNotion>` / `<TeiEditorMinimal>`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `extensions` | `TeiExtension[]` | `[]` | Additional extensions |
| `initialValue` | `string` | — | Initial content |
| `initialFormat` | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'` | Format of initial value |
| `onChange` | `(value: string) => void` | — | Content change callback |
| `format` | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'` | Output format |
| `placeholder` | `string` | `'Start writing...'` | Placeholder text |
| `showToolbar` | `boolean` | `true` | Show toolbar (TeiEditor only) |
| `showBubbleMenu` | `boolean` | `true` | Show selection popup (TeiEditor only) |
| `readOnly` | `boolean` | `false` | Read-only mode |
| `className` | `string` | — | Wrapper CSS class |

---

## Peer Dependencies

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

## Contributing

```bash
git clone https://github.com/teispace/npm-packages.git
cd npm-packages && yarn install

# Development
cd packages/teieditor
yarn dev          # Watch mode
yarn build        # Production build
yarn type-check   # TypeScript validation

# Playground (test all features in browser)
cd examples/playground
yarn dev          # → http://localhost:3000

# From root
yarn lint         # Biome check
yarn test         # Vitest (212 tests)
```

### Adding a New Extension

1. Create `src/extensions/<name>/index.ts`
2. Extend `BaseExtension` with your config type
3. Implement `getNodes()`, `getPlugins()`, `getKeyBindings()`, `onRegister()` as needed
4. Add to `src/extensions/index.ts` barrel
5. Add entry to `tsup.config.ts`
6. Optionally add to StarterKit and slash commands

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for full guidelines.

---

## License

MIT — free for personal and commercial use.
