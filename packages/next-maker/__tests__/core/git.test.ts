import { describe, expect, it } from 'vitest';
import { assertValidRemote } from '../../src/core/git';

describe('assertValidRemote', () => {
  it('accepts valid https / ssh / shorthand remotes', () => {
    for (const ok of [
      'https://github.com/teispace/app.git',
      'http://example.com/repo',
      'git@github.com:teispace/app.git',
      'ssh://git@host/repo.git',
      'teispace/app',
    ]) {
      expect(() => assertValidRemote(ok)).not.toThrow();
    }
  });

  it('rejects shell-injection and malformed remotes', () => {
    for (const bad of [
      'origin; rm -rf $HOME',
      'https://x && curl evil',
      '`whoami`',
      '$(rm -rf /)',
      '--upload-pack=evil',
      '-oProxyCommand=evil',
      '',
      '   ',
      'has spaces in it',
    ]) {
      expect(() => assertValidRemote(bad)).toThrow();
    }
  });
});
