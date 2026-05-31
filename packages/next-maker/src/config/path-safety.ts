import path from 'node:path';

/**
 * Shared guards for user-supplied names and paths. A code-scaffolding CLI joins
 * these onto the project root and writes files there, so an unvalidated value
 * like `../../etc` or an absolute path can escape the project and clobber
 * arbitrary files. Every generator must validate before joining.
 */

/**
 * A single path segment (component/hook/slice/service/page name).
 * The charclass excludes `/`, `\`, `.`, and all non-ASCII, so no segment can
 * be `..`, contain a separator, or carry an encoded/homoglyph traversal — this
 * is the load-bearing guard.
 */
const SEGMENT_RE = /^[A-Za-z][A-Za-z0-9-]*$/;

/**
 * Windows reserved device names. Harmless on macOS/Linux, but a file/dir named
 * `con`/`nul`/`com1` is special-cased by Windows and breaks writes, so reject
 * them everywhere for portable output.
 */
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function isReserved(segment: string): boolean {
  return WINDOWS_RESERVED_RE.test(segment);
}

/**
 * Assert a name is a single safe segment. Rejects empty, path separators,
 * `..`, absolute paths, Windows reserved names, and anything outside
 * kebab/camel-case word characters.
 *
 * @throws Error with an actionable message when invalid.
 */
export function assertSafeSegment(name: string, label = 'name'): string {
  const value = name?.trim();
  if (!value) {
    throw new Error(`A ${label} is required.`);
  }
  if (!SEGMENT_RE.test(value)) {
    throw new Error(
      `Invalid ${label} "${name}". Use letters, digits, and hyphens only — ` +
        'no slashes, spaces, "..", or absolute paths.',
    );
  }
  if (isReserved(value)) {
    throw new Error(`Invalid ${label} "${name}". That is a reserved name on Windows.`);
  }
  return value;
}

/**
 * Assert a relative path is a safe, slash-separated list of segments. Used for
 * `--path` / `--feature`. Rejects absolute paths, drive letters, and any
 * segment that isn't a valid `SEGMENT_RE` (which inherently rules out `..`,
 * dots, backslashes, and non-ASCII — so there is no need for a separate,
 * over-broad `includes('..')` check that would also reject legitimate names
 * like `foo..bar`).
 *
 * @throws Error with an actionable message when invalid.
 */
export function assertSafeRelativePath(relPath: string, label = 'path'): string {
  const value = relPath?.trim();
  if (!value) {
    throw new Error(`A ${label} is required.`);
  }
  // Allow an optional leading `./`, then segments.
  const normalized = value.replace(/^\.\//, '');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(
      `Invalid ${label} "${relPath}". Must be a relative path inside the project ` +
        '(no leading "/" or drive letter).',
    );
  }
  for (const seg of normalized.split('/')) {
    if (!SEGMENT_RE.test(seg)) {
      throw new Error(
        `Invalid ${label} "${relPath}". Each segment must be kebab/camel-case ` +
          '(letters, digits, hyphens), separated by "/" — no "..", dots, or empty segments.',
      );
    }
    if (isReserved(seg)) {
      throw new Error(`Invalid ${label} "${relPath}". Segment "${seg}" is reserved on Windows.`);
    }
  }
  return normalized;
}

/**
 * Resolve `relativePath` against `root` and guarantee the result stays inside
 * `root`. This is the last line of defense even after segment validation —
 * symlinks or unusual inputs can still escape, so callers that build a final
 * write path should resolve through here.
 *
 * @throws Error if the resolved path escapes `root`.
 */
export function resolveInside(root: string, ...relativeParts: string[]): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...relativeParts);
  const rel = path.relative(resolvedRoot, target);
  if (rel === '' || rel === '.') return target;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `Refusing to write outside the project directory (resolved path escapes "${resolvedRoot}").`,
    );
  }
  return target;
}
