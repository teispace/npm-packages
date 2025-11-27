# Multi-Package Release Workflow

This repository uses an automated release workflow that handles multiple packages dynamically across three release channels: **stable**, **beta**, and **alpha**. When you add new packages, no workflow changes are needed!

## Release Channels

### 🟢 Stable Releases (main branch)

- Production-ready releases
- Semantic versioning (e.g., `1.2.3`)
- Uses Release Please for changelog generation
- npm tag: `latest`

### 🟡 Beta Releases (beta branch)

- Pre-release testing versions
- Version format: `1.2.3-beta.YYYYMMDDHHMMSS`
- Only changed packages are published
- npm tag: `beta`

### 🔴 Alpha Releases (alpha branch)

- Cutting-edge development versions
- Version format: `1.2.3-alpha.YYYYMMDDHHMMSS`
- Only changed packages are published
- npm tag: `alpha`

## How It Works

### 1. **Release Please Configuration (Stable)**

The stable workflow uses Google's Release Please action with a manifest-based setup:

- **`release-please-config.json`**: Defines release settings and changelog sections
- **`.release-please-manifest.json`**: Tracks current versions of all packages

### 2. **Dynamic Package Detection (All Channels)**

All workflows automatically detect packages in the `packages/` directory and only process packages with changes:

- **Stable**: Release Please analyzes git history and creates release PRs
- **Beta/Alpha**: Compares changes against main branch using git diff
- Only packages with actual changes are versioned and published
- Private packages are automatically skipped

### 3. **Selective Publishing**

Each workflow publishes only the packages that have changes:

- **Stable**: Only packages in merged release PRs are published
- **Beta/Alpha**: Only packages with file changes compared to main
- Each package is published independently with its own version
- Appropriate npm dist-tags are applied

## Adding a New Package

To add a new package to the monorepo:

1. **Create the package directory** under `packages/`:

   ```bash
   mkdir -p packages/my-new-package
   ```

2. **Add a `package.json`** with required fields:

   ```json
   {
     "name": "@teispace/my-new-package",
     "version": "0.0.0",
     "description": "My new package",
     "publishConfig": {
       "access": "public"
     }
   }
   ```

3. **Register in manifests**:

   Add to `release-please-config.json`:

   ```json
   {
     "packages": {
       "packages/my-new-package": {
         "component": "my-new-package",
         "release-type": "node"
       }
     }
   }
   ```

   Add to `.release-please-manifest.json`:

   ```json
   {
     "packages/my-new-package": "0.0.0"
   }
   ```

4. **Commit with conventional commit message**:
   ```bash
   git add .
   git commit -m "feat(my-new-package): add new package"
   git push origin main
   ```

That's it! The workflow will:

- Create a release PR for your new package
- When merged, publish only that package to npm

## Release Workflow Details

### Stable Release Workflow (main branch)

**Automatic Release PR Creation:**
When you push to `main`:

1. Release Please scans commit history
2. Identifies packages with changes
3. Creates/updates release PRs with:
   - Version bumps based on commit types
   - Generated CHANGELOGs
   - Updated package.json versions

**Publishing on Merge:**
When you merge a release PR:

1. Workflow detects which packages were released
2. Builds all packages (for dependencies)
3. Publishes only the released packages to npm
4. Creates git tags
5. Posts a comment with npm links

### Beta Release Workflow (beta branch)

**Automatic Publishing:**
When you push to `beta`:

1. Workflow compares changes against main branch
2. Detects which packages have file changes
3. For each changed package:
   - Appends `-beta.YYYYMMDDHHMMSS` to current version
   - Publishes to npm with `beta` tag
4. Creates git tags
5. Posts a comment with npm links

### Alpha Release Workflow (alpha branch)

**Automatic Publishing:**
When you push to `alpha`:

1. Workflow compares changes against main branch
2. Detects which packages have file changes
3. For each changed package:
   - Appends `-alpha.YYYYMMDDHHMMSS` to current version
   - Publishes to npm with `alpha` tag
4. Creates git tags
5. Posts a comment with npm links

### Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` → Minor version bump (0.1.0 → 0.2.0)
- `fix:` → Patch version bump (0.1.0 → 0.1.1)
- `feat!:` or `BREAKING CHANGE:` → Major version bump (0.1.0 → 1.0.0)
- `chore:`, `docs:`, `test:`, etc. → No version bump (included in changelog)

Scope your commits with package name:

```bash
git commit -m "feat(next-maker): add new template"
git commit -m "fix(package-name): resolve build issue"
```

## Benefits

✅ **No workflow changes needed** when adding packages
✅ **Selective releases** - only changed packages are released
✅ **Independent versioning** - each package has its own version
✅ **Automated changelogs** - generated from commit history
✅ **Consistent releases** - follows semantic versioning
✅ **Private package support** - automatically skips private packages

## Workflow Examples

### Testing a Feature (Alpha)

```bash
# Work on alpha branch
git checkout alpha
git pull origin alpha

# Make changes to a package
# Edit packages/next-maker/src/index.ts

# Commit and push
git add .
git commit -m "feat: add new experimental feature"
git push origin alpha

# Result:
# - Only next-maker is published as 0.1.1-alpha.20251127120000
# - Install with: npm install @teispace/next-maker@alpha
```

### Pre-release Testing (Beta)

```bash
# Work on beta branch
git checkout beta
git pull origin beta

# Make changes to packages
# Edit packages/package-a/src/index.ts

# Commit and push
git add .
git commit -m "fix: resolve critical bug"
git push origin beta

# Result:
# - Only package-a is published as 1.0.0-beta.20251127120000
# - Install with: npm install @teispace/package-a@beta
```

### Stable Release (Main)

```bash
# Work on main branch via PR
git checkout -b feature/new-feature
git commit -m "feat(next-maker): add new template option"
git push origin feature/new-feature

# Create PR to main, get it merged

# Result:
# - Release Please creates a release PR
# - Merge the release PR
# - Only next-maker is published as 0.2.0
# - Install with: npm install @teispace/next-maker
```

### Multiple Package Changes

```bash
# Alpha/Beta: Changes to both packages
git checkout alpha
# Edit packages/package-a/src/index.ts
# Edit packages/package-b/src/index.ts
git commit -m "feat: update both packages"
git push origin alpha

# Result: Both packages published with alpha tag
# - package-a@1.0.0-alpha.20251127120000
# - package-b@2.0.0-alpha.20251127120000
```

### Single Package Change

```bash
# Alpha/Beta: Change to one package only
git checkout beta
# Edit only packages/next-maker/src/index.ts
git commit -m "fix: resolve bug in next-maker"
git push origin beta

# Result: Only next-maker published
# - Other packages are built but NOT published
# - next-maker@0.1.2-beta.20251127120000
```

## Installing Packages from Different Channels

### Latest Stable

```bash
npm install @teispace/next-maker
# or
npm install @teispace/next-maker@latest
```

### Beta Version

```bash
npm install @teispace/next-maker@beta
```

### Alpha Version

```bash
npm install @teispace/next-maker@alpha
```

### Specific Version

```bash
npm install @teispace/next-maker@0.1.1-alpha.20251127120000
```

## Troubleshooting

### Package not getting released on alpha/beta?

1. **Check if package has changes**: Compare against main branch
   ```bash
   git diff origin/main -- packages/your-package
   ```
2. **Verify package is not private**: Check `"private": false` in package.json
3. **Check workflow logs**: See which packages were detected as changed

### Package not getting released on stable?

1. **Check commit messages**: Must follow conventional commits
2. **Verify manifest files**: Package should be in both:
   - `release-please-config.json`
   - `.release-please-manifest.json`
3. **Check Release Please PR**: Should show your package in the PR
4. **Verify not private**: Check `"private": false` in package.json

### Want to force an alpha/beta release without changes?

Create an empty commit:

```bash
git commit --allow-empty -m "chore: trigger alpha release"
git push origin alpha
```

### Want to test locally before pushing?

```bash
# Check which packages would be detected as changed
git fetch origin main
git diff --name-only origin/main...HEAD -- packages/
```

### No packages published message?

This is expected when:

- No packages have changes compared to main (alpha/beta)
- No release PR was merged (stable)
- All changed packages are marked as private
