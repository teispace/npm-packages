# Contributing to @teispace/npm-packages

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this monorepo.

> **Note**: This is a test change to verify selective package publishing works correctly.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branch Strategy](#branch-strategy)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Testing](#testing)
- [Code Style](#code-style)

## Getting Started

### Prerequisites

- **Node.js**: >= 20.0.0
- **Yarn**: >= 4.0.0 (Corepack enabled)
- **Git**: Latest version

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/teispace/npm-packages.git
cd npm-packages

# Enable Corepack (if not already enabled)
corepack enable

# Install dependencies
yarn install

# Build all packages
yarn build

# Run tests
yarn test --passWithNoTests

# Validate everything
yarn validate
```

## Development Workflow

### 1. Create a Branch

Follow our [branch strategy](#branch-strategy) to create an appropriate branch:

```bash
# For new features
git checkout -b feat/your-feature-name

# For bug fixes
git checkout -b fix/your-bug-fix

# For documentation
git checkout -b docs/your-doc-update
```

### 2. Make Changes

- Write clean, maintainable code
- Follow the [code style guidelines](#code-style)
- Add tests for new features
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run linting
yarn lint

# Run type checking
yarn type-check

# Run tests
yarn test

# Run all checks
yarn validate
```

### 4. Commit Your Changes

We use **Conventional Commits** for all commit messages. See [Commit Guidelines](#commit-guidelines).

```bash
# Stage your changes
git add .

# Commit with conventional commit message
git commit -m "feat: add new feature"

# Or use commitizen for guided commits
yarn commit
```

### 5. Push and Create PR

```bash
# Push your branch
git push origin feat/your-feature-name

# Create a Pull Request on GitHub
```

## Branch Strategy

We use a **Git Flow** inspired strategy with multiple release channels:

### Main Branches

- **`main`**: Production-ready code. Protected branch.
  - Only accepts PRs from `develop` or hotfix branches
  - Triggers stable releases via Release Please
  - All commits must pass CI/CD

- **`develop`**: Integration branch for features
  - Default branch for feature PRs
  - Contains next release features
  - Must always be stable

- **`alpha`**: Alpha release channel
  - For testing experimental features
  - Publishes with `@alpha` tag
  - Frequent, unstable releases

- **`beta`**: Beta release channel
  - For pre-release testing
  - Publishes with `@beta` tag
  - More stable than alpha

### Supporting Branches

- **`feat/*`**: Feature branches
  - Created from: `develop`
  - Merged into: `develop`
  - Naming: `feat/descriptive-name`

- **`fix/*`**: Bug fix branches
  - Created from: `develop` or `main` (hotfix)
  - Merged into: `develop` or `main`
  - Naming: `fix/descriptive-name`

- **`docs/*`**: Documentation branches
  - Created from: `develop`
  - Merged into: `develop`
  - Naming: `docs/what-changed`

- **`refactor/*`**: Code refactoring
  - Created from: `develop`
  - Merged into: `develop`
  - Naming: `refactor/what-changed`

- **`hotfix/*`**: Emergency fixes
  - Created from: `main`
  - Merged into: `main` and `develop`
  - Naming: `hotfix/critical-issue`

## Commit Guidelines

We follow **[Conventional Commits](https://www.conventionalcommits.org/)** specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, no logic change)
- **refactor**: Code refactoring (no feat or fix)
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **build**: Build system or external dependencies
- **ci**: CI/CD configuration changes
- **chore**: Other changes (maintenance)
- **revert**: Revert a previous commit

# Examples

```bash
# Simple feature
feat: add user authentication

# Feature with scope
feat(next-maker): add tailwind configuration option

# Bug fix
fix: resolve memory leak in build process

# Breaking change
feat!: change API response format

BREAKING CHANGE: The API now returns data in a different structure
```

### Rules

- Use **lowercase** for type and subject
- Subject line max 72 characters
- Use present tense ("add" not "added")
- Don't end subject with period
- Add body for complex changes
- Reference issues in footer

### Commitlint

Your commits will be automatically validated by commitlint. The pre-commit hook will:

1. Run linting and formatting
2. Type check
3. Validate commit message format

## Pull Request Process

### Before Creating PR

1. ✅ All tests pass
2. ✅ Linting passes
3. ✅ Type checking passes
4. ✅ Build succeeds
5. ✅ Documentation updated
6. ✅ CHANGELOG entries (if needed)

### PR Guidelines

**Title Format**: Use conventional commit format

```
feat: add new feature
fix: resolve bug in component
docs: update installation guide
```

**Description Should Include**:

- What changed and why
- Related issues (Fixes #123, Closes #456)
- Breaking changes (if any)
- Screenshots (for UI changes)
- Testing instructions

### PR Checklist

```markdown
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All CI checks pass
- [ ] No breaking changes (or documented)
- [ ] Commits follow conventional format
```

### Review Process

1. At least **1 approving review** required
2. All CI checks must pass
3. No merge conflicts
4. Branch up to date with base branch

### Merging

- Use **Squash and Merge** for feature branches
- Use **Rebase and Merge** for small fixes
- Delete branch after merging

## Release Process

See [RELEASING.md](./RELEASING.md) for detailed release instructions.

### Quick Overview

- **Alpha releases**: Push to `alpha` branch
- **Beta releases**: Push to `beta` branch
- **Stable releases**: Merge to `main` (via Release Please PR)

## Testing

### Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:cov

# Run tests in CI mode
yarn test:ci
```

### Writing Tests

- Place tests next to source files: `component.spec.ts`
- Use descriptive test names
- Follow AAA pattern: Arrange, Act, Assert
- Mock external dependencies
- Aim for >80% coverage on new code

### Test Structure

```typescript
import { describe, expect, test } from '@jest/globals';

describe('FeatureName', () => {
  test('should handle specific case', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = processInput(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

## Code Style

### Automated Formatting

We use **Prettier** and **ESLint** with automated enforcement:

```bash
# Format all files
yarn format

# Check formatting
yarn format:check

# Lint code
yarn lint

# Lint and fix
yarn lint --fix
```

### TypeScript Guidelines

- Use strict TypeScript mode
- Prefer interfaces over types for objects
- Use type inference when obvious
- Explicit return types for public APIs
- No `any` types (use `unknown` instead)

### Naming Conventions

- **Files**: kebab-case (`my-component.ts`)
- **Classes**: PascalCase (`MyComponent`)
- **Functions**: camelCase (`doSomething`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_SIZE`)
- **Interfaces**: PascalCase with `I` prefix optional
- **Types**: PascalCase

### Best Practices

- Keep functions small and focused
- Use meaningful variable names
- Comment complex logic
- Avoid deep nesting
- Handle errors appropriately
- Write self-documenting code

## Questions?

- Open an [issue](https://github.com/teispace/npm-packages/issues)
- Start a [discussion](https://github.com/teispace/npm-packages/discussions)
- Check existing documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
