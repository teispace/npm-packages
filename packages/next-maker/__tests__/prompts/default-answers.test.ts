import { describe, expect, it } from 'vitest';
import { defaultProjectAnswers } from '../../src/prompts/create-app.prompt';

describe('defaultProjectAnswers', () => {
  it('uses the initial name when no override is provided', () => {
    const answers = defaultProjectAnswers('my-app');
    expect(answers.projectName).toBe('my-app');
  });

  it('falls back to "my-app" when no name is provided', () => {
    const answers = defaultProjectAnswers(undefined);
    expect(answers.projectName).toBe('my-app');
  });

  it('opts in to every architecture feature by default', () => {
    const answers = defaultProjectAnswers('app');
    expect(answers.darkMode).toBe(true);
    expect(answers.redux).toBe(true);
    expect(answers.i18n).toBe(true);
    expect(answers.tests).toBe(true);
    expect(answers.reactCompiler).toBe(true);
    expect(answers.preCommitHooks).toBe(true);
    expect(answers.commitizen).toBe(true);
    expect(answers.copyEnv).toBe(true);
    expect(answers.readme).toBe(true);
    expect(answers.httpClient).toBe('fetch');
  });

  it('keeps heavyweight integrations off by default', () => {
    const answers = defaultProjectAnswers('app');
    expect(answers.docker).toBe(false);
    expect(answers.ci).toBe(false);
    expect(answers.bundleAnalyzer).toBe(false);
    expect(answers.communityFiles).toEqual([]);
    expect(answers.gitRemote).toBe('');
    expect(answers.pushToRemote).toBe(false);
  });

  it('mirrors author into company', () => {
    const answers = defaultProjectAnswers('app', { author: 'Acme' });
    expect(answers.company).toBe('Acme');
  });

  it('honours overrides for individual fields', () => {
    const answers = defaultProjectAnswers('app', {
      packageManager: 'pnpm',
      i18n: false,
      bundleAnalyzer: true,
      author: 'Acme',
      version: '1.2.3',
    });
    expect(answers.packageManager).toBe('pnpm');
    expect(answers.i18n).toBe(false);
    expect(answers.bundleAnalyzer).toBe(true);
    expect(answers.author).toBe('Acme');
    expect(answers.version).toBe('1.2.3');
  });

  it('rejects an invalid project name', () => {
    expect(() => defaultProjectAnswers('My App')).toThrow(/Invalid project name/);
    expect(() => defaultProjectAnswers('app/with/slash')).toThrow(/Invalid project name/);
  });

  it('rejects an invalid version override', () => {
    expect(() => defaultProjectAnswers('app', { version: 'v1' })).toThrow(/Invalid version/);
  });
});
