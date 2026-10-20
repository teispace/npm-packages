import { describe, expect, it } from 'vitest';
import { codeLanguageLabel } from '../../src/utils/code-language';

describe('codeLanguageLabel', () => {
  it('maps the aliases a code block may carry', () => {
    expect(codeLanguageLabel('javascript')).toBe('js');
    expect(codeLanguageLabel('golang')).toBe('go');
    expect(codeLanguageLabel('text')).toBe('plain');
  });

  it('passes an unknown language through and defaults an absent one', () => {
    expect(codeLanguageLabel('rust')).toBe('rust');
    expect(codeLanguageLabel(null)).toBe('javascript');
    expect(codeLanguageLabel('')).toBe('javascript');
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'treats %s as a language name, not an Object.prototype member',
    (name) => {
      expect(codeLanguageLabel(name)).toBe(name);
    },
  );
});
