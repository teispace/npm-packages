# @teispace/npm-packages

A professional Yarn 4 monorepo for Teispace's published npm packages, with automated releases via [release-please](https://github.com/googleapis/release-please), npm provenance, and a shared Biome + Vitest + TypeScript toolchain.

## 📦 Packages

| Package | Description |
| ------- | ----------- |
| **[@teispace/env](./packages/env)** | Type-safe, validated environment variables for every JS runtime & framework — load, validate, coerce, and type your env. Zero runtime deps. |
| **[@teispace/next-themes](./packages/next-themes)** | Feature-rich, lightweight theme management for Next.js & React. Zero-flash SSR, hybrid storage, view transitions, typed themes. Zero runtime deps. |
| **[@teispace/teieditor](./packages/teieditor)** | A feature-rich, fully customizable rich-text editor built on Lexical. shadcn-style — install, use, customize. |
| **[@teispace/next-maker](./packages/next-maker)** | CLI to scaffold and extend Teispace Next.js applications with interactive setup. |

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/teispace/npm-packages.git
cd npm-packages

# Install dependencies (Corepack pins Yarn 4)
yarn install

# Build all publishable packages
yarn build

# Run the full validation suite (lint + type-check + test + build)
yarn validate
```

## 🧑‍💻 Development

```bash
yarn lint            # Lint + format check (Biome)
yarn lint:fix        # Auto-fix lint/format issues
yarn format          # Format code (Biome)
yarn type-check      # Type-check all packages (tsc --noEmit)
yarn test            # Run tests (Vitest)
yarn test:watch      # Watch mode
yarn test:cov        # Tests with coverage
yarn build           # Build publishable packages (excludes examples)
yarn build:examples  # Build the example apps
yarn validate        # lint + type-check + test + build
yarn clean           # Remove build artifacts & caches
```

## 📦 Releases

Releases are fully automated with **release-please** on the `main` branch — this repo is trunk-based, not Git-Flow.

1. Land Conventional-Commits PRs on `main`.
2. release-please opens/updates a **release PR** that bumps versions and updates each package's `CHANGELOG.md` from the commit history.
3. Merging that release PR tags the releases and the publish job pushes the changed packages to npm with **provenance** under the `@latest` tag.

There is a single stable channel (`@latest`). Install any package the usual way:

```bash
npm install @teispace/env
npm install @teispace/next-themes
npm install @teispace/teieditor
npm install -g @teispace/next-maker   # or: npx @teispace/next-maker
```

See **[RELEASING.md](./RELEASING.md)** for the full release process.

## 📖 Documentation

- **[SETUP.md](./SETUP.md)** — Initial setup and quick reference
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — How to contribute
- **[RELEASING.md](./RELEASING.md)** — Release process and versioning
- **[CI-CD-SETUP.md](./CI-CD-SETUP.md)** — CI/CD configuration
- Each package's own `README.md` documents its public API in depth.

## 🤝 Contributing

We welcome contributions! Please read the [Contributing Guide](./CONTRIBUTING.md) to get started.

1. Fork the repository
2. Create a feature branch off `main` (`feat/my-feature`)
3. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`yarn commit` runs Commitizen)
4. Push and open a Pull Request against `main`
5. Wait for CI (lint, type-check, test, build) and review

## 🏗️ Monorepo Structure

```
npm-packages/
├── .github/workflows/      # ci.yml (PR + push checks), release-please.yml (release + publish)
├── packages/
│   ├── env/                # @teispace/env
│   ├── next-themes/        # @teispace/next-themes
│   ├── teieditor/          # @teispace/teieditor
│   └── next-maker/         # @teispace/next-maker
├── examples/               # Private example apps (next-themes demo, teieditor playground)
├── biome.json              # Lint + format config
├── vitest.coverage.ts      # Shared coverage config
├── tsconfig.base.json      # Shared TS config
├── release-please-config.json
└── package.json            # Root workspace config
```

## 🔐 Requirements

- Node.js >= 24.0.0 (see `.nvmrc`)
- Yarn >= 4.0.0 (via Corepack)
- Git

## 📄 License

MIT © [Teispace](https://github.com/teispace)

## 🔗 Links

- [GitHub Repository](https://github.com/teispace/npm-packages)
- [Issues](https://github.com/teispace/npm-packages/issues)
- [npm Organization](https://www.npmjs.com/org/teispace)
