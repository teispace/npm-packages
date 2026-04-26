import { describe, expect, it } from 'vitest';
import {
  addValidationScripts,
  type PackageJsonShape,
} from '../../../src/services/setup/validate-scripts/package-modifier';

const empty = (): PackageJsonShape => ({ scripts: {}, devDependencies: {} });

describe('addValidationScripts', () => {
  it('adds env:sync, check:deprecated, type-check, validate, and tsx', () => {
    const pkg = addValidationScripts(empty(), 'yarn');
    expect(pkg.scripts).toMatchObject({
      'env:sync': 'tsx scripts/sync-env.ts',
      'check:deprecated': 'tsx scripts/check-deprecated.ts',
      'type-check': 'tsc --noEmit',
    });
    expect(pkg.devDependencies?.tsx).toBeDefined();
  });

  it('emits the validate chain in the right order', () => {
    const pkg = addValidationScripts(empty(), 'yarn');
    expect(pkg.scripts?.validate).toBe(
      'yarn ci:check && yarn type-check && yarn check:deprecated && yarn test && yarn build',
    );
  });

  it.each([
    'npm',
    'yarn',
    'pnpm',
    'bun',
  ] as const)('uses the %s runner prefix in the validate chain', (manager) => {
    const pkg = addValidationScripts(empty(), manager);
    const expectedPrefix = manager === 'npm' ? 'npm run' : manager === 'bun' ? 'bun run' : manager;
    expect(pkg.scripts?.validate).toContain(`${expectedPrefix} ci:check`);
    expect(pkg.scripts?.validate).toContain(`${expectedPrefix} build`);
  });

  it('does not overwrite user-defined script entries', () => {
    const original: PackageJsonShape = {
      scripts: {
        'env:sync': 'node scripts/my-sync.js',
        validate: 'echo custom',
      },
      devDependencies: { tsx: '4.0.0' },
    };
    const pkg = addValidationScripts(original, 'pnpm');
    expect(pkg.scripts?.['env:sync']).toBe('node scripts/my-sync.js');
    expect(pkg.scripts?.validate).toBe('echo custom');
  });

  it('does not re-pin tsx if it already exists in devDependencies', () => {
    const pkg = addValidationScripts({ devDependencies: { tsx: '4.7.0' } }, 'npm');
    expect(pkg.devDependencies?.tsx).toBe('4.7.0');
  });

  it('does not add tsx to devDependencies if it lives in dependencies', () => {
    const pkg = addValidationScripts({ dependencies: { tsx: '4.7.0' } } as PackageJsonShape, 'npm');
    expect(pkg.devDependencies?.tsx).toBeUndefined();
  });

  it('returns a fresh object — input is not mutated', () => {
    const input = empty();
    addValidationScripts(input, 'npm');
    expect(input.scripts).toEqual({});
    expect(input.devDependencies).toEqual({});
  });

  it('is idempotent — second pass yields the same shape', () => {
    const once = addValidationScripts(empty(), 'pnpm');
    const twice = addValidationScripts(once, 'pnpm');
    expect(twice.scripts).toEqual(once.scripts);
    expect(twice.devDependencies).toEqual(once.devDependencies);
  });
});
