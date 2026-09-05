import type { PackageManager } from '../core/package-manager';

/**
 * Rewrite pnpm invocations for another package manager. Applied to
 * `package.json` scripts, git hooks, and Markdown; Dockerfiles and CI
 * workflows come from per-manager overlays instead because their setup
 * steps differ structurally.
 */
export const runCommand = (pm: PackageManager, script: string): string => {
  switch (pm) {
    case 'npm':
      return `npm run ${script}`;
    case 'bun':
      return `bun run ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    default:
      return `pnpm ${script}`;
  }
};

const rules = (pm: PackageManager): [RegExp, string][] => {
  switch (pm) {
    case 'npm':
      return [
        [/\bpnpm install --frozen-lockfile\b/g, 'npm ci'],
        [/\bpnpm install\b/g, 'npm install'],
        [/\bpnpm add -D\b/g, 'npm install --save-dev'],
        [/\bpnpm add\b/g, 'npm install'],
        [/\bpnpm dlx\b/g, 'npx'],
        [/\bpnpm exec\b/g, 'npx --no --'],
        [/\bpnpm ([\w:.-]+)/g, 'npm run $1'],
      ];
    case 'yarn':
      return [
        [/\bpnpm install --frozen-lockfile\b/g, 'yarn install --immutable'],
        [/\bpnpm install\b/g, 'yarn install'],
        [/\bpnpm add -D\b/g, 'yarn add -D'],
        [/\bpnpm add\b/g, 'yarn add'],
        [/\bpnpm dlx\b/g, 'yarn dlx'],
        [/\bpnpm exec\b/g, 'yarn'],
        [/\bpnpm ([\w:.-]+)/g, 'yarn $1'],
      ];
    case 'bun':
      return [
        [/\bpnpm install --frozen-lockfile\b/g, 'bun install --frozen-lockfile'],
        [/\bpnpm install\b/g, 'bun install'],
        [/\bpnpm add -D\b/g, 'bun add -d'],
        [/\bpnpm add\b/g, 'bun add'],
        [/\bpnpm dlx\b/g, 'bunx'],
        [/\bpnpm exec\b/g, 'bunx'],
        [/\bpnpm ([\w:.-]+)/g, 'bun run $1'],
      ];
    default:
      return [];
  }
};

export const rewritePackageManagerCommands = (text: string, pm: PackageManager): string => {
  if (pm === 'pnpm') return text;
  let out = text;
  for (const [re, replacement] of rules(pm)) out = out.replace(re, replacement);
  return out;
};

/** Files whose text mentions package-manager commands and ships in projects. */
export const isCommandCarrier = (file: string): boolean =>
  file === 'package.json' ||
  file.startsWith('.husky/') ||
  file.endsWith('.md') ||
  file === '.lintstagedrc.mjs';
