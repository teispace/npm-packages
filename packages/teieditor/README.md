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
| **Editor Modes**  | Full WYSIWYG, Notion-style  | WYSIWYG only      | WYSIWYG         | Headless   |
| **Theming**       | CSS variables (`--tei-*`)   | CSS               | CSS variables    | CSS        |

---

## Features

### Text Formatting
Bold, Italic, Underline, Strikethrough, Inline Code, Highlight, Subscript, Superscript, Font Size (+/- controls), Font Family (6 families), Text Color, Background Color, Clear Formatting

### Block Types
Headings (H1-H6), Paragraphs, Blockquotes, Code Blocks (syntax highlighting, language selector, copy button), Callouts (info/warning/error/success), Collapsible/Toggle (3-node structure: container + editable title + editable content), Horizontal Rules, Page Breaks

### Lists
Ordered, Unordered, Checklists with nesting and max indent control

### Media & Embeds
Images (upload dialog, URL input, paste, drag & drop, resize handles), Tables (cell resizer, hover "+" buttons for rows/columns, right-click context menu), YouTube embeds, Twitter/X embeds, Figma embeds, Generic URL embeds, File attachments

### Layout
Column layout system (2-col, 3-col, etc.), Element alignment (left/center/right/justify), Indent/Outdent

### Floating UI
- **Toolbar** (Full mode) — Undo/redo, block type, font family/size with +/-, text formatting (8 formats), colors, link, clear formatting, alignment, indent, insert dropdown
- **Bubble Menu** — Floating format bar on text selection with bold, italic, underline, strikethrough, code, highlight, subscript, superscript, and link toggle
- **Slash Menu** — Type `/` for a grouped command palette with 25+ commands (text, headings, lists, blocks, media, callouts)
- **Link Editor** — Floating view/edit modes with URL validation, "open in new tab" toggle, auto-https prefix
- **Code Action Menu** — Floating language selector + copy button on code blocks
- **Table Menu** — Right-click context menu: insert/delete rows & columns, delete table
- **Table Hover Actions** — "+" buttons on table edges for quick row/column insertion
- **Table Cell Resizer** — Drag column borders to resize
- **Context Menu** — Right-click any block: copy, cut, paste, duplicate, delete — with proper icons and keyboard shortcut hints
- **Auto-Embed** — Paste a YouTube/Twitter/Figma URL and get an "Embed this?" popup
- **Emoji Picker** — Type `:` followed by a keyword (e.g. `:fire`) for emoji suggestions
- **Drag Handle** — Grip icon + "+" button on block hover for reordering and insertion

### Notion-like UX
Slash commands (`/`), floating bubble menu, drag-handle block reordering, per-block placeholders, turn-into block conversion — all wired and working out of the box

### Advanced
@Mentions (configurable trigger, async search), Emoji (`:` trigger), Live Markdown shortcuts, Find & Replace, Word Count, Table of Contents, Math/KaTeX blocks (optional peer dep), DateTime insertion

### I/O
Import & export in 4 formats: HTML, Markdown, JSON (lossless), Plain Text. Mix input/output formats freely.

### DX
TypeScript strict mode, 55+ subpath exports, tree-shakable ESM, `sideEffects: false`, CSS variable theming, dark mode, SSR-safe

---

## Architecture

```
npm package (headless core, tree-shakable)
├── core/           createTeiEditor, BaseExtension, TeiEditorProvider, useTeiEditor
├── extensions/     46 extensions — nodes, plugins, configs, commands
├── plugins/        Lexical plugins:
│   ├── toolbar-context.tsx       Shared ToolbarProvider + useToolbarState hook
│   ├── code-action-menu-plugin   Floating code block actions
│   ├── table-cell-resizer-plugin Drag-to-resize table columns
│   ├── table-hover-actions-plugin "+" buttons on table edges
│   ├── auto-embed-plugin         URL detection on paste
│   ├── emoji-picker-plugin       ":" triggered emoji typeahead
│   └── ...                       EditorContent, OnChange, InitialValue, etc.
├── themes/         CSS variable system (--tei-*) + comprehensive default theme
├── utils/          Serialization (4 formats), positioning, format helpers
└── cli/            npx teieditor init/add/list

registry/ (copied to your project via CLI — you own these files)
├── ui/             Primitives: button, dropdown, modal, color-picker,
│                   image-resizer, separator, input, icons (40+ inline SVGs)
├── components/     Feature UI:
│   ├── toolbar/    Modular toolbar (block type, font family/size, 8 format
│   │               buttons, colors, link, clear, alignment, indent, insert)
│   ├── bubble-menu/  Floating format bar (10 buttons + link)
│   ├── slash-menu/   Grouped command palette (25+ commands)
│   ├── link-editor/  Floating view/edit with URL validation
│   ├── table-menu/   Right-click table operations
│   ├── context-menu/ Right-click block actions with shortcut hints
│   ├── mention-list/ Avatar-initialed suggestions
│   └── emoji-picker/ Emoji suggestions
└── editors/        Presets:
    ├── editor.tsx         Full WYSIWYG (toolbar + all floating UI)
    └── editor-notion.tsx  Notion-style (no toolbar, slash + bubble + drag)
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [Editor Modes](#editor-modes)
- [CLI](#cli)
- [Content Formats](#content-formats)
- [Plugin System](#plugin-system)
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

export default function Page() {
  return <TeiEditor onChange={(html) => console.log(html)} />;
}
```

Done. Full editor with toolbar, bubble menu, slash commands, code actions, table plugins, context menu, auto-embed, and emoji picker — all wired together.

---

## Editor Modes

### Full WYSIWYG (default)

```tsx
import { TeiEditor } from '@/components/teieditor/editors/editor';

<TeiEditor onChange={setContent} showToolbar showBubbleMenu />
```

Everything enabled: fixed toolbar at top, floating bubble menu on selection, slash commands, link editor, code action menu on code blocks, table cell resizer + hover actions + context menu, auto-embed on URL paste, emoji picker with `:` trigger, and block-level context menu on right-click.

**Toolbar sections:** Undo/Redo | Block Type Dropdown | Font Family | Font Size (+/-) | Bold, Italic, Underline, Strikethrough, Code, Highlight, Subscript, Superscript | Text/BG Color | Link | Clear Formatting | Alignment | Indent/Outdent | Insert Dropdown (Image, Table, Embed, Callout, Collapsible, Horizontal Rule)

### Notion-style

```tsx
import { TeiEditorNotion } from '@/components/teieditor/editors/editor-notion';

<TeiEditorNotion onChange={setContent} />
```

No toolbar. All formatting via:
- **`/` Slash commands** — 25+ grouped commands for inserting any block type
- **Bubble menu** — Floating format bar on text selection (10 format buttons + link)
- **Drag handles** — Grip icon with "+" button on block hover
- **Keyboard shortcuts** — All formatting shortcuts work
- Plus: code action menu, table plugins, context menu, auto-embed, emoji picker

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
// Default: HTML in/out
<TeiEditor onChange={setContent} />

// Markdown round-trip
<TeiEditor initialValue="# Hello" initialFormat="markdown" onChange={setMd} format="markdown" />

// HTML in, Markdown out
<TeiEditor initialValue="<h1>Hello</h1>" initialFormat="html" onChange={setMd} format="markdown" />

// JSON round-trip (lossless — best for databases)
<TeiEditor initialValue={savedJson} initialFormat="json" onChange={save} format="json" />

// Programmatic serialization
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

## Plugin System

TeiEditor includes a rich set of Lexical plugins that power the editor's floating UI and enhanced features. All plugins are available from `@teispace/teieditor/plugins`:

### Shared State: ToolbarContext

The `ToolbarProvider` and `useToolbarState()` hook provide shared, selection-aware toolbar state to all components — the toolbar, bubble menu, and text color buttons all read from the same source of truth.

```tsx
import { useToolbarState } from '@teispace/teieditor/plugins';

function MyCustomToolbar() {
  const toolbar = useToolbarState();
  // toolbar.blockType, toolbar.activeFormats, toolbar.fontFamily, toolbar.fontSize,
  // toolbar.fontColor, toolbar.bgColor, toolbar.canUndo, toolbar.canRedo, toolbar.isLink
  // toolbar.toggleFormat('bold'), toolbar.applyFontFamily('Georgia'), etc.
}
```

**State tracked:** `blockType`, `activeFormats` (Set of text formats), `elementFormat` (alignment), `canUndo`/`canRedo`, `isLink`, `fontFamily`, `fontSize`, `fontColor`, `bgColor`, `codeLanguage`, `rootType`, `activeEditor`

**Actions available:** `toggleFormat()`, `setAlignment()`, `applyFontFamily()`, `applyFontSize()`, `applyFontColor()`, `applyBgColor()`, `clearFormatting()`

### Built-in Plugins

| Plugin | Purpose |
|--------|---------|
| `EditorContent` | Main editor rendering area with placeholder |
| `OnChangePlugin` | Content change callback with format conversion |
| `InitialValuePlugin` | Sets editor content on mount (any format) |
| `KeyboardShortcutsPlugin` | Collects and registers shortcuts from all extensions |
| `TabIndentationPlugin` | Tab/Shift+Tab for indentation |
| `ClickableLinkPlugin` | Makes links clickable |
| `CodeActionMenuPlugin` | Floating language selector + copy on code blocks |
| `TableCellResizerPlugin` | Drag-to-resize table column widths |
| `TableHoverActionsPlugin` | "+" buttons on table edges for adding rows/columns |
| `AutoEmbedPlugin` | Detects YouTube/Twitter/Figma URLs on paste |
| `EmojiPickerPlugin` | ":" triggered emoji typeahead menu |

---

## Extensions

### 46 Built-in Extensions

#### Text Formatting
Bold, Italic, Underline, Strikethrough, InlineCode, Highlight, Subscript, Superscript

#### Block-Level
Heading (H1-H6), Paragraph, Blockquote, HorizontalRule, CodeBlock (syntax highlighting + language selector + copy), Callout (info/warning/error/success), Toggle/Collapsible (3-node: container + editable title + editable content), PageBreak

#### Lists
List (ordered/unordered/checklist), ListMaxIndent

#### Media & Embeds
Image (upload dialog + URL input, resize handles), Table (cell resizer + hover actions + context menu), YouTube, Twitter/X, Figma, Embed (generic URL), File attachment

#### Layout & Alignment
Layout (column system), Alignment (left/center/right/justify), FontSize (+/- controls), FontFamily (6 families), Color (text + background)

#### Notion-like UX
SlashCommand (25+ commands, grouped, extensible), DragHandle (grip + "+" button), Placeholder (per-block-type), TurnInto, DragDropPaste

#### Advanced
Mention (@trigger, async search), Emoji (:trigger), Markdown (live shortcuts), FindReplace (Ctrl+F), WordCount, TOC (useToc hook), Math/KaTeX (optional peer dep), DateTime, MaxLength, History

### Slash Commands (25+)

Type `/` to open the command palette. Built-in commands:

| Group | Commands |
|-------|----------|
| **Basic** | Text |
| **Headings** | Heading 1, 2, 3, 4, 5, 6 |
| **Lists** | Bullet List, Numbered List, Checklist |
| **Blocks** | Quote, Code Block, Divider, Collapsible, Info/Warning/Success/Error Callout |
| **Media** | Image, Table, Embed |

Extend with your own commands:

```tsx
import { SlashCommand, defaultSlashCommands } from '@teispace/teieditor/extensions/slash-command';

const myCommand = {
  name: 'myBlock',
  label: 'My Custom Block',
  description: 'Insert a custom block',
  keywords: ['custom', 'block'],
  group: 'Custom',
  onSelect: (editor) => { /* dispatch your command */ },
};

<TeiEditor extensions={[
  SlashCommand.configure({
    commands: [...defaultSlashCommands, myCommand],
  }),
]} />
```

### Configuring Extensions

```tsx
import { Heading } from '@teispace/teieditor/extensions/heading';
import { Image } from '@teispace/teieditor/extensions/image';
import { Mention } from '@teispace/teieditor/extensions/mention';

<TeiEditor extensions={[
  Heading.configure({ levels: ['h1', 'h2', 'h3'] }),
  Image.configure({ onUpload: uploadFn, maxSize: 5_000_000 }),
  Mention.configure({
    trigger: '@',
    onSearch: fetchUsers,
    menuRenderFn: myCustomMentionUI,
  }),
]} />
```

---

## Creating Custom Extensions

```tsx
import { BaseExtension } from '@teispace/teieditor/core';
import { createCommand, COMMAND_PRIORITY_LOW } from 'lexical';

const MY_COMMAND = createCommand('MY_COMMAND');

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

// Use it
<TeiEditor extensions={[MyExt.configure({ color: 'red' })]} />
```

### Extension lifecycle

1. `getNodes()` — Return custom Lexical node classes to register
2. `getPlugins()` — Return React components to mount inside the editor
3. `getKeyBindings()` — Return `{ 'Mod+B': handler }` shortcut mappings
4. `onRegister(editor)` — Called when the editor mounts; register commands, transforms, listeners. Return a cleanup function.
5. `onDestroy()` — Called when the editor unmounts
6. `configure(overrides)` — Returns a new instance with merged config (immutable)

---

## Theming

All colors use CSS custom properties. Override in your global CSS:

```css
:root {
  --tei-bg: 0 0% 100%;
  --tei-fg: 0 0% 3.9%;
  --tei-border: 0 0% 89.8%;
  --tei-primary: 0 0% 9%;
  --tei-primary-fg: 0 0% 98%;
  --tei-accent: 0 0% 96.1%;
  --tei-accent-fg: 0 0% 9%;
  --tei-muted: 0 0% 96.1%;
  --tei-muted-fg: 0 0% 45.1%;
  --tei-popover: 0 0% 100%;
  --tei-popover-fg: 0 0% 3.9%;
  --tei-selection: 214 95% 93%;
  --tei-highlight: 48 96% 89%;
  --tei-bubble-bg: 0 0% 9%;
  --tei-bubble-fg: 0 0% 98%;
  --tei-toolbar-bg: 0 0% 100%;
  --tei-toolbar-border: 0 0% 89.8%;
  --tei-drag-handle: 0 0% 45%;
  --tei-ring: 0 0% 63.9%;
  --tei-radius: 0.5rem;
}

.dark {
  --tei-bg: 0 0% 3.9%;
  --tei-fg: 0 0% 98%;
  --tei-border: 0 0% 14.9%;
  --tei-primary: 0 0% 98%;
  --tei-primary-fg: 0 0% 9%;
  --tei-accent: 0 0% 14.9%;
  --tei-accent-fg: 0 0% 98%;
  --tei-muted: 0 0% 14.9%;
  --tei-muted-fg: 0 0% 63.9%;
  --tei-popover: 0 0% 7%;
  --tei-popover-fg: 0 0% 98%;
  --tei-selection: 214 59% 25%;
  --tei-highlight: 48 40% 30%;
  --tei-bubble-bg: 0 0% 15%;
  --tei-bubble-fg: 0 0% 98%;
  --tei-toolbar-bg: 0 0% 5%;
  --tei-toolbar-border: 0 0% 14.9%;
}
```

Or override the Lexical theme object:

```tsx
import { defaultTheme } from '@teispace/teieditor/themes';

const editor = createTeiEditor({
  theme: { ...defaultTheme, paragraph: 'my-custom-paragraph-class' },
});
```

### Theme Coverage

The default theme includes classes for:
- Root, paragraphs, headings (h1-h6), text formats (9 types), blockquotes
- Lists (ordered/unordered/checklist with 5-level nesting depth)
- Links, code blocks (30+ syntax highlight tokens)
- Tables (cell, header, selection, resizer, sorted indicator, scroll wrapper)
- Horizontal rule, embed blocks (base + focus), collapsible (container/title/content)
- Layout (container/item), marks (comments), block cursor, character limit
- Hashtags, autocomplete, images, mentions, sticky notes, page breaks
- Indent levels (1-10)

---

## Keyboard Shortcuts

| Shortcut | Action | | Shortcut | Action |
|----------|--------|-|----------|--------|
| `Ctrl+B` | Bold | | `Ctrl+Shift+7` | Ordered List |
| `Ctrl+I` | Italic | | `Ctrl+Shift+8` | Bullet List |
| `Ctrl+U` | Underline | | `Ctrl+Shift+9` | Checklist |
| `Ctrl+E` | Inline Code | | `Ctrl+Shift+H` | Highlight |
| `Ctrl+K` | Link Editor | | `Ctrl+Shift+S` | Strikethrough |
| `Ctrl+F` | Find & Replace | | `Tab / Shift+Tab` | Indent / Outdent |
| `Ctrl+Z` | Undo | | `/` | Slash Commands |
| `Ctrl+Y` | Redo | | `@` | Mentions |
| `Ctrl+A` | Select All | | `:` + text | Emoji Picker |

On macOS, `Ctrl` becomes `Cmd`.

**Markdown shortcuts:** `#` heading, `##` h2, `###` h3, `>` quote, `` ``` `` code block, `- ` bullet list, `1. ` numbered list, `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `[text](url)`, `---` horizontal rule

---

## Props Reference

### `<TeiEditor>` (Full Mode)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `extensions` | `TeiExtension[]` | `[]` | Additional extensions beyond StarterKit |
| `initialValue` | `string` | — | Initial content |
| `initialFormat` | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'` | Format of initial value |
| `onChange` | `(value: string) => void` | — | Content change callback |
| `format` | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'` | Output format |
| `placeholder` | `string` | `'Start writing...'` | Placeholder text |
| `showToolbar` | `boolean` | `true` | Show fixed toolbar |
| `showBubbleMenu` | `boolean` | `true` | Show floating format bar on selection |
| `readOnly` | `boolean` | `false` | Read-only mode |
| `className` | `string` | — | Wrapper CSS class |
| `editorClassName` | `string` | — | Editor content area CSS class |
| `config` | `Partial<TeiEditorConfig>` | — | Advanced editor config overrides |

### `<TeiEditorNotion>` (Notion Mode)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `extensions` | `TeiExtension[]` | `[]` | Additional extensions beyond StarterKit |
| `initialValue` | `string` | — | Initial content |
| `initialFormat` | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'` | Format of initial value |
| `onChange` | `(value: string) => void` | — | Content change callback |
| `format` | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'` | Output format |
| `placeholder` | `string` | `"Type '/' for commands..."` | Placeholder text |
| `readOnly` | `boolean` | `false` | Read-only mode |
| `className` | `string` | — | Wrapper CSS class |
| `editorClassName` | `string` | — | Editor content area CSS class |
| `config` | `Partial<TeiEditorConfig>` | — | Advanced editor config overrides |

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

**Optional heavy dependencies (for specific features):**
- `katex` — For Math/KaTeX extension
- `@excalidraw/excalidraw` — For Excalidraw drawing extension
- `prettier` — For code formatting in code blocks

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
yarn test         # Vitest (188 tests)

# From root
yarn lint         # Biome check
```

### Adding a New Extension

1. Create `src/extensions/<name>/index.ts`
2. Extend `BaseExtension` with your config type
3. Implement `getNodes()`, `getPlugins()`, `getKeyBindings()`, `onRegister()` as needed
4. Add to `src/extensions/index.ts` barrel
5. Add entry to `tsup.config.ts`
6. Optionally add to StarterKit and slash commands
7. Add default-commands entry if it should appear in the slash menu

### Adding a New Plugin

1. Create `src/plugins/<name>-plugin.tsx`
2. Export from `src/plugins/index.ts`
3. Add to both editor presets (`editor.tsx` and `editor-notion.tsx`) if it should always be active

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for full guidelines.

---

## License

MIT — free for personal and commercial use.
