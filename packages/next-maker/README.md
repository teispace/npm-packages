# @teispace/next-maker

A powerful CLI tool to scaffold Next.js applications with modern best practices and generate feature-based architecture components including Redux slices and API services.

## Installation

### Using npx (Recommended)

```bash
npx @teispace/next-maker <command> [name] [options]
```

### Global Installation

```bash
npm install -g @teispace/next-maker
next-maker <command> [name] [options]
```

## Commands

### 1. Create a New App

Generate a complete Next.js application with production-ready configuration.

```bash
npx @teispace/next-maker init [project-name]
```

**Interactive Setup:**

During initialization, you'll be prompted to configure:

- 📦 **Package Manager** (npm, yarn, pnpm, bun)
- 🔗 **GitHub Repository** (optional - configures remote origin)
- 🌐 **HTTP Client** (axios, fetch, both, or none)
- 🌙 **Dark Mode** (next-themes integration)
- 🔄 **Redux Toolkit** (with redux-persist)
- 🌍 **Internationalization** (next-intl)
- 📋 **Community Files** (CODE_OF_CONDUCT, CONTRIBUTING, etc.)
- 🐳 **Docker** support
- 🔧 **CI/CD** configuration
- 🎯 **Pre-commit hooks** (Husky)

**Core Features:**

- ⚡ Next.js 16+ with App Router
- 🔷 TypeScript (strict mode)
- 🎨 Tailwind CSS v4
- 📡 Result-based HTTP clients
- 🏗️ Feature-based DDD architecture
- 🎯 ESLint + Prettier configured

**Example:**

```bash
npx @teispace/next-maker init my-awesome-app
```

---

### 2. Setup Additional Features

Add features to your existing Next.js project after initialization.

```bash
npx @teispace/next-maker setup [options]
```

**Options:**

- `--http-client` - Setup HTTP client (Interactive: axios|fetch|both)
- `--dark-theme` - Setup dark theme support (next-themes)
- `--redux` - Setup Redux Toolkit with persistence
- `--i18n` - Setup next-intl for internationalization

**Features:**

Each setup command:

- ✅ Checks if already configured (exits gracefully)
- 📁 Copies necessary files from template
- 🔧 Updates configuration files
- 📦 Installs required packages
- 🔗 Integrates with existing providers

**Examples:**

```bash
# Interactive menu
npx @teispace/next-maker setup

# Add HTTP clients (Interactive)
npx @teispace/next-maker setup --http-client

# Add dark mode
npx @teispace/next-maker setup --dark-theme

# Add Redux
npx @teispace/next-maker setup --redux

# Add internationalization
npx @teispace/next-maker setup --i18n
```

**What Gets Setup:**

**HTTP Client:**

- Copies axios-client and/or fetch-client to `src/lib/utils/http/`
- Updates `src/lib/utils/http/index.ts` with exports
- Installs axios package (if selected)

**Dark Theme:**

- Copies `CustomThemeProvider.tsx` to `src/providers/`
- Adds `@custom-variant dark` to `src/styles/globals.css`
- Adds CSS variables `--color-dark` and `--color-light`
- Updates layout.tsx with `bg-light dark:bg-dark` classes
- Integrates with RootProvider
- Installs next-themes package

**Redux Toolkit:**

- Copies store configuration to `src/store/`
- Creates hooks, persistor, and rootReducer
- Copies `StoreProvider.tsx` to `src/providers/`
- Integrates with RootProvider
- Installs @reduxjs/toolkit, react-redux, redux-persist

**Internationalization:**

- Copies i18n directory (`routing.ts`, `request.ts`, `navigation.ts`, `translations/`)
- Copies `types/i18n.ts` and `lib/config/app-locales.ts`
- Creates/updates `src/proxy.ts` (middleware)
- Updates `next.config.ts` with createNextIntlPlugin
- Updates RootProvider with NextIntlClientProvider
- Creates `[locale]` route structure
- Installs next-intl package

---

### 3. Generate a Feature Module

Create a complete feature module following Domain-Driven Design principles.

```bash
npx @teispace/next-maker feature <name> [options]
```

**Options:**

- `--store <type>` - Generate Redux store (persist|no-persist)
- `--skip-store` - Skip Redux store generation
- `--service <client>` - Generate API service (axios|fetch)
- `--skip-service` - Skip API service generation
- `--path <path>` - Custom path (default: src/features)

**Generated structure:**

```
src/features/user-dashboard/
├── components/
│   └── UserDashboard.tsx
├── hooks/
│   └── useUserDashboard.ts
├── types/
│   └── user-dashboard.types.ts
├── store/                    (optional)
│   ├── user-dashboard.slice.ts
│   ├── user-dashboard.selectors.ts
│   ├── persist.ts            (optional)
│   └── index.ts
├── services/                 (optional)
│   └── user-dashboard.service.ts
└── index.ts
```

**Examples:**

```bash
# Full feature with Redux and API service
npx @teispace/next-maker feature user-profile --store persist --service axios

# Feature with Redux only (no persistence)
npx @teispace/next-maker feature shopping-cart --store no-persist --skip-service

# Feature in custom location
npx @teispace/next-maker feature auth --store persist --service fetch --path src/modules
```

---

### 4. Generate a Redux Slice

Create a Redux Toolkit slice with persistence support.

```bash
npx @teispace/next-maker slice <name> [options]
```

**Options:**

- `--persist` - Enable redux-persist for this slice
- `--no-persist` - Disable persistence
- `--path <path>` - Custom path (default: create new feature)

**Generated structure:**

```
src/features/auth/store/auth/
├── auth.slice.ts
├── auth.selectors.ts
├── auth.types.ts
├── persist.ts                (optional)
└── index.ts
```

**Auto-registers in rootReducer** with correct imports!

**Examples:**

```bash
# Create new feature with slice
npx @teispace/next-maker slice auth --persist

# Add slice to existing feature
npx @teispace/next-maker slice user-settings --path features/auth/store

# Slice in custom location
npx @teispace/next-maker slice theme --no-persist --path src/store/slices
```

---

### 5. Generate an API Service

Create an API service with HTTP client integration.

```bash
npx @teispace/next-maker service <name> [options]
```

**Options:**

- `--axios` - Use AxiosClient
- `--fetch` - Use FetchClient
- `--path <path>` - Custom path (default: create new feature)

**Generated structure:**

```
src/features/payment/services/
└── payment.service.ts
```

**Validates HTTP client setup** before generation!

**Examples:**

```bash
# Create new feature with service
npx @teispace/next-maker service payment --axios

# Add service to existing feature
npx @teispace/next-maker service user --fetch --path features/auth/services

# Service in custom location
npx @teispace/next-maker service analytics --axios --path src/api/services
```

---

## Usage Examples

### Quick Start - New Project

```bash
# Create a new Next.js app with interactive setup
npx @teispace/next-maker my-project

# Navigate to the project
cd my-project

# Generate your first feature
npx @teispace/next-maker feature auth --store persist --service axios

# Start development server
npm run dev
```

### Setup Existing Project

```bash
# Add features to existing Next.js project

# Add HTTP clients if you initially selected 'none'
npx @teispace/next-maker setup --http-client

# Add dark mode support
npx @teispace/next-maker setup --dark-theme

# Add Redux state management
npx @teispace/next-maker setup --redux

# Add internationalization
npx @teispace/next-maker setup --i18n
```

### Feature-Based Development

```bash
# E-commerce example
npx @teispace/next-maker feature products --store persist --service axios
npx @teispace/next-maker feature cart --store persist --skip-service
npx @teispace/next-maker slice checkout --path features/cart/store
npx @teispace/next-maker service orders --axios --path features/products/services

# Dashboard example
npx @teispace/next-maker feature dashboard --store no-persist --service fetch
npx @teispace/next-maker slice analytics --path features/dashboard/store
npx @teispace/next-maker service metrics --fetch --path features/dashboard/services
```

### Get Help

```bash
# General help
npx @teispace/next-maker --help

# Command-specific help
npx @teispace/next-maker init --help
npx @teispace/next-maker setup --help
npx @teispace/next-maker feature --help
npx @teispace/next-maker slice --help
npx @teispace/next-maker service --help
```

---

## Key Features

### 🚀 Post-Installation Setup

Add features to your project anytime with the `setup` command:

- HTTP clients (axios/fetch) even if you initially chose "none"
- Dark theme with automatic CSS and layout updates
- Redux Toolkit with complete store configuration
- Internationalization with routing and middleware
- Smart detection prevents duplicate setups
- Automatic package installation

### 🏗️ Feature-First Architecture

All generators follow a feature-based DDD approach by default, organizing code by business domain rather than technical layers.

### 🔄 Smart Redux Integration

- Auto-registers slices in `rootReducer`
- Correct import paths for any custom location
- Optional redux-persist configuration
- Demo actions included (setLoading, setError, resetState)
- Can be added post-initialization via `setup --redux`

### 📡 HTTP Client Support

- **AxiosClient**: Result-based error handling with `isOk()/isErr()`
- **FetchClient**: Same Result pattern with native fetch
- Auto-detects available clients
- Type-safe API calls with generics
- Can be added later via `setup --http-client`

### 🌙 Dark Mode Support

- next-themes integration with CustomThemeProvider
- Automatic CSS variable setup (`--color-dark`, `--color-light`)
- Tailwind CSS v4 custom variant (`@custom-variant dark`)
- Layout className updates (`bg-light dark:bg-dark`)
- Can be added via `setup --dark-theme`

### 🌍 Internationalization

- next-intl with routing middleware
- Translation management system
- Locale type safety
- [locale] route structure
- Can be added via `setup --i18n`

### 🎯 Intelligent Path Handling

All commands support `--path` for custom locations:

- Relative: `features/auth` → `src/features/auth`
- Absolute: `src/modules/auth` → `src/modules/auth`
- Auto-creates directory structure
- Adapts imports based on location

### ✅ Built-in Validations

- Checks for required dependencies (Redux, HTTP clients)
- Prevents duplicate generation and setups
- Validates naming conventions (kebab-case)
- Ensures consistent project structure
- Validates GitHub repository URLs

---

## Command Reference

### Generator Options (feature, slice, service)

These commands support:

- `[name]` - Resource name (kebab-case, prompted if omitted)
- `--path <path>` - Custom generation path
- `--help` - Show command help

### Init/App Options

Interactive prompts guide you through:

- Project name, description, version
- Package manager selection
- GitHub repository (optional)
- HTTP client selection
- Dark mode, Redux, i18n toggles
- Docker, CI/CD, pre-commit hooks

### Setup Options

```bash
--http-client <type>         # Setup HTTP client (axios|fetch|both)
--dark-theme                 # Setup dark theme support
--redux                      # Setup Redux Toolkit
--i18n                       # Setup internationalization
```

### Feature Options

```bash
--store <persist|no-persist>  # Generate Redux store
--skip-store                  # Don't generate store
--service <axios|fetch>       # Generate API service
--skip-service               # Don't generate service
```

### Slice Options

```bash
--persist                    # Enable redux-persist
--no-persist                # Disable persistence
```

### Service Options

```bash
--axios                     # Use AxiosClient
--fetch                     # Use FetchClient
```

---

## Project Structure

Generated apps follow this structure:

```
my-project/
├── src/
│   ├── app/                  # Next.js App Router
│   ├── features/             # Feature modules (DDD)
│   │   └── counter/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── store/
│   │       ├── types/
│   │       └── index.ts
│   ├── components/           # Shared components
│   ├── lib/
│   │   ├── config/          # App configuration
│   │   ├── utils/
│   │   │   └── http/        # AxiosClient & FetchClient
│   │   ├── errors/          # Error classes
│   │   └── validations/     # Validation schemas
│   ├── providers/           # React providers
│   ├── store/               # Redux store setup
│   ├── services/            # Global services
│   ├── i18n/                # Internationalization
│   └── styles/              # Global styles
├── public/                   # Static assets
├── .husky/                   # Git hooks
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Tech Stack

**CLI:**

- TypeScript - Type-safe development
- esbuild - Fast bundling
- Commander.js - CLI framework
- Enquirer - Interactive prompts

**Generated Apps:**

- Next.js 16+ - React framework
- TypeScript - Static typing
- Redux Toolkit - State management
- Tailwind CSS v4 - Styling
- next-intl - Internationalization
- Axios - HTTP client
- ESLint + Prettier - Code quality

---

## Development

### Setup

```bash
git clone <repository-url>
cd npm-packages/packages/next-maker
yarn install
```

### Build

```bash
yarn build
```

### Test Locally

```bash
# Test app generation
node dist/index.js init test-project

# Navigate to test project
cd test-project

# Test setup commands
node ../dist/index.js setup --http-client
node ../dist/index.js setup --dark-theme
node ../dist/index.js setup --redux
node ../dist/index.js setup --i18n

# Test feature generation
node ../dist/index.js feature auth --store persist --service axios

# Test slice generation
node ../dist/index.js slice user-profile --persist

# Test service generation
node ../dist/index.js service payment --axios
```

### Link for Global Testing

```bash
npm link
next-maker feature my-feature
npm unlink -g
```

---

## License

MIT

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Support

For issues and questions, please visit our [GitHub Issues](https://github.com/teispace/npm-packages/issues).
