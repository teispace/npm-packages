import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Manifest patterns are literal paths plus `*` (one path segment) and `**`
 * (any depth). Brackets, parentheses, and dots are literal, so App Router
 * paths such as `src/app/[locale]/(app)/**` need no escaping, and
 * dot-directories match like any other. The starter's own manifest test
 * implements the same rule.
 */
export const patternToRegExp = (pattern: string): RegExp => {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else {
      out += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${out}$`);
};

export const DEFAULT_SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.next',
  'coverage',
  'playwright-report',
  'test-results',
]);

/** Every file under `root`, as forward-slash paths relative to `root`. */
export const listFiles = async (
  root: string,
  skipDirs: ReadonlySet<string> = DEFAULT_SKIP_DIRS,
): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/'));
      }
    }
  };
  await walk(root);
  return out.sort();
};

export const matchFiles = (files: readonly string[], pattern: string): string[] => {
  const re = patternToRegExp(pattern);
  return files.filter((file) => re.test(file));
};
