# @teispace/next-maker

A powerful CLI tool to scaffold Next.js applications with modern best practices and generate feature-based architecture components including pages, components, Redux slices, API services, and locales.

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

- **Package Manager** (npm, yarn, pnpm, bun)
- **GitHub Repository** (optional - configures remote origin)
- **HTTP Client** (axios, fetch, both, or none)
- **Dark Mode** (next-themes integration)
- **Redux Toolkit** (with redux-persist)
- **Internationalization** (next-intl)
- **Community Files** (CODE_OF_CONDUCT, CONTRIBUTING, etc.)
- **Docker** support
- **CI/CD** configuration
- **Pre-commit hooks** (Husky)

**Core Features:**

- Next.js 16+ with App Router
- TypeScript (strict mode)
- Tailwind CSS v4
- Result-based HTTP clients
- Feature-based DDD architecture
- ESLint + Prettier configured

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

**Examples:**

```bash
# Interactive menu
npx @teispace/next-maker setup

# Add specific features
npx @teispace/next-maker setup --http-client
npx @teispace/next-maker setup --dark-theme
npx @teispace/next-maker setup --redux
npx @teispace/next-maker setup --i18n
```

---

### 3. Generate a Page

Create a new page/route with locale-aware boilerplate, SEO metadata, and optional loading/error states.

```bash
npx @teispace/next-maker page <name> [options]
```

**Options:**

- `--dynamic <param>` - Create dynamic route (e.g., `--dynamic id` creates `[id]/page.tsx`)
- `--loading` - Generate `loading.tsx`
- `--error` - Generate `error.tsx`

**What it generates:**

- `page.tsx` with full locale support (if i18n is set up), `generateMetadata`, `setRequestLocale`
- Registers route in `src/lib/config/app-paths.ts`
- Adds translation namespace to `en.json` (if i18n)
- Optional `loading.tsx` and `error.tsx`

**Examples:**

```bash
# Simple page
npx @teispace/next-maker page about

# Page with loading and error states
npx @teispace/next-maker page dashboard --loading --error

# Dynamic route (e.g., /products/[id])
npx @teispace/next-maker page products --dynamic id --loading --error
```

---

### 4. Generate a Component

Create a shared component with automatic barrel export wiring across all index files.

```bash
npx @teispace/next-maker component <name> [options]
```

**Options:**

- `--client` - Add `'use client'` directive
- `--i18n` - Add `useTranslations` hook
- `--feature <path>` - Generate inside a feature directory

**Generated structure (shared):**

```
src/components/common/MyButton/
├── MyButton.tsx
└── index.ts
```

Auto-updates `src/components/common/index.ts` and `src/components/index.ts`.

**Examples:**

```bash
# Shared component
npx @teispace/next-maker component data-table --client

# Component with i18n
npx @teispace/next-maker component nav-bar --client --i18n

# Feature-specific component
npx @teispace/next-maker component user-card --client --feature src/features/auth
```

---

### 5. Generate a Feature Module

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

# Feature with Redux only
npx @teispace/next-maker feature shopping-cart --store no-persist --skip-service

# Feature in custom location
npx @teispace/next-maker feature auth --store persist --service fetch --path src/modules
```

---

### 6. Generate a Redux Slice

Create a Redux Toolkit slice with persistence support.

```bash
npx @teispace/next-maker slice <name> [options]
```

**Options:**

- `--persist` - Enable redux-persist for this slice
- `--no-persist` - Disable persistence
- `--path <path>` - Custom path (default: create new feature)

**Auto-registers in rootReducer** with correct imports.

**Examples:**

```bash
# Create new feature with slice
npx @teispace/next-maker slice auth --persist

# Add slice to existing feature
npx @teispace/next-maker slice user-settings --path features/auth/store
```

---

### 7. Generate an API Service

Create an API service with HTTP client integration. Supports both simple and full CRUD generation.

```bash
npx @teispace/next-maker service <name> [options]
```

**Options:**

- `--axios` - Use AxiosClient
- `--fetch` - Use FetchClient
- `--crud` - Generate full CRUD service (getAll, getById, create, update, delete)
- `--path <path>` - Custom path (default: create new feature)

**CRUD mode** generates:

- Service with 5 methods: `getAll`, `getById`, `create`, `update`, `delete`
- `<Name>Summary` type for list responses (cards, tables) and `<Name>Detail` type for single-item responses (detail pages)
- DTO types: `Create<Name>Dto`, `Update<Name>Dto`
- Full API config with dynamic routes (`getById(id)`, `update(id)`, `delete(id)`)

**Examples:**

```bash
# Simple service
npx @teispace/next-maker service payment --axios

# Full CRUD service with types and endpoints
npx @teispace/next-maker service users --fetch --crud

# CRUD service in existing feature
npx @teispace/next-maker service orders --axios --crud --path features/products/services
```

---

### 8. Add a Locale

Add a new language/locale to your internationalized project.

```bash
npx @teispace/next-maker locale [code] [options]
```

**Options:**

- `--copy-translations` - Copy English translations instead of empty values

**What it does:**

- Creates `src/i18n/translations/<code>.json` (empty or copied from English)
- Updates `SupportedLocale` type in `src/types/i18n.ts`
- Adds entry to `src/lib/config/app-locales.ts` with name, flag, country

**Examples:**

```bash
# Add Spanish (interactive prompts for name, country, flag)
npx @teispace/next-maker locale es

# Add French with English translations as starting point
npx @teispace/next-maker locale fr --copy-translations
```

---

### 9. Generate a Hook

Create a custom React hook with loading/error state boilerplate.

```bash
npx @teispace/next-maker hook <name> [options]
```

**Options:**

- `--client` - Add `'use client'` directive (default: true)
- `--feature <path>` - Generate in feature directory

**Examples:**

```bash
# Shared hook in src/hooks/
npx @teispace/next-maker hook auth-session

# Hook inside a feature
npx @teispace/next-maker hook user-profile --feature src/features/auth
```

---

## Usage Examples

### Quick Start - New Project

```bash
# Create a new Next.js app with interactive setup
npx @teispace/next-maker init my-project
cd my-project

# Generate pages
npx @teispace/next-maker page dashboard --loading --error
npx @teispace/next-maker page settings --loading

# Generate features with CRUD
npx @teispace/next-maker feature users --store persist --service fetch
npx @teispace/next-maker service users --fetch --crud --path features/users/services

# Add a locale
npx @teispace/next-maker locale es

# Start development
npm run dev
```

### Feature-Based Development

```bash
# E-commerce example
npx @teispace/next-maker feature products --store persist --service axios
npx @teispace/next-maker service products --axios --crud --path features/products/services
npx @teispace/next-maker page products --dynamic id --loading --error
npx @teispace/next-maker component product-card --client --feature src/features/products

npx @teispace/next-maker feature cart --store persist --skip-service
npx @teispace/next-maker page checkout --loading --error
```

### Get Help

```bash
npx @teispace/next-maker --help
npx @teispace/next-maker page --help
npx @teispace/next-maker component --help
npx @teispace/next-maker locale --help
```

---

## Key Features

### Pages with Full Locale Support

Auto-generates `generateMetadata`, `setRequestLocale`, typed Props, SEO metadata, and translation namespace. Supports dynamic routes with `--dynamic`.

### Shared Components with Auto-Wiring

Creates component in `src/components/common/<Name>/` and auto-updates all barrel exports so you can immediately `import { MyComponent } from '@/components'`.

### CRUD Service Generation

`--crud` flag generates a complete service with 5 REST methods, separate `Summary` and `Detail` response types (list vs detail views), typed DTOs, and full API config with dynamic route helpers.

### Locale Management

One command adds a new language: translation file, type update, and config entry. No manual file editing.

### Feature-First Architecture

All generators follow a feature-based DDD approach, organizing code by business domain rather than technical layers.

### Smart Redux Integration

Auto-registers slices in `rootReducer` with correct import paths and optional redux-persist configuration.

### HTTP Client Support

- **AxiosClient**: Result-based error handling
- **FetchClient**: Same Result pattern with native fetch
- Auto-detects available clients

### Intelligent Path Handling

All commands support `--path` for custom locations. Relative paths like `features/auth` are resolved to `src/features/auth`.

### Built-in Validations

- Checks for required dependencies (Redux, HTTP clients, i18n)
- Prevents duplicate generation
- Validates naming conventions (kebab-case)

---

## Command Reference

| Command            | Description                      |
| ------------------ | -------------------------------- |
| `init [name]`      | Create a new Next.js application |
| `setup`            | Add features to existing project |
| `page <name>`      | Generate a new page/route        |
| `component <name>` | Generate a shared component      |
| `feature <name>`   | Generate a feature module        |
| `slice <name>`     | Generate a Redux slice           |
| `service <name>`   | Generate an API service          |
| `locale [code]`    | Add a new locale/language        |
| `hook <name>`      | Generate a custom React hook     |

---

## Project Structure

Generated apps follow this structure:

```
my-project/
├── src/
│   ├── app/                  # Next.js App Router
│   │   └── [locale]/        # Locale-aware routes (if i18n)
│   ├── features/             # Feature modules (DDD)
│   │   └── counter/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── store/
│   │       ├── types/
│   │       └── index.ts
│   ├── components/           # Shared components
│   │   └── common/          # Reusable UI components
│   ├── lib/
│   │   ├── config/          # App configuration
│   │   ├── utils/
│   │   │   └── http/        # AxiosClient & FetchClient
│   │   └── errors/          # Error classes
│   ├── providers/           # React providers
│   ├── store/               # Redux store setup
│   ├── i18n/                # Internationalization
│   │   └── translations/    # Translation files
│   └── styles/              # Global styles
├── public/                   # Static assets
└── package.json
```

---

## Tech Stack

**CLI:**

- TypeScript, esbuild, Commander.js, Enquirer, Vitest

**Generated Apps:**

- Next.js 16+, TypeScript, Redux Toolkit, Tailwind CSS v4, next-intl, Axios, ESLint + Prettier

---

## Development

### Setup

```bash
git clone <repository-url>
cd npm-packages/packages/next-maker
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
npm run test:watch
```

### Test Locally

```bash
node dist/index.js init test-project
cd test-project
node ../dist/index.js page dashboard --loading --error
node ../dist/index.js component sidebar --client
node ../dist/index.js feature auth --store persist --service axios
node ../dist/index.js service users --fetch --crud
node ../dist/index.js locale es
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
