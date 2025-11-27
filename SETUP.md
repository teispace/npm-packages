# CI/CD & Release Setup - Quick Reference

## 🚀 What's Been Set Up

### GitHub Workflows

- ✅ **CI Pipeline** - Runs on all PRs and pushes
- ✅ **Release Please** - Automated releases on main
- ✅ **Alpha Publishing** - Auto-publish to npm@alpha
- ✅ **Beta Publishing** - Auto-publish to npm@beta

### Release Configuration

- ✅ Release Please config for monorepo
- ✅ npm authentication setup
- ✅ Version management automation
- ✅ Changelog generation

### Documentation

- ✅ CONTRIBUTING.md - Full contribution guide
- ✅ RELEASING.md - Complete release guide

## 📋 Required GitHub Setup

### 1. Add NPM_TOKEN Secret

```bash
# Generate npm automation token
npm login
npm token create --type=automation
```

Then add to GitHub:

1. Go to: `Settings` → `Secrets and variables` → `Actions`
2. Click: `New repository secret`
3. Name: `NPM_TOKEN`
4. Value: Paste your token

### 2. Protect Branches

Configure branch protection for:

- `main`: Require PR reviews, passing CI
- `develop`: Require passing CI
- `alpha`: Optional protection
- `beta`: Optional protection

### 3. Create Branches

```bash
# Create alpha and beta branches
git checkout -b alpha
git push origin alpha

git checkout -b beta
git push origin beta

# Create develop if not exists
git checkout -b develop
git push origin develop
```

## 🎯 Quick Start Guide

### For New Features

```bash
# 1. Create feature branch from develop
git checkout develop
git pull
git checkout -b feat/my-feature

# 2. Make changes and commit
git add .
git commit -m "feat: add my feature"

# 3. Push and create PR to develop
git push origin feat/my-feature
```

### For Alpha Release

```bash
# Push to alpha branch
git checkout alpha
git merge develop
git push origin alpha

# ✨ Auto-publishes to npm with @alpha tag
```

### For Beta Release

```bash
# Push to beta branch
git checkout beta
git merge develop  # or merge alpha if promoting
git push origin beta

# ✨ Auto-publishes to npm with @beta tag
```

### For Stable Release

```bash
# 1. Create PR: develop → main
# 2. Release Please will create/update Release PR
# 3. Review and merge Release PR
# ✨ Auto-publishes to npm with @latest tag
```

## 📦 Version Tags

| Channel | npm Command                        | Version Example        |
| ------- | ---------------------------------- | ---------------------- |
| Stable  | `npm i @teispace/next-maker`       | `1.0.0`                |
| Beta    | `npm i @teispace/next-maker@beta`  | `1.0.0-beta.20241127`  |
| Alpha   | `npm i @teispace/next-maker@alpha` | `1.0.0-alpha.20241127` |

## 🔍 CI/CD Checks

Every PR runs:

- ✅ Linting (ESLint + Prettier)
- ✅ Type checking (TypeScript)
- ✅ Tests (Jest)
- ✅ Build verification
- ✅ Commit message validation

## 📚 Full Documentation

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Complete contribution guide
- **[RELEASING.md](./RELEASING.md)** - Detailed release instructions

## 🆘 Common Issues

**Release Please PR not created?**

- Ensure commits use conventional format
- Check `.release-please-manifest.json` exists
- Verify branch protection allows Release Please bot

**npm publish fails?**

- Check NPM_TOKEN is valid
- Verify package name is available
- Ensure version doesn't already exist

**CI fails?**

- Run `yarn validate` locally first
- Fix linting/type errors
- Ensure all tests pass

## 🎉 You're All Set!

The setup is complete. Read the full documentation and start contributing!
