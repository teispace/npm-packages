import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists, readFile, writeFile } from '../../../core/files';

const execFileAsync = promisify(execFile);

/**
 * Run `grep` over a directory via `execFile` (argv array, NO shell). Passing the
 * pattern and path as separate arguments means a project path containing shell
 * metacharacters — e.g. a checkout at `/tmp/$(rm -rf ~)/app` — can never be
 * interpreted by a shell, closing the command-injection hole the previous
 * string-interpolated `exec("grep ... \"${srcPath}\"")` left open. grep exits 1
 * when there are no matches (not an error here), so we treat a code-1 failure
 * with empty stderr as "no matches" and return an empty string.
 *
 * @param pattern    grep BRE pattern (already regex-escaped by the caller)
 * @param dir        directory to search recursively
 * @param extraFlags grep flags before the pattern (e.g. ['-r', '-l'])
 */
async function grepFiles(pattern: string, dir: string, extraFlags: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('grep', [
      ...extraFlags,
      '--include=*.ts',
      '--include=*.tsx',
      pattern,
      dir,
    ]);
    return stdout;
  } catch (error) {
    // grep returns exit code 1 for "no matches" — surfaced by execFile as an
    // error with code === 1. That is a normal empty result, not a failure.
    const code = (error as { code?: number }).code;
    if (code === 1) return '';
    throw error;
  }
}

export const updateHttpIndex = async (
  projectPath: string,
  clients: ('fetch' | 'axios')[],
): Promise<void> => {
  const httpIndexPath = path.join(projectPath, PROJECT_PATHS.HTTP_UTILS, 'index.ts');
  if (fileExists(httpIndexPath)) {
    let content = await readFile(httpIndexPath);

    // Remove all client exports first
    content = content.replace(/export .* from '\.\/axios-client';?\n?/g, '');
    content = content.replace(/export .* from '\.\/fetch-client';?\n?/g, '');

    // Add exports for active clients
    if (clients.includes('fetch') && !content.includes('fetch-client')) {
      content += "export * from './fetch-client';\n";
    }
    if (clients.includes('axios') && !content.includes('axios-client')) {
      content += "export * from './axios-client';\n";
    }

    await writeFile(httpIndexPath, content);
  }
};

export const updateUtilsIndex = async (projectPath: string): Promise<void> => {
  const utilsIndexPath = path.join(projectPath, PROJECT_PATHS.UTILS_INDEX);
  if (fileExists(utilsIndexPath)) {
    let content = await readFile(utilsIndexPath);
    if (!content.includes('./http')) {
      content += "export * from './http';\n";
      await writeFile(utilsIndexPath, content);
    }
  }
};

export const updateTypesIndex = async (projectPath: string): Promise<void> => {
  const typesIndexPath = path.join(projectPath, PROJECT_PATHS.TYPES_INDEX);
  if (fileExists(typesIndexPath)) {
    let content = await readFile(typesIndexPath);
    if (!content.includes('./common')) {
      content += "export * from './common';\n";
    }
    if (!content.includes('./utility')) {
      content += "export * from './utility';\n";
    }
    await writeFile(typesIndexPath, content);
  }
};

export const updateConfigIndex = async (projectPath: string): Promise<void> => {
  const configIndexPath = path.join(projectPath, PROJECT_PATHS.CONFIG_INDEX);
  if (fileExists(configIndexPath)) {
    let content = await readFile(configIndexPath);
    if (!content.includes('./app-apis')) {
      content += "export * from './app-apis';\n";
      await writeFile(configIndexPath, content);
    }
  }
};

export const cleanupHttpTypes = async (
  projectPath: string,
  clients: ('fetch' | 'axios')[],
): Promise<void> => {
  const httpTypesPath = path.join(projectPath, PROJECT_PATHS.HTTP_TYPES);
  if (fileExists(httpTypesPath)) {
    let content = await readFile(httpTypesPath);

    // If axios is NOT in clients, remove the axios module declaration
    if (!clients.includes('axios')) {
      // Remove declare module 'axios' { ... } block
      // Matches: declare module 'axios' { export interface AxiosRequestConfig { ... } }
      content = content.replace(
        /declare module 'axios'\s*\{\s*export interface AxiosRequestConfig\s*\{[\s\S]*?\}\s*\}/g,
        '',
      );
      // Clean up any double newlines left behind
      content = `${content.replace(/\n\s*\n/g, '\n\n').trim()}\n`;
      await writeFile(httpTypesPath, content);
    }
  }
};

/**
 * Pure helper: strip the `SAVE_AUTH_TOKENS` declaration from a `constants.ts`
 * source string, tolerant to the two shapes the template has shipped:
 *
 *   1) legacy plain literal — `export const SAVE_AUTH_TOKENS = false;`
 *   2) current computed form — a JSDoc block, a `const BEARER_ALLOWED_ENVS =
 *      new Set([...])` line, and `export const SAVE_AUTH_TOKENS =
 *      BEARER_ALLOWED_ENVS.has(env.NODE_ENV);`
 *
 * The computed form derives auth mode from NODE_ENV (see the template's
 * deep-audit hardening). When HTTP is removed we must drop the whole unit —
 * the export, its `BEARER_ALLOWED_ENVS` backing const, and the explanatory
 * JSDoc — or the orphaned `BEARER_ALLOWED_ENVS` triggers an unused-var lint
 * error. Anchored on stable code tokens (`SAVE_AUTH_TOKENS`,
 * `BEARER_ALLOWED_ENVS`), not comment wording, so upstream comment drift
 * won't silently break it. Idempotent — a no-op when no declaration exists.
 */
export const stripSaveAuthTokens = (content: string): string => {
  let next = content;

  // 1. Drop the JSDoc block immediately preceding the `BEARER_ALLOWED_ENVS`
  //    const (computed form only). Anchored structurally — "the doc-comment
  //    that sits right above BEARER_ALLOWED_ENVS" — rather than on its
  //    wording, so upstream rephrasing of the comment can't leave it orphaned.
  next = next.replace(
    /\/\*\*(?:[^*]|\*(?!\/))*?\*\/\n(?=(?:export\s+)?const\s+BEARER_ALLOWED_ENVS\b)/,
    '',
  );

  // 2. Drop the `BEARER_ALLOWED_ENVS` backing const (computed form only).
  next = next.replace(/^(?:export\s+)?const\s+BEARER_ALLOWED_ENVS\s*=[\s\S]*?;\n?/m, '');

  // 3. Drop the export itself — matches both `= false;` and the computed
  //    `= BEARER_ALLOWED_ENVS.has(env.NODE_ENV);` form.
  next = next.replace(/^export const SAVE_AUTH_TOKENS\s*=.*;\n?/m, '');

  return next;
};

/**
 * Migrate all HTTP client import and usage patterns when replacing one client with another
 * Example: fetch -> axios will replace all fetchClient imports/usages with axiosClient
 */
export const migrateClientUsages = async (
  projectPath: string,
  fromClient: 'fetch' | 'axios',
  toClient: 'fetch' | 'axios',
): Promise<void> => {
  if (fromClient === toClient) return;

  const fromName = fromClient === 'fetch' ? 'fetchClient' : 'axiosClient';
  const toName = toClient === 'fetch' ? 'fetchClient' : 'axiosClient';
  const fromPath = fromClient === 'fetch' ? 'fetch-client' : 'axios-client';
  const toPath = toClient === 'fetch' ? 'fetch-client' : 'axios-client';

  // Find all .ts and .tsx files in src directory
  const srcPath = path.join(projectPath, 'src');

  try {
    // Use grep to find files with HTTP client imports (argv, no shell).
    const stdout = await grepFiles(fromName, srcPath, ['-r', '-l']);

    if (!stdout.trim()) {
      // No files found with the client name
      return;
    }

    const filePaths = stdout
      .trim()
      .split('\n')
      .filter((f) => f);

    for (const filePath of filePaths) {
      if (!fileExists(filePath)) continue;

      let content = await readFile(filePath);
      let modified = false;

      // Replace import statements
      // Pattern 1: import { fetchClient } from '@/lib/http'
      const namedImportRegex = new RegExp(
        `(import\\s*\\{[^}]*?)\\b${fromName}\\b([^}]*?\\}\\s*from\\s*['"][^'"]*?/http['"])`,
        'g',
      );
      if (namedImportRegex.test(content)) {
        content = content.replace(namedImportRegex, `$1${toName}$2`);
        modified = true;
      }

      // Pattern 2: import fetchClient from '@/lib/http/fetch-client'
      const defaultImportRegex = new RegExp(
        `import\\s+${fromName}\\s+from\\s+['"]([^'"]*?)/${fromPath}['"]`,
        'g',
      );
      if (defaultImportRegex.test(content)) {
        content = content.replace(defaultImportRegex, `import ${toName} from '$1/${toPath}'`);
        modified = true;
      }

      // Pattern 3: Replace all usage instances (e.g., fetchClient.get -> axiosClient.get)
      const usageRegex = new RegExp(`\\b${fromName}\\b(?=\\.)`, 'g');
      if (usageRegex.test(content)) {
        content = content.replace(usageRegex, toName);
        modified = true;
      }

      // Pattern 4: Replace standalone references (e.g., const api = fetchClient)
      const standaloneRegex = new RegExp(`\\b${fromName}\\b(?![.\\w])`, 'g');
      if (standaloneRegex.test(content)) {
        content = content.replace(standaloneRegex, toName);
        modified = true;
      }

      if (modified) {
        await writeFile(filePath, content);
      }
    }
  } catch (error) {
    // If grep fails or no matches found, silently continue
    console.warn('Warning: Could not scan for HTTP client usages:', error);
  }
};

/**
 * Find the layout file that should host the bundle sentinel — `[locale]/layout.tsx`
 * when i18n is installed, falling back to the non-i18n root `src/app/layout.tsx`.
 * Returns `null` if neither exists (the project structure is unexpected;
 * callers warn rather than fail).
 */
export const resolveBundleSentinelLayoutPath = (projectPath: string): string | null => {
  const localeLayout = path.join(projectPath, PROJECT_PATHS.LOCALE_LAYOUT);
  if (fileExists(localeLayout)) return localeLayout;
  const rootLayout = path.join(projectPath, PROJECT_PATHS.ROOT_LAYOUT);
  if (fileExists(rootLayout)) return rootLayout;
  return null;
};

const SENTINEL_IMPORT_COMMENT = '// Regression sentinel — see file comment for what this guards.';
const SENTINEL_IMPORT_LINE =
  "import { HttpClientBundleSentinel } from '@/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel';";
const SENTINEL_TAG = '<HttpClientBundleSentinel />';

/**
 * Mount `<HttpClientBundleSentinel />` as the first child of `<RootProvider>`
 * in the relevant layout file, plus add the import at the bottom of the
 * import block. Idempotent — re-running is a no-op.
 *
 * The sentinel itself is a `'use client'` component that imports every
 * public symbol from `@/lib/utils/http`. If anyone later regresses the
 * server/universal split, the build fails immediately. See
 * `src/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel.tsx`.
 */
export const injectBundleSentinel = (content: string): string => {
  // Idempotency: bail if the JSX is already present. The import check alone
  // isn't sufficient — a half-applied previous run could leave one without
  // the other; the JSX is what actually exercises the sentinel.
  if (content.includes(SENTINEL_TAG)) return content;

  let next = content;

  // 1. Import block — append after the last `import` line, with the comment.
  if (!next.includes(SENTINEL_IMPORT_LINE)) {
    const importBlockRe = /(^import\s[^\n]*\n)+/m;
    const importBlock = next.match(importBlockRe);
    if (!importBlock) {
      throw new Error(
        'injectBundleSentinel: no `import` lines found — expected a layout file with at least one import.',
      );
    }
    const head = next.slice(0, (importBlock.index ?? 0) + importBlock[0].length);
    const tail = next.slice((importBlock.index ?? 0) + importBlock[0].length);
    next = `${head}${SENTINEL_IMPORT_COMMENT}\n${SENTINEL_IMPORT_LINE}\n${tail}`;
  }

  // 2. JSX mount — insert as the first child of `<RootProvider …>`. Match
  //    the opening tag (with or without props) and stamp the sentinel on
  //    its own line, preserving the indentation of whatever followed.
  const rootProviderOpenRe = /(<RootProvider\b[^>]*>)\n([ \t]*)/;
  const match = next.match(rootProviderOpenRe);
  if (!match) {
    throw new Error(
      'injectBundleSentinel: could not locate `<RootProvider …>` opening tag — layout shape unexpected.',
    );
  }
  const indent = match[2];
  next = next.replace(rootProviderOpenRe, `$1\n${indent}${SENTINEL_TAG}\n${indent}`);

  return next;
};

/**
 * Reverse of `injectBundleSentinel`. Strips the import + (optional preceding
 * comment) + JSX line. Idempotent.
 *
 * Anchored on **stable code tokens** — the import path and the JSX tag name —
 * not on the comment wording. If the template's comment text drifts upstream,
 * strip still removes the line. The comment is also dropped *only when it
 * immediately precedes the matching import*, so we don't accidentally remove
 * an unrelated user comment that mentions "Regression sentinel".
 */
export const stripBundleSentinel = (content: string): string => {
  let next = content;

  // 1. Drop the import line, including any single comment line immediately
  //    above it (the comment is optional — wording-tolerant). We anchor on
  //    the import path, which is the stable contract.
  const importPathPattern = /@\/lib\/utils\/http\/__bundle-sentinel__\/client-bundle-sentinel/;
  // Match: optional `// …\n` line, then the actual import line ending in newline.
  const importBlockRe = new RegExp(
    `(?:^[ \\t]*//[^\\n]*\\n)?^[ \\t]*import[^\\n]*${importPathPattern.source}[^\\n]*\\n`,
    'm',
  );
  next = next.replace(importBlockRe, '');

  // 2. Drop the JSX line with its surrounding whitespace. The tag name is the
  //    other stable token — feature code that references the sentinel uses
  //    this exact symbol.
  next = next.replace(/[ \t]*<HttpClientBundleSentinel\s*\/>\s*\n/, '');

  return next;
};

/**
 * Filesystem-bound wrappers for the two pure helpers. Reads the resolved
 * layout file, applies the transform, writes back only when something changed.
 */
export const installBundleSentinelMount = async (projectPath: string): Promise<void> => {
  const target = resolveBundleSentinelLayoutPath(projectPath);
  if (!target) return;
  const before = await readFile(target);
  const after = injectBundleSentinel(before);
  if (after !== before) await writeFile(target, after);
};

export const removeBundleSentinelMount = async (projectPath: string): Promise<void> => {
  const target = resolveBundleSentinelLayoutPath(projectPath);
  if (!target) return;
  const before = await readFile(target);
  const after = stripBundleSentinel(before);
  if (after !== before) await writeFile(target, after);
};

export const removeHttpExports = async (projectPath: string): Promise<void> => {
  // 1. Remove from utils/index.ts
  const utilsIndexPath = path.join(projectPath, PROJECT_PATHS.UTILS_INDEX);
  if (fileExists(utilsIndexPath)) {
    let content = await readFile(utilsIndexPath);
    content = content.replace(/^\s*export\s+\*\s+from\s+['"]\.\/http['"];?.*$/gm, '');
    await writeFile(utilsIndexPath, content);
  }

  // 2. Remove from types/index.ts
  const typesIndexPath = path.join(projectPath, PROJECT_PATHS.TYPES_INDEX);
  if (fileExists(typesIndexPath)) {
    let content = await readFile(typesIndexPath);

    // Check common types
    const commonTypesDir = path.join(projectPath, PROJECT_PATHS.COMMON_TYPES_DIR);
    if (!fileExists(commonTypesDir)) {
      content = content.replace(/^\s*export\s+\*\s+from\s+['"]\.\/common['"];?.*$/gm, '');
    } else {
      // If directory exists, check if we need to remove http.types export from common/index.ts
      const commonIndexPath = path.join(commonTypesDir, 'index.ts');
      if (fileExists(commonIndexPath)) {
        let commonContent = await readFile(commonIndexPath);
        commonContent = commonContent.replace(
          /^\s*export\s+\*\s+from\s+['"]\.\/http\.types['"];?.*$/gm,
          '',
        );
        await writeFile(commonIndexPath, commonContent);
      }
    }

    // Check utility types
    if (!fileExists(path.join(projectPath, PROJECT_PATHS.UTILITY_TYPES_DIR))) {
      content = content.replace(/^\s*export\s+\*\s+from\s+['"]\.\/utility['"];?.*$/gm, '');
    }
    await writeFile(typesIndexPath, content);
  }

  // 3. Remove from config/index.ts - Handled by performFullCleanup smart deletion
  // We don't blindly remove it here anymore because app-apis might be kept if used elsewhere.
};

/**
 * Check if a file or module is used in the project
 * @param projectPath Root project path
 * @param importPath Import path to search for (e.g., '@/lib/config/app-apis' or 'app-apis')
 * @param excludePaths Array of absolute paths to exclude from search results
 */
export const isFileUsed = async (
  projectPath: string,
  importPath: string,
  excludePaths: string[] = [],
): Promise<boolean> => {
  const srcPath = path.join(projectPath, 'src');

  // Escape ERE metacharacters in the import path so it is matched literally.
  const escapedImportPath = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match `from '...importPath...'` or `from "...importPath..."`. Passed as a
  // single argv arg to grep -E (no shell), so the pattern can't be split or
  // injected. The quote class is `['"]` directly — no shell escaping needed.
  const pattern = `from ['"].*${escapedImportPath}.*['"]`;

  try {
    const stdout = await grepFiles(pattern, srcPath, ['-r', '-E']);

    if (!stdout.trim()) {
      return false;
    }

    const matches = stdout.trim().split('\n');

    // Filter out matches from excluded files
    const validMatches = matches.filter((match) => {
      const [filePath] = match.split(':');
      // Check if file path is in excluded paths
      // We need to resolve relative paths from grep output if necessary,
      // but grep usually outputs full or relative to cwd.
      // Assuming grep runs from cwd, output is relative.
      const absoluteMatchPath = path.resolve(projectPath, filePath);

      return !excludePaths.some((exclude) => {
        // Simple check: is the match file the excluded file?
        if (absoluteMatchPath === exclude) return true;
        // Is the match file inside an excluded directory?
        if (absoluteMatchPath.startsWith(exclude + path.sep)) return true;
        return false;
      });
    });

    return validMatches.length > 0;
  } catch (error) {
    console.warn(`Warning: Failed to check usage for ${importPath}:`, error);
    // If check fails, assume used to be safe
    return true;
  }
};

/**
 * Check if a specific string (symbol, class name, etc.) is present in the project files
 * @param projectPath Root project path
 * @param searchString String to search for
 * @param excludePaths Array of absolute paths to exclude from search results
 */
export const isStringUsed = async (
  projectPath: string,
  searchString: string,
  excludePaths: string[] = [],
): Promise<boolean> => {
  const srcPath = path.join(projectPath, 'src');

  // Search for the literal string. `-F` (fixed-string) means no regex escaping
  // is needed and the search string is matched verbatim; passed as a single
  // argv arg to grep (no shell), so it can't be interpreted as a command.
  try {
    const stdout = await grepFiles(searchString, srcPath, ['-r', '-F']);

    if (!stdout.trim()) {
      return false;
    }

    const matches = stdout.trim().split('\n');

    // Filter out matches from excluded files
    const validMatches = matches.filter((match) => {
      const [filePath] = match.split(':');
      const absoluteMatchPath = path.resolve(projectPath, filePath);

      return !excludePaths.some((exclude) => {
        if (absoluteMatchPath === exclude) return true;
        if (absoluteMatchPath.startsWith(exclude + path.sep)) return true;
        return false;
      });
    });

    return validMatches.length > 0;
  } catch (error) {
    console.warn(`Warning: Failed to check usage for string ${searchString}:`, error);
    return true;
  }
};

/**
 * Rewrite the sentinel's import list to match the active client variants.
 *
 * The template ships the sentinel hardcoded to import BOTH axios and fetch
 * symbols from `@/lib/utils/http`. When `setup --http-client` strips one
 * variant (e.g. user picks fetch only), the universal entry no longer
 * exports the axios symbols and the sentinel fails to build. This helper
 * keeps the sentinel honest: only references symbols that actually exist
 * at the universal entry.
 *
 * Idempotent — running on an already-correct sentinel is a no-op.
 *
 * `toSearchParams` is always present (lives in `shared/`, not in either
 * client variant), so it's emitted regardless. When `clients` is empty,
 * the sentinel is no longer meaningful, but this helper still produces
 * a valid TSX file (the caller is responsible for removing the mount).
 */
export const rewriteSentinelImports = async (
  projectPath: string,
  clients: ('fetch' | 'axios')[],
): Promise<void> => {
  const sentinelPath = path.join(projectPath, PROJECT_PATHS.HTTP_BUNDLE_SENTINEL_FILE);
  if (!fileExists(sentinelPath)) return;

  let content = await readFile(sentinelPath);

  // Build the list of symbols the sentinel should reference.
  const symbols: string[] = ['toSearchParams'];
  if (clients.includes('axios')) symbols.unshift('axiosClient', 'createAxiosClient');
  if (clients.includes('fetch')) {
    // Insert fetch symbols after axios ones (alphabetical-ish: axios* then create* then fetch*).
    const insertAt = symbols.indexOf('toSearchParams');
    symbols.splice(insertAt, 0, 'createFetchClient', 'fetchClient');
  }
  symbols.sort();

  // 1. Rewrite the import statement.
  const newImport = `import {\n  ${symbols.join(',\n  ')},\n} from '@/lib/utils/http';`;
  content = content.replace(/import\s*\{[^}]*\}\s*from\s*['"]@\/lib\/utils\/http['"];/, newImport);

  // 2. Rewrite the __sentinel__ object body to reference the same symbols.
  const newSentinelBody = symbols.map((s) => `  ${s},`).join('\n');
  content = content.replace(
    /const __sentinel__ = \{[\s\S]*?\};/,
    `const __sentinel__ = {\n${newSentinelBody}\n};`,
  );

  await writeFile(sentinelPath, content);
};

/**
 * Rewrite `src/lib/utils/http/server.ts` so it only imports/instantiates the
 * client variants the project actually has on disk.
 *
 * The template ships server.ts with both axios and fetch unconditionally
 * imported, instantiated, and re-exported. When `setup --http-client`
 * removes one variant, its `./axios-client` or `./fetch-client` directory
 * is gone — the universal `index.ts` is already aware of this (via
 * `updateHttpIndex`), but `server.ts` keeps the dangling import and the
 * `yarn build` typecheck fails with "Cannot find module".
 *
 * Strategy: regex-strip the variant-specific blocks (import, instantiation,
 * re-export) for the client(s) NOT in the active set. Idempotent — running
 * on an already-correct server.ts is a no-op.
 *
 * When `clients` is empty the server entry should already be deleted by
 * the caller; this helper is a no-op in that case.
 */
export const rewriteServerEntryImports = async (
  projectPath: string,
  clients: ('fetch' | 'axios')[],
): Promise<void> => {
  const serverPath = path.join(projectPath, PROJECT_PATHS.HTTP_SERVER_FILE);
  if (!fileExists(serverPath)) return;
  if (clients.length === 0) return;

  let content = await readFile(serverPath);

  const drop = (regex: RegExp): void => {
    content = content.replace(regex, '');
  };

  if (!clients.includes('axios')) {
    // Drop axios import + the `export const axiosClient = createAxiosClient({...})` block.
    drop(/^import\s*\{\s*createAxiosClient\s*\}\s*from\s*['"]\.\/axios-client['"];\n?/m);
    drop(/export const axiosClient = createAxiosClient\(\{[\s\S]*?\}\);\n?\n?/);
    // Trim createAxiosClient from the trailing re-export.
    content = trimFromExportList(content, 'createAxiosClient');
  }

  if (!clients.includes('fetch')) {
    drop(/^import\s*\{\s*createFetchClient\s*\}\s*from\s*['"]\.\/fetch-client['"];\n?/m);
    drop(/export const fetchClient = createFetchClient\(\{[\s\S]*?\}\);\n?\n?/);
    content = trimFromExportList(content, 'createFetchClient');
  }

  // Collapse 3+ consecutive newlines down to 2 for tidy output.
  content = content.replace(/\n{3,}/g, '\n\n');

  await writeFile(serverPath, content);
};

/**
 * Helper: remove `name` from a single-line `export { a, b, c };` list. If
 * `name` is the only name, drops the whole line. No-op when `name` isn't
 * in the list.
 */
const trimFromExportList = (content: string, name: string): string => {
  const exportLineRe = /^export\s*\{([^}]*)\};\n?/m;
  return content.replace(exportLineRe, (_match, inner: string) => {
    const remaining = inner
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && n !== name);
    if (remaining.length === 0) return '';
    return `export { ${remaining.join(', ')} };\n`;
  });
};
