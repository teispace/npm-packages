/**
 * Aliases a code block may carry, mapped to the name the toolbar shows. The
 * same table `@lexical/code-prism` uses, kept here so reading a block's
 * language does not depend on where Lexical keeps its Prism data.
 *
 * A `Map`, not an object literal: the name comes from the document, and an
 * object would read `constructor` back as `Object.prototype.constructor`.
 */
const CODE_LANGUAGE_ALIASES: ReadonlyMap<string, string> = new Map([
  ['cpp', 'cpp'],
  ['golang', 'go'],
  ['java', 'java'],
  ['javascript', 'js'],
  ['md', 'markdown'],
  ['plaintext', 'plain'],
  ['python', 'py'],
  ['text', 'plain'],
  ['ts', 'typescript'],
]);

/** The display name for a code block's language. */
export const codeLanguageLabel = (language: string | null | undefined): string =>
  language ? (CODE_LANGUAGE_ALIASES.get(language) ?? language) : 'javascript';
