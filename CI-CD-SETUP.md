# CI/CD & Release Setup

## GitHub Actions Workflows

### CI (`.github/workflows/ci.yml`)

- **Runs on:** pull requests targeting `main`, and pushes to `main`.
- **Concurrency:** in-progress runs for the same ref are cancelled.
- **Jobs:**
  - **Code Quality** — `yarn lint` (Biome lint + format check) and `yarn type-check` (TypeScript).
  - **Test** — `yarn test:cov` (Vitest with coverage); per-package `lcov` is uploaded to Codecov.
  - **Build** — `yarn build` (publishable packages only) and uploads the `dist/` artifacts.
- **Runtime:** Node version from `.nvmrc` (24), Yarn 4 via Corepack, Ubuntu latest. 10-minute timeout per job.

### Release Please (`.github/workflows/release-please.yml`)

- **Runs on:** push to `main`.
- **Behavior:**
  - Maintains a **release PR** that bumps versions and regenerates each package's `CHANGELOG.md` from Conventional Commits.
  - On merge of that PR, tags the releases and the **publish** job pushes each changed package to npm with **provenance** (`--provenance --access public`) under `@latest`.
  - The publish job is **idempotent**: versions already on the registry are skipped, so re-runs are safe. Each package is rebuilt from a clean `dist` via its `prepublishOnly` hook immediately before packing.
- **Requires:** the `NPM_TOKEN` secret and `id-token: write` permission (already configured).

There is a single stable channel (`@latest`); the repo is trunk-based with no `develop`/`alpha`/`beta` branches.

## Release Configuration

- **`release-please-config.json`** — `release-type: node`, monorepo with component-based tags (`<pkg>-vX.Y.Z`), changelog sections for every commit type.
- **`.release-please-manifest.json`** — current version of each package, updated automatically by release-please.
- **`.npmrc`** — registry/auth configuration.

## Commit → Version Mapping

| Commit type | Version bump | Example |
| ----------- | ------------ | ------- |
| `fix:` | PATCH | 1.0.0 → 1.0.1 |
| `feat:` | MINOR | 1.0.0 → 1.1.0 |
| `feat!:` / `BREAKING CHANGE:` | MAJOR | 1.0.0 → 2.0.0 |

## Required Manual Setup

1. **Add the `NPM_TOKEN` secret** (`Settings → Secrets and variables → Actions`):
   ```bash
   npm login
   npm token create --type=automation
   ```
2. **Protect `main`** — require PR reviews and passing CI; allow the release-please bot to open its PR.

## Local Validation

```bash
yarn validate   # lint + type-check + test + build (also run by the pre-push hook)
```

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Release Please](https://github.com/googleapis/release-please)
- [Semantic Versioning](https://semver.org/)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements)
