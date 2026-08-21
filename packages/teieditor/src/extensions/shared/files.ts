/**
 * File/clipboard helpers shared by the extensions that accept dropped or
 * pasted files (`image`, `drag-drop-paste`).
 *
 * Internal: this module is deliberately NOT re-exported from `src/utils/index.ts`
 * or any tsup entry. It is bundled into whichever chunks import it, so sharing
 * it costs nothing in the published surface.
 */

import type { PasteCommandType } from 'lexical';

/**
 * Read a File as a base64 data URL. Used as the fallback when no `onUpload`
 * handler is supplied, so an image still renders without a server round-trip.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Extract a non-empty `FileList` from a `PASTE_COMMAND` payload.
 *
 * `PASTE_COMMAND` is `LexicalCommand<ClipboardEvent | InputEvent | KeyboardEvent>`
 * and only `ClipboardEvent` carries `clipboardData`. Both call sites previously
 * declared their handler as `(event: ClipboardEvent)`, which type-checked only
 * because `LexicalCommand<T>` was covariant before Lexical 0.49 — at runtime an
 * `InputEvent` payload would have read `undefined`. Lexical 0.49 made the
 * command payload invariant, turning that latent unsoundness into a compile
 * error; narrowing here fixes it for real instead of casting it away.
 *
 * Returns `null` when the event carries no files, so callers can bail with a
 * single falsy check.
 */
export function getPastedFiles(event: PasteCommandType): FileList | null {
  // Only ClipboardEvent declares `clipboardData`, so the `in` check narrows the
  // union without a cast.
  if (!('clipboardData' in event)) return null;
  const files = event.clipboardData?.files;
  return files && files.length > 0 ? files : null;
}

/**
 * Extract a non-empty `FileList` from a `DROP_COMMAND` payload.
 *
 * Mirrors {@link getPastedFiles} so both call sites read the same way.
 */
export function getDroppedFiles(event: DragEvent): FileList | null {
  const files = event.dataTransfer?.files;
  return files && files.length > 0 ? files : null;
}
