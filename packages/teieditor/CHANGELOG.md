# Changelog

## [1.4.0](https://github.com/teispace/npm-packages/compare/teieditor-v1.3.0...teieditor-v1.4.0) (2026-04-10)


### Features

* **teieditor:** refactor CLI test to use TypeScript and update dependencies ([5167836](https://github.com/teispace/npm-packages/commit/5167836b9cf72c02972d96337e11700abf55f01b))

## [1.3.0](https://github.com/teispace/npm-packages/compare/teieditor-v1.2.0...teieditor-v1.3.0) (2026-04-10)


### Features

* add various plugins for enhanced editor functionality ([0f127ba](https://github.com/teispace/npm-packages/commit/0f127ba88a4b632c16d891e852eaf70301040058))

## [1.2.0](https://github.com/teispace/npm-packages/compare/teieditor-v1.1.0...teieditor-v1.2.0) (2026-04-10)


### Features

* **teieditor:** complete UI rewrite with 46 extensions and 3 editor modes ([79cd4d6](https://github.com/teispace/npm-packages/commit/79cd4d626175cd96bf2a1e09c0da749c9968c52a))

## [1.1.0](https://github.com/teispace/npm-packages/compare/teieditor-v1.0.0...teieditor-v1.1.0) (2026-04-10)


### Features

* add toolbar component with formatting options and theme support ([113ad9e](https://github.com/teispace/npm-packages/commit/113ad9e729e6e9e815eddadd3dce563ea67b117d))

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
