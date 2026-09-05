/**
 * Root files for a pnpm + Turborepo workspace. Apps come from the starter;
 * these are the few files that only exist at the workspace root.
 */
export interface WorkspaceTemplateParams {
  name: string;
  description: string;
  author: string;
  apps: string[];
  packageManager: string;
  /** The starter's `packageManager` field, e.g. `pnpm@11.25.0`. */
  packageManagerPin: string;
  nodeEngine: string;
  turboVersion: string;
  biomeVersion: string;
  hooks: boolean;
  huskyVersion?: string;
  lintStagedVersion?: string;
  commitlintCliVersion?: string;
  commitlintConfigVersion?: string;
}

export const rootPackageJson = (p: WorkspaceTemplateParams): string => {
  const devDependencies: Record<string, string> = {
    '@biomejs/biome': p.biomeVersion,
    turbo: p.turboVersion,
  };
  if (p.hooks) {
    if (p.huskyVersion) devDependencies.husky = p.huskyVersion;
    if (p.lintStagedVersion) devDependencies['lint-staged'] = p.lintStagedVersion;
    if (p.commitlintCliVersion) devDependencies['@commitlint/cli'] = p.commitlintCliVersion;
    if (p.commitlintConfigVersion) {
      devDependencies['@commitlint/config-conventional'] = p.commitlintConfigVersion;
    }
  }
  const pkg = {
    name: p.name,
    version: '0.1.0',
    description: p.description,
    author: p.author,
    private: true,
    type: 'module',
    packageManager: p.packageManagerPin,
    engines: { node: p.nodeEngine, pnpm: '>=11.0.0' },
    scripts: {
      dev: 'turbo run dev',
      build: 'turbo run build',
      start: 'turbo run start',
      lint: 'turbo run lint',
      'lint:fix': 'biome check --write . && turbo run lint:fix',
      'ci:check': 'biome ci . && turbo run ci:check',
      'type-check': 'turbo run type-check',
      'check:deprecated': 'turbo run check:deprecated',
      test: 'turbo run test',
      'test:e2e': 'turbo run test:e2e',
      validate:
        'pnpm ci:check && pnpm type-check && pnpm check:deprecated && pnpm test && pnpm build',
      ...(p.hooks ? { prepare: 'husky', 'lint-staged': 'lint-staged' } : {}),
    },
    devDependencies: Object.fromEntries(Object.entries(devDependencies).sort()),
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
};

export const pnpmWorkspaceYaml = (starterYaml: string): string => {
  // Reuse the starter's supply-chain settings (minimumReleaseAge, allowBuilds)
  // and point `packages` at the workspace layout.
  const body = starterYaml
    .split('\n')
    .filter(
      (line) =>
        !line.startsWith('packages:') &&
        !line.startsWith('# Single-package') &&
        !line.startsWith('# Monorepo mode'),
    )
    .join('\n')
    .trim();
  return `packages:\n  - 'apps/*'\n  - 'packages/*'\n\n${body}\n`;
};

export const turboJson = (): string =>
  `${JSON.stringify(
    {
      $schema: 'https://turborepo.com/schema.json',
      ui: 'tui',
      globalEnv: ['NODE_ENV', 'CI'],
      globalPassThroughEnv: [
        'NEXT_PUBLIC_*',
        'API_INTERNAL_URL',
        'CSP_MODE',
        'BUILD_STANDALONE',
        'DEFAULT_TIMEZONE',
        'DEFAULT_LOCALE',
        'NEXT_TELEMETRY_DISABLED',
      ],
      tasks: {
        build: {
          dependsOn: ['^build'],
          inputs: ['$TURBO_DEFAULT$', '.env.production', '.env'],
          outputs: ['.next/**', '!.next/cache/**'],
        },
        dev: { cache: false, persistent: true },
        start: { cache: false, persistent: true, dependsOn: ['build'] },
        lint: {},
        'lint:fix': { cache: false },
        'ci:check': {},
        'type-check': { dependsOn: ['^build'] },
        'check:deprecated': { dependsOn: ['^build'] },
        test: { dependsOn: ['^build'], outputs: ['coverage/**'] },
        'test:e2e': { dependsOn: ['build'], cache: false },
      },
    },
    null,
    2,
  )}\n`;

export const rootBiomeJson = (biomeVersion: string): string =>
  `${JSON.stringify(
    {
      $schema: `https://biomejs.dev/schemas/${biomeVersion.replace(/^[\^~]/, '')}/schema.json`,
      vcs: { enabled: true, clientKind: 'git', useIgnoreFile: true },
      files: { includes: ['*.json', '*.mjs', '*.ts', '.github/**', '!apps', '!packages'] },
      formatter: {
        enabled: true,
        indentStyle: 'space',
        indentWidth: 2,
        lineWidth: 100,
        lineEnding: 'lf',
      },
      javascript: {
        formatter: { quoteStyle: 'single', semicolons: 'always', trailingCommas: 'all' },
      },
      json: { formatter: { trailingCommas: 'none' } },
      linter: { enabled: true, rules: { preset: 'recommended' } },
    },
    null,
    2,
  )}\n`;

export const rootGitignore = (): string => `# dependencies
node_modules
.pnpm-store

# turborepo
.turbo

# build and test output
.next
out
coverage
test-results
playwright-report
.vitest
*.tsbuildinfo
next-env.d.ts

# env
.env
.env.*.local

# misc
.DS_Store
*.pem
npm-debug.log*
.pnpm-debug.log*
`;

export const rootReadme = (
  p: WorkspaceTemplateParams,
  starterVersion: string,
): string => `# ${p.name}

${p.description}

A pnpm + Turborepo workspace. Each app under \`apps/\` was generated from [@teispace/nextjs-starter](https://github.com/teispace/nextjs-starter) ${starterVersion} with \`@teispace/next-maker\`; shared code goes under \`packages/\`.

\`\`\`
${p.name}/
  apps/
${p.apps.map((a) => `    ${a}/`).join('\n')}
  packages/            shared libraries (see below)
  turbo.json           task graph and caching
  pnpm-workspace.yaml  workspace members and install policy
\`\`\`

## Getting started

\`\`\`bash
pnpm install
pnpm dev                       # every app
pnpm --filter ${p.apps[0]} dev   # one app
\`\`\`

Each app reads its own \`.env\` (copy \`apps/<app>/.env.example\`). Ports: set \`PORT\` per app (\`PORT=3001 pnpm --filter ${p.apps[1] ?? p.apps[0]} dev\`).

## Scripts

| Script | Purpose |
| :-- | :-- |
| \`pnpm build\` | build every app (Turborepo caches unchanged apps) |
| \`pnpm lint\` / \`pnpm ci:check\` | Biome per app and at the root |
| \`pnpm type-check\`, \`pnpm check:deprecated\`, \`pnpm test\`, \`pnpm test:e2e\` | per-app gates through Turborepo |
| \`pnpm validate\` | everything CI runs |

## Adding a shared package

\`\`\`bash
mkdir -p packages/ui && cd packages/ui
pnpm init                                   # name it @${p.name}/ui, "type": "module"
cd ../../apps/${p.apps[0]} && pnpm add @${p.name}/ui --workspace
\`\`\`

Give the package a \`build\` script (or point \`exports\` at TypeScript sources and add it to \`transpilePackages\` in the app's \`next.config.ts\`). Turborepo runs \`^build\` before an app builds.

## Adding an app

\`\`\`bash
cd apps && npx @teispace/next-maker init <name> --yes --set hooks=false --set commitizen=false --set ci=false --set docker=false --no-git
\`\`\`

Git hooks, CI, and Docker live at the workspace root; apps keep their own tests, lint, and type-check.

## Docker

Build one app with Turborepo's pruned context so the image only contains that app and its workspace dependencies:

\`\`\`bash
pnpm turbo prune ${p.apps[0]} --docker
# then build from ./out with a Dockerfile that installs from out/json and copies out/full
\`\`\`

## Maintenance

\`cd apps/<app> && npx @teispace/next-maker doctor --compile\` checks an app against the starter; \`setup --set <option>=<value>\` changes its features.
`;

export const rootCiYaml = (): string => `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: \${{ github.ref != 'refs/heads/main' }}

env:
  NEXT_PUBLIC_APP_URL: https://ci.example.com
  NEXT_TELEMETRY_DISABLED: 1
  TURBO_TELEMETRY_DISABLED: 1

jobs:
  validate:
    name: Lint, types, tests, build
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Restore Turborepo cache
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-\${{ runner.os }}-\${{ github.sha }}
          restore-keys: |
            turbo-\${{ runner.os }}-
      - run: pnpm ci:check
      - run: pnpm type-check
      - run: pnpm check:deprecated
      - run: pnpm test
      - run: pnpm build
`;

export const rootLintStaged = (): string => `const config = {
  '*': ['biome check --write --no-errors-on-unmatched --files-ignore-unknown=true'],
};

export default config;
`;

export const rootCommitlint = (): string => `const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 150],
    'scope-enum': [0],
  },
};

export default config;
`;

export const rootHusky = (): Record<string, string> => ({
  'pre-commit': `#!/usr/bin/env sh
pnpm lint-staged
`,
  'commit-msg': `#!/usr/bin/env sh
pnpm exec commitlint --edit "$1"
`,
  'pre-push': `#!/usr/bin/env sh
pnpm ci:check && pnpm type-check && pnpm check:deprecated && pnpm test
`,
});
