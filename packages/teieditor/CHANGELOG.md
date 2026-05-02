# Changelog

## [1.5.4](https://github.com/teispace/npm-packages/compare/teieditor-v1.5.3...teieditor-v1.5.4) (2026-05-02)


### Miscellaneous Chores

* update react and react-dom dependencies to version ^19.2.5 ([9c119bf](https://github.com/teispace/npm-packages/commit/9c119bfd1444eff3761670e13f36c60fa9d6006f))

## [1.5.3](https://github.com/teispace/npm-packages/compare/teieditor-v1.5.2...teieditor-v1.5.3) (2026-05-02)


### Miscellaneous Chores

* update package versions and dependencies ([e4cf6a6](https://github.com/teispace/npm-packages/commit/e4cf6a65d6a2c5d1810b3e307f9a1e20eea126b3))

## [1.5.2](https://github.com/teispace/npm-packages/compare/teieditor-v1.5.1...teieditor-v1.5.2) (2026-04-26)


### Miscellaneous Chores

* **deps:** bump biome, commitlint, ora, vitest, types, tailwind ([245f464](https://github.com/teispace/npm-packages/commit/245f464ddca8163e549042ae3cfcab17aa09a7ed))

## [1.5.1](https://github.com/teispace/npm-packages/compare/teieditor-v1.5.0...teieditor-v1.5.1) (2026-04-24)


### Bug Fixes

* **teieditor:** make all inserts work without a live selection ([f472a59](https://github.com/teispace/npm-packages/commit/f472a5957fea67fc4104920c759e217713e1092a))
* **teieditor:** restore editor focus on inserts, checklist rendering, floating UI polish ([ef13390](https://github.com/teispace/npm-packages/commit/ef13390af3b93d6a0f1c192bc6b3f7a040cfafb6))

## [1.5.0](https://github.com/teispace/npm-packages/compare/teieditor-v1.4.0...teieditor-v1.5.0) (2026-04-23)


### Features

* **teieditor:** drop-in /react export, CLI overhaul, feature-parity pass ([adb3ce9](https://github.com/teispace/npm-packages/commit/adb3ce97129f6b284002a39b1981634802b11c3b))


### Bug Fixes

* **teieditor:** alias self-refs to source in vitest config ([fae9251](https://github.com/teispace/npm-packages/commit/fae925150464b6a5a63bc2e123bd9ecb1030a3e8))
* **teieditor:** clean up imports and improve formatting in context-menu, table-menu, insert-dropdown, and button components ([84a548c](https://github.com/teispace/npm-packages/commit/84a548cc99deec509b7c9221d15e7c33f21a95d4))

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
