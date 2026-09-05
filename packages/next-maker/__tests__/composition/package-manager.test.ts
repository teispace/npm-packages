import { describe, expect, it } from 'vitest';
import { rewritePackageManagerCommands, runCommand } from '../../src/composition/package-manager';

describe('rewritePackageManagerCommands', () => {
  const hook =
    'pnpm exec commitlint --edit "$1"\npnpm ci:check && pnpm type-check\npnpm install --frozen-lockfile';

  it('rewrites for npm', () => {
    expect(rewritePackageManagerCommands(hook, 'npm')).toBe(
      'npx --no -- commitlint --edit "$1"\nnpm run ci:check && npm run type-check\nnpm ci',
    );
  });

  it('rewrites for yarn and bun', () => {
    expect(rewritePackageManagerCommands('pnpm dlx shadcn@latest init', 'yarn')).toBe(
      'yarn dlx shadcn@latest init',
    );
    expect(rewritePackageManagerCommands('pnpm add -D vitest', 'bun')).toBe('bun add -d vitest');
    expect(rewritePackageManagerCommands('pnpm test:e2e', 'bun')).toBe('bun run test:e2e');
  });

  it('leaves pnpm untouched', () => {
    expect(rewritePackageManagerCommands(hook, 'pnpm')).toBe(hook);
    expect(runCommand('pnpm', 'build')).toBe('pnpm build');
    expect(runCommand('npm', 'build')).toBe('npm run build');
  });
});
