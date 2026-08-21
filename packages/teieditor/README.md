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
| **Extensions**    | 48 built-in                 | 100+ (many paid)  | 40+             | 25+        |
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
├── extensions/     48 extensions — nodes, plugins, configs, commands
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
- [shadcn Registry](#shadcn-registry)
- [Content Formats](#content-formats)
- [Plugin System](#plugin-system)
- [Extensions](#extensions)
- [Creating Custom Extensions](#creating-custom-extensions)
- [Theming](#theming)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Props Reference](#props-reference)
- [Collaboration & Advanced Lexical Config](#collaboration--advanced-lexical-config)
- [Peer Dependencies](#peer-dependencies)
- [Next.js & SSR](#nextjs--ssr)
- [Mobile & touch](#mobile--touch)
- [Troubleshooting](#troubleshooting)
- [Upgrading from 3.0.x](#upgrading-from-30x)
- [Contributing](#contributing)

---

## Quick Start

Two adoption paths. Pick one — both use the same underlying primitives.

### Path A — Drop-in (recommended for most apps)

One command install, one import, one component. Batteries-included.

```bash
npm install @teispace/teieditor lexical @lexical/react @lexical/rich-text \
  @lexical/selection @lexical/utils @lexical/history @lexical/html \
  @lexical/list @lexical/link @lexical/code @lexical/table @lexical/markdown
```

```tsx
'use client';
import { TeiEditor } from '@teispace/teieditor/react';
import '@teispace/teieditor/styles.css'; // once, anywhere in your app

export default function Page() {
  return <TeiEditor onChange={(html) => console.log(html)} />;
}
```

That's it. Full editor with toolbar, bubble menu, slash commands (`/`), tables, mentions (`@`), emoji (`:`), code blocks, auto-embed, and everything else — all wired together.

### Path B — Scaffold (own the UI source)

Want to fork, reskin, or delete pieces? Scaffold the UI into your project — shadcn-style.

```bash
npm install @teispace/teieditor # + the same lexical peers as above
npx teieditor init
```

Copies 25 `.tsx` files into `src/components/teieditor/`. You own them — edit freely, commit to git.

```tsx
import { TeiEditor } from '@/components/teieditor/editors/editor';
import '@teispace/teieditor/styles.css';

export default function Page() {
  return <TeiEditor onChange={(html) => console.log(html)} />;
}
```

Later, `npx teieditor update` re-syncs the files you haven't modified; your local edits are detected (by hash) and left alone.

### Tailwind v4 (required for default styling)

The drop-in UI uses Tailwind utility classes. Add this to your main CSS:

```css
@import "tailwindcss";
@import "@teispace/teieditor/tailwind.css";
```

The `tailwind.css` file tells Tailwind to scan the package's compiled output so utilities used by the drop-in components land in your bundle. If you'd rather manage sources yourself, import `@teispace/teieditor/styles.css` (variables only) and add the package dir to your own `@source` directive.

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
npx teieditor init                      # Scaffold the full UI tree (25 files)
npx teieditor init --path src/editor    # Custom output directory
npx teieditor init --force              # Overwrite existing files (destructive)

npx teieditor update                    # Re-sync unmodified files with the latest registry
npx teieditor update --force            # Overwrite even your local edits (destructive)

npx teieditor add toolbar               # Scaffold one group (pulls deps)
npx teieditor list                      # List available groups
```

**Groups** are independently-scaffoldable slices of the registry: `ui`, `toolbar`, `bubble-menu`, `slash-menu`, `link-editor`, `mention-list`, `table-menu`, `context-menu`, `code-bar`, `editor`. Use `add <group>` to pull just one slice.

**Safe updates:** `teieditor update` compares each file's hash against the registry. Files you've edited are marked `modified locally` and left untouched — only unmodified defaults get updated. Opt in to clobber with `--force`.

---

## shadcn Registry

The same components the CLI scaffolds are also published as a
[shadcn-spec registry](https://ui.shadcn.com/docs/registry), so `npx shadcn add`
and coding agents can consume them:

```bash
npx shadcn@latest add https://<your-host>/r/editor.json   # full editor + all deps
npx shadcn@latest add https://<your-host>/r/toolbar.json  # one slice
```

### What gets generated

`yarn registry:build` (also run as part of `yarn build`) reads the same `GROUPS`
array the CLI uses — `src/registry/manifest.ts` — and writes:

| Artifact | Contents |
|----------|----------|
| `registry.json` | Source manifest — one item per group, no file contents |
| `r/registry.json` | The same manifest, served next to the items |
| `r/<item>.json` | One built item per group, file contents inlined |

Each item carries:

- **`type`** — `registry:ui` for the primitives, `registry:component` for the
  floating menus, `registry:block` for the editor presets.
- **`dependencies`** — derived by scanning the real imports. Our registry files
  are deliberately **not** self-contained: they import from
  `@teispace/teieditor/{core,plugins,utils,extensions/*}`, the same way Plate's
  registry does. That is expressed as an npm dependency, pinned to the version
  that generated the registry.
- **`registryDependencies`** — the `GROUPS` dependency graph, 1:1.
- **`files[{path,type,target}]`** — targets are
  `@components/teieditor/<path>`, which preserves the folder layout the files'
  relative imports rely on.
- **`cssVars`** — the `--tei-*` design tokens for light and dark, attached to
  the root `ui` item, so `shadcn add` injects them and you don't have to
  `import '@teispace/teieditor/styles.css'` just to get the tokens. (You still
  want `tailwind.css` for the utility classes — see below.)

### Serving it

The generator does not deploy anything; it only produces static JSON. Point
`shadcn add` at wherever you serve `r/` from — the files are shipped inside the
npm package, so any of these works:

```bash
# 1. Straight off a CDN mirror of the npm package
npx shadcn@latest add https://unpkg.com/@teispace/teieditor/r/editor.json

# 2. Your own static host / docs site — copy `r/` into `public/r/`
npx shadcn@latest add https://your-docs-site.com/r/editor.json

# 3. Locally, from a checkout
npx shadcn@latest add ./node_modules/@teispace/teieditor/r/editor.json
```

Cross-item references default to relative paths (`./ui.json`) so a directory of
JSON files is self-consistent wherever it is served from. Building for a fixed
host? Emit absolute URLs instead:

```bash
yarn workspace @teispace/teieditor registry:build --base-url https://your-docs-site.com/r
```

### Registry vs. CLI

Both scaffold identical files. Pick whichever fits:

| | `npx teieditor init/add` | `npx shadcn add <url>` |
|--|--|--|
| Drift detection | Yes — SHA-256 per file, your edits are never clobbered | No |
| `update` command | Yes | No |
| Design tokens | Manual `styles.css` import | Injected via `cssVars` |
| Agent/tooling support | teieditor-specific | Standard shadcn tooling |

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
- Layout (container/item), block cursor, character limit
- Images, mentions, page breaks
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
| `showWordCount` | `boolean` | `true` | Show the word/character status bar below the content |
| `readOnly` | `boolean` | `false` | Read-only mode |
| `className` | `string` | — | Wrapper CSS class |
| `editorClassName` | `string` | — | Editor content area CSS class |
| `config` | `TeiEditorConfigOverrides` | — | Advanced editor config overrides (everything except `extensions` / `editable`, which the `extensions` and `readOnly` props own) |

### `<TeiEditorNotion>` (Notion Mode)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `extensions` | `TeiExtension[]` | `[]` | Additional extensions beyond StarterKit |
| `initialValue` | `string` | — | Initial content |
| `initialFormat` | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'` | Format of initial value |
| `onChange` | `(value: string) => void` | — | Content change callback |
| `format` | `'html' \| 'markdown' \| 'json' \| 'text'` | `'html'` | Output format |
| `placeholder` | `string` | `"Type '/' for commands..."` | Placeholder text |
| `showWordCount` | `boolean` | `false` | Show the word/character status bar (off by default — Notion mode is chrome-free) |
| `readOnly` | `boolean` | `false` | Read-only mode |
| `className` | `string` | — | Wrapper CSS class |
| `editorClassName` | `string` | — | Editor content area CSS class |
| `config` | `TeiEditorConfigOverrides` | — | Advanced editor config overrides (everything except `extensions` / `editable`, which the `extensions` and `readOnly` props own) |

---

## Collaboration & Advanced Lexical Config

`createTeiEditor()` passes three optional keys straight through to
`<LexicalComposer>`, so you are never boxed out of Lexical's own APIs.

### `editorState` — required for Yjs collaboration

Lexical's [collaboration setup](https://lexical.dev/docs/collaboration/react)
requires `editorState: null` on the composer, so the collab plugin (not Lexical)
owns the initial content. Without it Lexical seeds a default empty paragraph
that collides with the Yjs document.

```tsx
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { createTeiEditor, TeiEditorProvider } from '@teispace/teieditor/core';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';

const editor = createTeiEditor({
  extensions: StarterKit,
  editorState: null, // ← the collab document owns initial state
});

<TeiEditorProvider editor={editor}>
  <CollaborationPlugin id="my-doc" providerFactory={createProvider} shouldBootstrap />
  <EditorContent />
</TeiEditorProvider>
```

`editorState` also accepts a serialized JSON string, an `EditorState`, or an
`(editor) => void` updater. Omit it for the default behaviour.

> TeiEditor does not bundle a Yjs extension — you wire the provider yourself.

### `nodes` — override a core node

Extra nodes are appended after every extension-contributed node, and accept
Lexical's [node-replacement](https://lexical.dev/docs/concepts/node-replacement)
form:

```tsx
createTeiEditor({
  extensions: StarterKit,
  nodes: [
    MyTextNode,
    { replace: TextNode, with: (n) => new MyTextNode(n.__text), withKlass: MyTextNode },
  ],
});
```

### `html` — customise HTML import/export

```tsx
createTeiEditor({
  extensions: StarterKit,
  html: {
    import: { span: () => ({ conversion: convertSpan, priority: 1 }) },
    export: new Map([[TextNode, exportText]]),
  },
});
```

### Extension chrome slot

Extension plugins mount **before** your children so their Lexical commands keep
priority over the rich-text plugin. Extensions that render visible chrome (today
just the WordCount status bar) therefore portal into a slot you place yourself:

```tsx
import { TeiEditorProvider, TeiEditorSlot } from '@teispace/teieditor/core';

<TeiEditorProvider editor={editor}>
  <Toolbar />
  <EditorContent />
  <TeiEditorSlot />   {/* ← WordCount's status bar renders here */}
</TeiEditorProvider>
```

No slot mounted means no chrome — a provider never sprouts UI you didn't ask
for. The drop-in `<TeiEditor>` places one for you (`showWordCount`).

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
- `prettier` — For code formatting in code blocks

---

## Next.js & SSR

TeiEditor uses browser APIs (`document`, `window.getSelection`, `matchMedia`, `localStorage`). It must render on the client.

### App Router (recommended)

```tsx
// app/editor/page.tsx
'use client';

import { TeiEditor } from '@teispace/teieditor/react';
import '@teispace/teieditor/styles.css';

export default function EditorPage() {
  return <TeiEditor onChange={(html) => console.log(html)} />;
}
```

For pages that should stay server-rendered, import the editor inside a child client component and keep the server page itself server-only.

### Avoiding hydration warnings

If you render the editor directly in a SSR-tolerant page, wrap it with `next/dynamic` to opt out of SSR entirely:

```tsx
import dynamic from 'next/dynamic';

const TeiEditor = dynamic(
  () => import('@teispace/teieditor/react').then((m) => m.TeiEditor),
  { ssr: false },
);
```

Both patterns work; use whichever fits your page boundary.

### Persisting content

Prefer the JSON format for database round-trips — it's lossless:

```tsx
<TeiEditor
  initialValue={savedJsonString}
  initialFormat="json"
  format="json"
  onChange={async (json) => {
    await fetch('/api/doc', { method: 'PUT', body: json });
  }}
/>
```

HTML is fine for rendering/email output. Markdown is good for git-friendly content but is lossy for some blocks (callouts, layouts, embeds).

---

## Mobile & touch

Floating UI (bubble menu, slash menu, context menu, link editor, code actions) uses the VisualViewport API where available, so positions stay correct when:

- The mobile soft keyboard opens or closes
- The user pinch-zooms
- iOS Safari's address bar collapses

Tap targets on toolbar buttons are 32×32 px by default (Apple's recommended minimum is 44×44 px). If you scaffold the UI you can bump `sizeStyles.icon` in `registry/ui/button.tsx` — e.g. `h-11 w-11 sm:h-8 sm:w-8` to give phones bigger targets while keeping desktop compact.

Drag handles and table cell resizers are pointer-based and may be awkward to reach on touch. For primarily-mobile editors, prefer the toolbar/slash-menu flow.

---

## Troubleshooting

**"Package path './react' is not exported"**
Webpack (especially in older Next.js setups) sometimes misses ESM-only exports. Make sure you're on `@teispace/teieditor` ≥ the version that added the `default` fallback condition in each export (the current one). If you're on an older major and can't upgrade, scaffold the editor instead (`npx teieditor init`) to import from your own `src/`.

**Styles aren't applying**
Two things to check: (1) you imported `@teispace/teieditor/styles.css` once somewhere in your app, (2) Tailwind scans the package's compiled output. The easy fix is to `@import "@teispace/teieditor/tailwind.css";` in your main CSS — it adds the right `@source` directive.

**"window is not defined" during build**
You're rendering the editor from a server component. Either add `'use client'` at the top of the file, or import via `next/dynamic` with `ssr: false` (see Next.js & SSR above).

**KaTeX / math equations aren't rendering**
Math is an optional feature with a peer dep: `npm install katex` and `import 'katex/dist/katex.min.css'` in your app.

**Extensions passed via `extensions` prop conflict with the StarterKit defaults**
They don't — `createTeiEditor` dedups by extension name with last-wins. You can pass `FontFamily.configure({...})` alongside the starter kit and your configured version overrides the default cleanly.

**Tests: `Storage is not defined` / `document is not defined`**
Use the `jsdom` environment: `environment: 'jsdom'` in `vitest.config.ts`. On Node 22+ you may also need a polyfill for `localStorage` — see this package's own `__tests__/setup.ts` for a reference implementation.

---

## Upgrading from 3.0.x

### Behaviour changes

**1. Five keyboard shortcuts now actually fire.**
`Mod+Shift+7` (bullet list), `Mod+Shift+8` (numbered list), `Mod+Shift+9`
(check list), `Mod+Shift+=` and `Mod+Shift+-` (font size) were dead. The matcher
compared `event.key`, which reports the **shifted** character — on a US layout
Shift+7 is `&`, not `7` — so those chords could never match. Matching now falls
back to `event.code` (the physical key) for digits and punctuation.

If you bound your own handler to those chords expecting them to be free, they
are now claimed by the built-in extensions.

Two related fixes: `preventDefault()` now runs only *after* a handler claims the
event (a handler returning `false` used to suppress the browser default anyway,
so the key did nothing at all), and the Mac/Windows modifier is resolved per
call instead of once at module load — a server-evaluated copy previously latched
`Control` forever, breaking ⌘ shortcuts.

**2. The word-count bar renders at the bottom.**
`WordCount` is in `StarterKit` and returns visible chrome, but extension plugins
mounted **before** `children`, so the drop-in `<TeiEditor>` rendered a "0 words"
bar with a top border *above* the toolbar. Extensions that render chrome now
portal into `<TeiEditorSlot />`, which the registry editors place last.

```tsx
<TeiEditor showWordCount={false} />   // opt out
```

Plugin mount order is deliberately unchanged — reordering it would have shifted
Lexical command priority relative to `RichTextPlugin`.

**3. `config` can no longer replace `extensions` or `editable`.**
The prop is now `TeiEditorConfigOverrides = Omit<Partial<TeiEditorConfig>, 'extensions' | 'editable'>`,
and the spread order was fixed so explicit props win even for JS callers.
Previously `config={{ extensions: [X] }}` silently discarded the entire starter
kit *and* `readOnly`. To customise extensions, use the headless
`createTeiEditor()` path.

**4. Initial content is no longer undoable.**
`InitialValuePlugin` now writes seeded content under Lexical's
`HISTORY_MERGE_TAG`, so Ctrl+Z can't empty the document. Because Lexical's
`OnChangePlugin` ignores history-merge changes by default, `OnChangePlugin` now
exposes `ignoreHistoryMergeTagChange`, defaulted to `false` to preserve the
existing `onChange` contract.

### Packaging

- **`engines` lowered to `>=20.9.0`** (was `>=24`). The package targets es2020
  and uses only `node:crypto`/`fs`/`path`/`url`, so `>=24` excluded Node 20/22
  LTS for no reason.
- **`sideEffects` is now `["*.css"]`** instead of `false`, which had permitted
  bundlers to drop `import '@teispace/teieditor/styles.css'` — a bare CSS import
  has no bindings, exactly what that flag licenses eliding.
- **Lexical floor.** Built and tested against **0.49**. Note 0.49 made
  `LexicalCommand<T>` invariant; if you register a handler against
  `PASTE_COMMAND`, type it `PasteCommandType` (not `ClipboardEvent`) and narrow.

### New

The [shadcn registry](#shadcn-registry), `editorState`/node-replacement/`html`
passthrough for [collaboration](#collaboration--advanced-lexical-config), and
`<TeiEditorSlot />` for placing extension chrome.

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
