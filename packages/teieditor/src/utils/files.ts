/**
 * Whether a file matches an `accept` list as `<input type="file">` reads one:
 * MIME types (`image/png`), wildcards (`image/*`) and extensions (`.pdf`),
 * comma-separated or as an array. An empty list accepts everything.
 */
export function acceptsFile(
  file: Pick<File, 'name' | 'type'>,
  accept: string | readonly string[],
): boolean {
  const rules = (typeof accept === 'string' ? accept.split(',') : accept)
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

/** A file's contents as a `data:` URL, with progress from 0 to 1. */
export function readAsDataURL(
  file: Blob,
  { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    signal?.addEventListener('abort', abort, { once: true });
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.onabort = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    reader.onloadend = () => signal?.removeEventListener('abort', abort);
    reader.readAsDataURL(file);
  });
}

/**
 * Open the browser's file chooser and resolve with what was picked (empty
 * when cancelled, where the browser says so). Call it from a click: browsers
 * open choosers only for a user's gesture.
 */
export function chooseFiles(
  doc: Document,
  { accept = '', multiple = false }: { accept?: string; multiple?: boolean } = {},
): Promise<File[]> {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}
