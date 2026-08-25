# Changelog

## [0.0.6](https://github.com/teispace/npm-packages/compare/env-v1.0.0...env-v0.0.6) (2026-08-25)


### Miscellaneous Chores

* release main ([#122](https://github.com/teispace/npm-packages/issues/122)) ([3cca039](https://github.com/teispace/npm-packages/commit/3cca039de47832c18000d3a67ff39a9566753dbe))
* **teiqr:** pin the next release to 0.0.6 ([863e200](https://github.com/teispace/npm-packages/commit/863e200eedc422fd8215b1da726b09f556368949))
* undo an accidental version reset across every package ([1254fcc](https://github.com/teispace/npm-packages/commit/1254fccbc3bc051df18fa0e1abf4b411d5871056))

## [1.0.0](https://github.com/teispace/npm-packages/compare/env-v0.2.4...env-v1.0.0) (2026-08-21)


### ⚠ BREAKING CHANGES

* **env:** configurations that declared a variable in two groups, or a server variable carrying the client prefix, are now rejected at define time. `emptyStringAsUndefined: false` now behaves as documented, `e.string()` rejects the empty string (use `min: 0` to opt out), and the next/vite presets default `runtimeEnvStrict` to on. `sideEffects` is now an allow-list rather than `false`, which previously permitted bundlers to delete `import '@teispace/env/config'` outright and silently skip the .env cascade. `engines.node` lowered to >=20.9.0.

### Features

* **env:** harden validation and add cross-field, dev and strict ergonomics ([bdd57df](https://github.com/teispace/npm-packages/commit/bdd57dfe26cc86976e2312c9c6237987a0a0c675))

## [0.2.4](https://github.com/teispace/npm-packages/compare/env-v0.2.3...env-v0.2.4) (2026-06-28)


### Miscellaneous Chores

* dependency upgrades + next-maker template sync ([#107](https://github.com/teispace/npm-packages/issues/107)) ([34c8aa4](https://github.com/teispace/npm-packages/commit/34c8aa4fb87f6e1d112035492bdeb62538a9b435))

## [0.2.3](https://github.com/teispace/npm-packages/compare/env-v0.2.2...env-v0.2.3) (2026-06-20)


### Bug Fixes

* **env:** ship dual ESM + CJS so config loaders can require it ([21714c5](https://github.com/teispace/npm-packages/commit/21714c5f6afe68415c6f9f12a4429dae30dfdada))

## [0.2.2](https://github.com/teispace/npm-packages/compare/env-v0.2.1...env-v0.2.2) (2026-06-20)


### Bug Fixes

* **env:** harden coercers, validate structured JSON, surface descriptions ([06915d8](https://github.com/teispace/npm-packages/commit/06915d86313f41e7c2a4a0069e3b39601254c755))

## [0.2.1](https://github.com/teispace/npm-packages/compare/env-v0.2.0...env-v0.2.1) (2026-06-07)


### Miscellaneous Chores

* **deps:** bump dependencies to latest across all packages ([#101](https://github.com/teispace/npm-packages/issues/101)) ([bf53dc4](https://github.com/teispace/npm-packages/commit/bf53dc44df4c0bdedec6d1721a2ec6294af4168d))

## [0.2.0](https://github.com/teispace/npm-packages/compare/env-v0.1.0...env-v0.2.0) (2026-05-31)


### Features

* **env:** add @teispace/env — type-safe universal environment variables ([#96](https://github.com/teispace/npm-packages/issues/96)) ([30518a5](https://github.com/teispace/npm-packages/commit/30518a50cce3c06f4234e7a1bf7c5ee878c598e4))
