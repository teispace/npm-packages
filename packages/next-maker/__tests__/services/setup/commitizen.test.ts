import { describe, expect, it } from 'vitest';
import {
  addCommitizen,
  missingCommitizenDeps,
  type PackageJsonShape,
} from '../../../src/services/setup/commitizen/package-modifier';

const empty = (): PackageJsonShape => ({ scripts: {}, devDependencies: {} });

describe('addCommitizen', () => {
  it('adds the commit script and required dev deps', () => {
    const pkg = addCommitizen(empty());
    expect(pkg.scripts?.commit).toBe('cz');
    expect(pkg.devDependencies?.commitizen).toBeDefined();
    expect(pkg.devDependencies?.['cz-conventional-changelog']).toBeDefined();
  });

  it('does not overwrite a user-defined `commit` script', () => {
    const pkg = addCommitizen({ scripts: { commit: 'echo override' } });
    expect(pkg.scripts?.commit).toBe('echo override');
  });

  it('does not re-pin existing dev dep versions', () => {
    const pkg = addCommitizen({
      devDependencies: { commitizen: '4.2.0', 'cz-conventional-changelog': '3.0.0' },
    });
    expect(pkg.devDependencies?.commitizen).toBe('4.2.0');
    expect(pkg.devDependencies?.['cz-conventional-changelog']).toBe('3.0.0');
  });

  it('does not mutate the input', () => {
    const input = empty();
    addCommitizen(input);
    expect(input.scripts).toEqual({});
    expect(input.devDependencies).toEqual({});
  });

  it('is idempotent', () => {
    const once = addCommitizen(empty());
    const twice = addCommitizen(once);
    expect(twice).toEqual(once);
  });
});

describe('missingCommitizenDeps', () => {
  it('reports both deps when nothing is installed', () => {
    expect(missingCommitizenDeps({})).toEqual(['commitizen', 'cz-conventional-changelog']);
  });

  it('reports only what is missing', () => {
    const result = missingCommitizenDeps({
      devDependencies: { commitizen: '4.0.0' },
    });
    expect(result).toEqual(['cz-conventional-changelog']);
  });

  it('reports nothing when both deps are installed', () => {
    const result = missingCommitizenDeps({
      devDependencies: { commitizen: '4.0.0', 'cz-conventional-changelog': '3.0.0' },
    });
    expect(result).toEqual([]);
  });
});
