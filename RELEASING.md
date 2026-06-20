# Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please).
This repo is **trunk-based**: everything ships from `main`, on a single stable
channel (`@latest`). There are no `alpha`/`beta`/`develop` branches.

## How it works

1. **Land Conventional-Commits PRs on `main`.** The commit type drives the
   version bump (see the table below). Scope commits with the package name where
   it helps, e.g. `fix(env): …`, `feat(next-themes): …`.

2. **release-please maintains a release PR.** On every push to `main`, the
   `release-please` job opens or updates a PR titled `chore: release main`. That
   PR bumps the version of each package that has unreleased changes, updates its
   `CHANGELOG.md`, and updates `.release-please-manifest.json`. Packages with no
   relevant commits are not bumped (independent per-package versioning).

3. **Merge the release PR to publish.** Merging it:
   - creates the git tags (`<package>-vX.Y.Z`),
   - runs the **publish** job, which builds each released package from a clean
     `dist` (via `prepublishOnly`) and runs `npm publish --provenance --access public`,
   - posts a commit comment linking the published versions on npm.

You never bump versions or edit changelogs by hand — release-please owns both.

## Version bumps (SemVer)

| Commit type | Bump | Example |
| ----------- | ---- | ------- |
| `fix:` | PATCH | 1.2.3 → 1.2.4 |
| `feat:` | MINOR | 1.2.3 → 1.3.0 |
| `feat!:` / `fix!:` / `BREAKING CHANGE:` footer | MAJOR | 1.2.3 → 2.0.0 |
| `docs:` / `chore:` / `refactor:` / `test:` / `ci:` / `build:` / `perf:` | no bump (shown in changelog) | — |

Pre-1.0 packages (e.g. `@teispace/env`) follow release-please's 0.x rules: a
breaking change bumps the minor, a feature/fix bumps the patch.

## Prerequisites (one-time)

- `NPM_TOKEN` repository secret (an npm **automation** token).
- The publish job's `id-token: write` permission (already set) for provenance.
- Branch protection on `main` that still lets the release-please bot open its PR.

## Publishing safety

- **Idempotent:** the publish job skips any version already on the registry, so a
  re-run after a partial failure only publishes what's missing.
- **Clean build per package:** each package's `prepublishOnly` runs
  `yarn clean && yarn build`, so the tarball always matches the current source.
- **Provenance:** every package is published with npm provenance.

## Manual publish (rare / break-glass)

Prefer the automated flow. If you must publish by hand:

```bash
yarn install
yarn workspace @teispace/<pkg> run build   # prepublishOnly also runs on publish
cd packages/<pkg>
npm publish --provenance --access public
```

Make sure the version in `package.json` is not already on the registry.

## Troubleshooting

- **No release PR appeared** — confirm commits use the Conventional Commits
  format and that `.release-please-manifest.json` exists and lists the package.
- **Publish failed** — check `NPM_TOKEN` validity; the job is idempotent, so a
  re-run is safe.
- **Wrong version bump** — it's derived from commit types since the last release;
  fix by adjusting commit messages on subsequent PRs (or amend before merge).
