# Changelog

## [1.0.0](https://github.com/teispace/npm-packages/compare/teieditor-v0.1.121...teieditor-v1.0.0) (2026-04-10)

### Features

* **core:** Extension-based architecture with `createTeiEditor()`, `BaseExtension`, `TeiEditorProvider`
* **extensions:** 37 built-in extensions covering text formatting, blocks, lists, media, Notion-like UX, and advanced features
* **serialization:** Import/export in HTML, Markdown, JSON, and plain text with `serialize()` / `deserialize()` utilities
* **slash-commands:** Type `/` for a command palette with 17 built-in commands, fully extensible
* **bubble-menu:** Floating toolbar on text selection for quick formatting
* **drag-handle:** Block-level drag & drop reordering
* **image:** Upload, paste, drag & drop with configurable upload handler
* **table:** Full table support with insert/delete rows, columns, headers
* **embed:** YouTube (iframe), Twitter, and generic URL embeds
* **callout:** 5 variant alert blocks (info, warning, error, success, note)
* **toggle:** Collapsible content blocks
* **mention:** `@` trigger with async search and custom `MentionNode`
* **emoji:** `:` trigger with fuzzy search and 40+ built-in emojis
* **markdown:** Live shortcuts (`#` heading, `**bold**`, etc.) and import/export
* **find-replace:** `Ctrl+F` find & replace with match count
* **word-count:** Live word and character count
* **toc:** Auto-generated table of contents from headings with `useToc()` hook
* **math:** Block and inline math expressions with `MathNode`
* **cli:** `npx teieditor init/add/list` using commander, ora, picocolors
* **themes:** Tailwind CSS default theme with `tei-` prefixed classes and dark mode
* **tree-shaking:** 45 subpath exports, `sideEffects: false`, ESM-only output via tsup

### Breaking Changes

* Complete rewrite from scratch — not compatible with 0.1.x versions
* shadcn-style architecture: UI components are now copied to your project via CLI
* All Lexical packages are now peer dependencies (not bundled)
