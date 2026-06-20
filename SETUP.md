# CI/CD & Release Setup — Quick Reference

## 🚀 What's Set Up

### GitHub Workflows

- ✅ **CI** (`ci.yml`) — lint, type-check, test (with coverage), and build on every PR and on push to `main`.
- ✅ **Release Please** (`release-please.yml`) — maintains a release PR on `main`; merging it tags releases and publishes the changed packages to npm (with provenance) under `@latest`.

### Release Configuration

- ✅ release-please config for the monorepo (`release-please-config.json` + `.release-please-manifest.json`)
- ✅ npm authentication + provenance
- ✅ Automated version management and changelog generation

## 📋 Required GitHub Setup

### 1. Add the `NPM_TOKEN` secret

```bash
# Generate an npm automation token
npm login
npm token create --type=automation
```

Then add it to GitHub:

1. `Settings` → `Secrets and variables` → `Actions`
2. `New repository secret`
3. Name: `NPM_TOKEN`, Value: your token

The publish job also needs `id-token: write` (already set in the workflow) for npm provenance.

### 2. Protect `main`

- Require PR reviews and passing CI before merge.
- Allow the release-please bot to open its release PR.

This repo is trunk-based — there are no `develop`/`alpha`/`beta` branches to create.

## 🎯 Quick Start

### Make a change

```bash
# 1. Branch off main
git checkout main && git pull
git checkout -b feat/my-feature

# 2. Commit using Conventional Commits (or `yarn commit` for a guided prompt)
git add .
git commit -m "feat(env): add my feature"

# 3. Push and open a PR into main
git push -u origin feat/my-feature
```

### Cut a release

1. Merge your PR(s) into `main`.
2. release-please opens/updates a **release PR** with the version bumps + changelogs.
3. Review and merge the release PR → the changed packages publish to npm under `@latest`.

## 📦 Install

```bash
npm i @teispace/env
npm i @teispace/next-themes
npm i @teispace/teieditor
npm i -g @teispace/next-maker   # or npx @teispace/next-maker
```

## 🔍 CI Checks

Every PR (and push to `main`) runs:

- ✅ Lint + format check (**Biome**)
- ✅ Type checking (**TypeScript**)
- ✅ Tests with coverage (**Vitest** → Codecov)
- ✅ Build verification
- ✅ Commit message validation (commitlint)

## 📚 Full Documentation

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — contribution guide
- **[RELEASING.md](./RELEASING.md)** — release process
- **[CI-CD-SETUP.md](./CI-CD-SETUP.md)** — CI/CD configuration details

## 🆘 Common Issues

**Release PR not created?** Ensure commits use the Conventional Commits format and that `.release-please-manifest.json` exists.

**npm publish fails?** Check `NPM_TOKEN` is valid and the version doesn't already exist (the publish job skips versions already on the registry, so re-runs are safe).

**CI fails?** Run `yarn validate` locally first to reproduce.
