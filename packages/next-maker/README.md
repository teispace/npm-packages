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
npx @teispace/next-maker app [project-name]
# or simply
npx @teispace/next-maker [project-name]
```

**Features included:**

- ⚡ Next.js 15+ with App Router
- 🔷 TypeScript (strict mode)
- 🎨 Tailwind CSS v4
- 🔄 Redux Toolkit with redux-persist
- 🌐 next-intl for internationalization
- 📡 AxiosClient & FetchClient (Result pattern)
- 🏗️ Feature-based DDD architecture
- 🎯 ESLint + Prettier configured
- 🐳 Docker support

**Example:**

```bash
npx @teispace/next-maker my-awesome-app
```

---

### 2. Generate a Feature Module

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

### 3. Generate a Redux Slice

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

### 4. Generate an API Service

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
# Create a new Next.js app
npx @teispace/next-maker my-project

# Navigate to the project
cd my-project

# Generate your first feature
npx @teispace/next-maker feature auth --store persist --service axios

# Start development server
npm run dev
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
npx @teispace/next-maker feature --help
npx @teispace/next-maker slice --help
npx @teispace/next-maker service --help
```

---

## Key Features

### 🏗️ Feature-First Architecture

All generators follow a feature-based DDD approach by default, organizing code by business domain rather than technical layers.

### 🔄 Smart Redux Integration

- Auto-registers slices in `rootReducer`
- Correct import paths for any custom location
- Optional redux-persist configuration
- Demo actions included (setLoading, setError, resetState)

### 📡 HTTP Client Support

- **AxiosClient**: Result-based error handling with `isOk()/isErr()`
- **FetchClient**: Same Result pattern with native fetch
- Auto-detects available clients
- Type-safe API calls with generics

### 🎯 Intelligent Path Handling

All commands support `--path` for custom locations:

- Relative: `features/auth` → `src/features/auth`
- Absolute: `src/modules/auth` → `src/modules/auth`
- Auto-creates directory structure
- Adapts imports based on location

### ✅ Built-in Validations

- Checks for required dependencies (Redux, HTTP clients)
- Prevents duplicate generation
- Validates naming conventions (kebab-case)
- Ensures consistent project structure

---

## Command Reference

### Common Options

All commands support:

- `[name]` - Resource name (kebab-case, prompted if omitted)
- `--path <path>` - Custom generation path
- `--help` - Show command help

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

- Next.js 15+ - React framework
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
node dist/index.js app test-project

# Test feature generation
cd test-project
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
