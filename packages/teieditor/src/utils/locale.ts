import type { LexicalEditor } from 'lexical';

/** A language tag `Intl` accepts, else `undefined` (the runtime's own). */
export function validLocale(tag: string | null | undefined): string | undefined {
  if (!tag) return undefined;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(tag).length > 0 ? tag : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The language a document is shown in: `preferred` when it is one, else the
 * nearest `lang` round the editor, else the browser's.
 */
export function editorLocale(
  lexical: LexicalEditor | null | undefined,
  preferred?: string | null,
): string | undefined {
  return (
    validLocale(preferred) ??
    validLocale(lexical?.getRootElement()?.closest('[lang]')?.getAttribute('lang'))
  );
}
