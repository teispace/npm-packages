# @teispace/npm-packages

A professional monorepo for publishing npm packages with automated CI/CD, versioning, and multi-channel releases.

## 📦 Packages

- **[@teispace/next-maker](./packages/next-maker)** - CLI tool for creating Next.js applications

## 🔄 Release Channels

This monorepo supports three release channels:

- **stable** (main branch) - Production releases with semantic versioning
- **beta** (beta branch) - Pre-release testing versions
- **alpha** (alpha branch) - Cutting-edge development versions

## 🚀 Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/teispace/npm-packages.git
cd npm-packages

# Install dependencies
yarn install

# Build all packages
yarn build

# Run validation
yarn validate
```

### Development

```bash
# Lint code
yarn lint

# Format code
yarn format

# Type check
yarn type-check

# Run tests
yarn test

# Watch mode
yarn test:watch
```

## 📖 Documentation

- **[SETUP.md](./SETUP.md)** - Initial setup and quick reference
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - How to contribute
- **[RELEASING.md](./RELEASING.md)** - Release process and versioning

## 🔄 Release Channels

| Channel | npm Tag   | Use Case                  |
| ------- | --------- | ------------------------- |
| Stable  | `@latest` | Production-ready releases |
| Beta    | `@beta`   | Pre-release testing       |
| Alpha   | `@alpha`  | Experimental features     |

### Installing Packages

```bash
# Stable (default)
npm install @teispace/next-maker

# Beta
npm install @teispace/next-maker@beta

# Alpha
npm install @teispace/next-maker@alpha
```

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](./CONTRIBUTING.md) to get started.

### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch (`feat/my-feature`)
3. Commit changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push and create a Pull Request
5. Wait for CI checks and review

## 📋 Scripts

```bash
yarn build              # Build all packages
yarn lint               # Lint code
yarn format             # Format code
yarn format:check       # Check formatting
yarn type-check         # Type check
yarn test               # Run tests
yarn test:cov           # Run tests with coverage
yarn validate           # Run all checks
yarn clean              # Clean build artifacts
```

## 🏗️ Monorepo Structure

```
npm-packages/
├── .github/
│   └── workflows/          # CI/CD workflows
├── packages/
│   └── next-maker/    # Individual packages
├── CONTRIBUTING.md         # Contribution guidelines
├── RELEASING.md            # Release documentation
├── SETUP.md               # Setup guide
└── package.json           # Root package config
```

## 🔐 Requirements

- Node.js >= 20.0.0
- Yarn >= 4.0.0 (Corepack)
- Git

## 📄 License

MIT © [Teispace](https://github.com/teispace)

## 🔗 Links

- [GitHub Repository](https://github.com/teispace/npm-packages)
- [Issues](https://github.com/teispace/npm-packages/issues)
- [npm Organization](https://www.npmjs.com/org/teispace)
