# Changelog

## [1.0.0](https://github.com/teispace/npm-packages/compare/next-maker-v0.4.0...next-maker-v1.0.0) (2025-12-03)


### ⚠ BREAKING CHANGES

* Major CLI redesign with new setup command and improved feature management

### Features

* add post-initialization setup command and modernize CLI architecture ([ae6a5d6](https://github.com/teispace/npm-packages/commit/ae6a5d657fafe3973ac83c67628721809ebb8080))

## [0.4.0](https://github.com/teispace/npm-packages/compare/next-maker-v0.3.0...next-maker-v0.4.0) (2025-12-02)


### Features

* **next-maker:** add API endpoint registration for services and features ([8db4f36](https://github.com/teispace/npm-packages/commit/8db4f36a6037a63129b4a94c7905200668715ebc))

## [0.3.0](https://github.com/teispace/npm-packages/compare/next-maker-v0.2.2...next-maker-v0.3.0) (2025-12-02)


### Features

* **next-maker:** add custom path and fix feature generation ([33c2ca0](https://github.com/teispace/npm-packages/commit/33c2ca09b592fa4a1e6e0c6c606b63c5db3d451b))
* **next-maker:** implement feature generation command ([0127837](https://github.com/teispace/npm-packages/commit/0127837d97e849dfc7fe875c167604d0997d7093))
* **next-maker:** implement slice and service generation commands ([59a12e4](https://github.com/teispace/npm-packages/commit/59a12e4b80521ee5fbabb74a09508bd085cc52aa))
* **next-maker:** optimize prompts and add .env copy feature ([e2ecefe](https://github.com/teispace/npm-packages/commit/e2ecefe7139c335adf34131dee3cebe7ba9eebb2))


### Bug Fixes

* **next-maker:** add Counter component to page.tsx when Redux enabled and cleanup i18n/axios types ([87bc69d](https://github.com/teispace/npm-packages/commit/87bc69d96824353cfdfce1af9b6bcf1bda789ff6))
* **next-maker:** correct script execution for yarn/pnpm/bun ([e633a31](https://github.com/teispace/npm-packages/commit/e633a31237c5ac9450cb35da6dd6edc10e5f1ea5))
* **next-maker:** remove dark mode styles when dark theme is not selected ([3ad53e5](https://github.com/teispace/npm-packages/commit/3ad53e53de8faf04f7d769051908e7e10f391581))

## [0.2.2](https://github.com/teispace/npm-packages/compare/next-maker-v0.2.1...next-maker-v0.2.2) (2025-12-02)


### Miscellaneous Chores

* **cleanup:** remove unused client-utils and app-apis during cleanup process ([866baf4](https://github.com/teispace/npm-packages/commit/866baf41c32369bc7ca65dbe44fd7db0034c091f))
* **next-maker:** release alpha ([afbcfca](https://github.com/teispace/npm-packages/commit/afbcfca48fde7c19162c9aec8dd4aed0c4e8075c))
* **release:** merge alpha into beta ([d52f1f2](https://github.com/teispace/npm-packages/commit/d52f1f210745859d87701a42d629af9bc68d9e92))

## [0.2.1](https://github.com/teispace/npm-packages/compare/next-maker-v0.2.0...next-maker-v0.2.1) (2025-12-01)


### Miscellaneous Chores

* **next-maker:** add init services, update prompts, and fix release output ([9d6ff31](https://github.com/teispace/npm-packages/commit/9d6ff3130e9101febe135f597e8889c59f301c05))
* **release:** merge alpha into beta ([ca76516](https://github.com/teispace/npm-packages/commit/ca765167a31dead9dad6af387cb55f34a723ac15))
* **release:** merge beta into main ([1f86bc1](https://github.com/teispace/npm-packages/commit/1f86bc1954dae1ed4536db0b9ca6f9adbc94771f))
* **sync:** merge origin/main into main before push ([8e329a2](https://github.com/teispace/npm-packages/commit/8e329a2df1f88e36ed03cab5e6d59ac788b0994a))


### Continuous Integration

* **release:** use heredoc for published_packages output to avoid GITHUB_OUTPUT parse errors ([befde1b](https://github.com/teispace/npm-packages/commit/befde1be30d00ac4cd56d04d493e362902df54a2))

## [0.2.0](https://github.com/teispace/npm-packages/compare/next-maker-v0.1.1...next-maker-v0.2.0) (2025-12-01)


### Features

* initial monorepo setup with multi-package release workflows ([70c369b](https://github.com/teispace/npm-packages/commit/70c369b6694fedd68485167f8f5c252bb59d2354))


### Miscellaneous Chores

* **next-maker:** remove test subproject reference ([fe549f9](https://github.com/teispace/npm-packages/commit/fe549f956fa21ce9b859c2a94e5dab1565405949))
* **next-maker:** revert typing changes and allow any in eslint ([315e2f3](https://github.com/teispace/npm-packages/commit/315e2f3e7bc2f80cf0816d3c71432c1cfbd73798))
* **release:** merge alpha into beta ([cd53b76](https://github.com/teispace/npm-packages/commit/cd53b76fa53f97af31e5e88b733dd81743bda94c))

## [0.1.1](https://github.com/teispace/npm-packages/compare/next-maker-v0.1.0...next-maker-v0.1.1) (2025-11-27)


### Miscellaneous Chores

* reinitialize repository ([8d206b1](https://github.com/teispace/npm-packages/commit/8d206b1cc54006068f7848ac97b99df069dcd36b))

## [0.1.0](https://github.com/teispace/npm-packages/compare/next-maker-v0.0.1...next-maker-v0.1.0) (2025-11-27)


### Features

* rename to @teispace/next-maker and update workflows for multi-package support ([6202c21](https://github.com/teispace/npm-packages/commit/6202c21bb2e60f43889b8b0d4880dc0fbf70ce9c))


### Miscellaneous Chores

* **next-maker:** promote to main (stable) ([9213dd0](https://github.com/teispace/npm-packages/commit/9213dd03c25fbd8ea936a9642c267b4562692025))
* **next-maker:** rename create-next-app -&gt; next-maker; update docs, tsconfig, and VSCode settings ([3abf499](https://github.com/teispace/npm-packages/commit/3abf499ede2e67358a9dffa4c365dc7d167a6a44))
