# @teispace/next-maker

A powerful CLI tool to scaffold Next.js applications and generate boilerplate code for features, Redux slices, and API services.

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

### 1. Create a New App (Default)

Generate a complete Next.js application with your preferred configuration.

```bash
npx @teispace/next-maker [project-name]
# or just
npx @teispace/next-maker
```

**Interactive prompts:**

- TypeScript configuration
- Tailwind CSS setup
- Redux Toolkit integration
- i18n (internationalization) support

**Example:**

```bash
npx @teispace/next-maker my-awesome-app
```

---

### 2. Generate a Feature Module

Create a feature module with components, hooks, and utilities.

```bash
npx @teispace/next-maker feature user-dashboard
```

**Interactive prompts:**

- Include test files
- Include Storybook stories
- Include CSS module

**Generated structure:**

```
src/features/user-dashboard/
├── components/
├── hooks/
├── utils/
├── __tests__/      (optional)
├── stories/        (optional)
└── index.ts
```

---

## Usage Examples

### Create a new app with all features

```bash
npx @teispace/next-maker my-project
# Follow the interactive prompts
```

### Generate a feature

```bash
# Create a feature
npx @teispace/next-maker feature user-profile
```

### Get help

```bash
# General help
npx @teispace/next-maker --help

# Feature command help
npx @teispace/next-maker feature --help
```

---

## Command-Line Arguments

All commands support the following pattern:

```bash
next-maker <command> [name] [options]
```

- `<command>`: Required. One of: `app`, `feature`, `slice`, `service`
- `[name]`: Optional. The name of what you're creating (will prompt if not provided)
- `[options]`: Optional flags like `--help`

---

## Features

✨ **Interactive Prompts** - Guided setup with sensible defaults
🎨 **Multiple Generators** - App, features, slices, and services
📦 **Modern Stack** - Next.js, TypeScript, Redux Toolkit, Tailwind CSS
🧪 **Test-Ready** - Optional test file generation
📚 **Well-Structured** - Follows best practices and conventions
🚀 **Fast Setup** - Get started in seconds

---

## Development

### Setup

```bash
git clone <repository-url>
cd next-maker
npm install
```

### Build

```bash
npm run build
```

### Test Locally

```bash
npx .
```

### Link for Global Testing

```bash
npm link
next-maker app test-project
npm unlink -g
```

---

## Tech Stack

- **TypeScript** - Type-safe development
- **esbuild** - Fast bundling
- **Commander.js** - Professional CLI framework
- **enquirer** - Interactive prompts
- **Node.js** - Runtime environment

---

## License

MIT

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## Support

For issues and questions, please visit our [GitHub Issues](https://github.com/teispace/nextjs-starter/issues).
