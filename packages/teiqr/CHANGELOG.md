# Changelog

## [0.0.9](https://github.com/teispace/npm-packages/compare/teiqr-v0.0.8...teiqr-v0.0.9) (2026-08-25)


### Performance Improvements

* **teiqr:** skip zero rows and DC-only blocks in the JPEG inverse DCT ([#128](https://github.com/teispace/npm-packages/issues/128)) ([ecced58](https://github.com/teispace/npm-packages/commit/ecced58029bf017921c8cba9586fcebb44d3fd56))

## [0.0.8](https://github.com/teispace/npm-packages/compare/teiqr-v0.0.7...teiqr-v0.0.8) (2026-08-25)


### Features

* **teiqr:** decode progressive JPEG ([#126](https://github.com/teispace/npm-packages/issues/126)) ([3620995](https://github.com/teispace/npm-packages/commit/3620995ee9bef5d4d39cd31631647d3cec873c57))

## [0.0.7](https://github.com/teispace/npm-packages/compare/teiqr-v0.0.6...teiqr-v0.0.7) (2026-08-25)


### Features

* **teiqr:** decode baseline JPEG, opt-in via teiqr/jpeg ([#124](https://github.com/teispace/npm-packages/issues/124)) ([d3ff58a](https://github.com/teispace/npm-packages/commit/d3ff58a02666e2998db24edf8b199c73b8def26f))

## [0.0.6](https://github.com/teispace/npm-packages/compare/teiqr-v0.0.5...teiqr-v0.0.6) (2026-08-25)


### ⚠ BREAKING CHANGES

* **teiqr:** decode the whole PNG colour model, not just what we emit ([#121](https://github.com/teispace/npm-packages/issues/121))

### Features

* **teiqr:** decode the whole PNG colour model, not just what we emit ([#121](https://github.com/teispace/npm-packages/issues/121)) ([daa4f8d](https://github.com/teispace/npm-packages/commit/daa4f8df90fbb279526a8279fb5c26570d93bbb4))


### Miscellaneous Chores

* **teiqr:** pin the next release to 0.0.6 ([863e200](https://github.com/teispace/npm-packages/commit/863e200eedc422fd8215b1da726b09f556368949))

## [0.0.5](https://github.com/teispace/npm-packages/compare/teiqr-v0.0.4...teiqr-v0.0.5) (2026-08-25)


### Bug Fixes

* **teiqr:** repair clone field merging and backslash escaping, halve PNG cost ([#119](https://github.com/teispace/npm-packages/issues/119)) ([8981771](https://github.com/teispace/npm-packages/commit/8981771b226188c61e2db2f148738820f800f9f5))

## [0.0.4](https://github.com/teispace/npm-packages/compare/teiqr-v0.0.3...teiqr-v0.0.4) (2026-08-25)


### ⚠ BREAKING CHANGES

* **teiqr:** binarize() takes a fourth options argument and now thresholds locally by default. Pass { global: true } for the previous behaviour.

### Bug Fixes

* **teiqr:** stop decodePng hanging on malformed input, threshold locally ([#117](https://github.com/teispace/npm-packages/issues/117)) ([8c849d7](https://github.com/teispace/npm-packages/commit/8c849d75a9cee8d0f7fa7f41eba1b9faab40d019))

## [0.0.3](https://github.com/teispace/npm-packages/compare/teiqr-v0.0.2...teiqr-v0.0.3) (2026-08-25)


### Bug Fixes

* **teiqr:** scan all three symbologies from pixels, off-axis included ([#116](https://github.com/teispace/npm-packages/issues/116)) ([16ac2b2](https://github.com/teispace/npm-packages/commit/16ac2b213f0067fd48877c9a656b8fef414dea79))
* **teiqr:** unify segmentation across QR, Micro QR and rMQR ([#114](https://github.com/teispace/npm-packages/issues/114)) ([6b8ed34](https://github.com/teispace/npm-packages/commit/6b8ed346cf740a7a7c524149488fecc842c792fd))

## [0.0.2](https://github.com/teispace/npm-packages/compare/teiqr-v0.0.1...teiqr-v0.0.2) (2026-08-25)


### Documentation

* **teiqr:** make the README about teiqr, not about other packages ([e07b4de](https://github.com/teispace/npm-packages/commit/e07b4de8f9b427bc9fb4ff296a40e18f76560e5a))

## 0.0.1 (2026-08-25)


### Features

* **teiqr:** add a command-line interface ([8d8ec21](https://github.com/teispace/npm-packages/commit/8d8ec21a9b3e33bf4a119c68387098bcd6bab356))
* **teiqr:** add a complete, zero-dependency QR toolkit ([61637da](https://github.com/teispace/npm-packages/commit/61637da2da37a20201c328643f19f0a2f5c0d967))
* **teiqr:** add Micro QR encoding, verified against an independent implementation ([14d6dcf](https://github.com/teispace/npm-packages/commit/14d6dcf83f63df58de5f1fa84e577dc099ae2e35))
* **teiqr:** add PDF, EPS, ZIP and CSV batch export ([bfe74c9](https://github.com/teispace/npm-packages/commit/bfe74c91e122e86b6383d1c5dca747e049ee64d8))
* **teiqr:** add React components and a camera scanner hook ([94336ba](https://github.com/teispace/npm-packages/commit/94336baeda0d1ac04407b072b1100737d884f0ca))
* **teiqr:** add rMQR encoding for rectangular symbols ([2e38ae4](https://github.com/teispace/npm-packages/commit/2e38ae49e8640a40078a93c6243cb6920fef7bde))
* **teiqr:** add the teiqr QR toolkit ([e62d172](https://github.com/teispace/npm-packages/commit/e62d172595d8787d9d05184038d4131ba2be380b))
* **teiqr:** decode Micro QR and rMQR symbols ([b575633](https://github.com/teispace/npm-packages/commit/b5756333ed97dc9e773d4e901743dc36d427539a))


### Bug Fixes

* **teiqr:** keep the CLI split test cheap and re-baseline coverage floors ([c32e652](https://github.com/teispace/npm-packages/commit/c32e6527bb28e2b086ea2de63a215051dfa28999))


### Documentation

* **teiqr:** state the release status in the README ([f005a6a](https://github.com/teispace/npm-packages/commit/f005a6af5a5ad1d5312607bbcd6c0898fc0cfd7f))
