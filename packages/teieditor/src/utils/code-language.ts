/** A code language for a picker: its id on the block, and the name people read. */
export type CodeLanguage = readonly [id: string, label: string];

/**
 * The languages Lexical's Prism highlighter colours, by the ids it uses.
 * Kept here so a picker does not have to load Prism to list them.
 */
export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  ['c', 'C'],
  ['cpp', 'C++'],
  ['css', 'CSS'],
  ['go', 'Go'],
  ['html', 'HTML'],
  ['java', 'Java'],
  ['js', 'JavaScript'],
  ['markdown', 'Markdown'],
  ['objc', 'Objective-C'],
  ['powershell', 'PowerShell'],
  ['py', 'Python'],
  ['rust', 'Rust'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['typescript', 'TypeScript'],
  ['xml', 'XML'],
];

/**
 * Other names a block may carry (from a markdown fence, a paste, an older
 * document), mapped to the ids above. A `Map`, not an object literal: the
 * name comes from the document, and an object would read `constructor`
 * back as `Object.prototype.constructor`.
 */
const ALIASES: ReadonlyMap<string, string> = new Map([
  ['c++', 'cpp'],
  ['golang', 'go'],
  ['javascript', 'js'],
  ['jsx', 'js'],
  ['md', 'markdown'],
  ['markup', 'html'],
  ['objectivec', 'objc'],
  ['plaintext', 'plain'],
  ['ps1', 'powershell'],
  ['python', 'py'],
  ['rs', 'rust'],
  ['text', 'plain'],
  ['ts', 'typescript'],
  ['tsx', 'typescript'],
]);

/** A block's language in the ids above; `null` for plain text. */
export function normalizeLanguage(language: string | null | undefined): string | null {
  if (!language) return null;
  const id = language.toLowerCase();
  const known = ALIASES.get(id) ?? id;
  return known === 'plain' ? null : known;
}

/** The name to show for a block's language: from `languages`, or the id itself. */
export function codeLanguageLabel(
  language: string | null | undefined,
  languages: readonly CodeLanguage[] = CODE_LANGUAGES,
): string | null {
  const id = normalizeLanguage(language);
  if (!id) return null;
  return languages.find(([known]) => normalizeLanguage(known) === id)?.[1] ?? id;
}
