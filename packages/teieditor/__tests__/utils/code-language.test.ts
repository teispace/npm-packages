import { getCodeLanguageOptions } from '@lexical/code-prism';
import { describe, expect, it } from 'vitest';
import {
  CODE_LANGUAGES,
  codeLanguageLabel,
  normalizeLanguage,
} from '../../src/utils/code-language';

describe('code languages', () => {
  it('lists what Prism colours, by the same ids', () => {
    const prism = getCodeLanguageOptions()
      .map(([id]) => id)
      .filter((id) => id !== 'plain' && id !== 'clike');
    expect(CODE_LANGUAGES.map(([id]) => id)).toEqual(prism);
  });

  it('reads aliases as the ids, and plain text as none', () => {
    expect(normalizeLanguage('javascript')).toBe('js');
    expect(normalizeLanguage('Python')).toBe('py');
    expect(normalizeLanguage('text')).toBeNull();
    expect(normalizeLanguage('plain')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage('rust')).toBe('rust');
  });

  it('names a language from the list, or by its id', () => {
    expect(codeLanguageLabel('ts')).toBe('TypeScript');
    expect(codeLanguageLabel('golang')).toBe('Go');
    expect(codeLanguageLabel('elixir')).toBe('elixir');
    expect(codeLanguageLabel(null)).toBeNull();
    expect(codeLanguageLabel('js', [['javascript', 'JS']])).toBe('JS');
  });

  it('never reads a language from the prototype', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(normalizeLanguage(name)).toBe(name.toLowerCase());
    }
  });
});
