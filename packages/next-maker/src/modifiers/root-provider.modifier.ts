import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { fileExists, readFile, writeFile } from '../core/files';
import { addImportStatement } from './helpers';

/**
 * Modifies the project's `RootProvider.tsx` to wrap `{children}` in a newly
 * generated provider. Two-tier detection:
 *   1. Canonical path: `src/providers/RootProvider.tsx`
 *   2. Heuristic scan of `src/providers/*.tsx` for the file whose JSX
 *      contains `{children}` (most projects only have one).
 *
 * Pure transformation logic lives in this module too (`injectProviderIntoChain`,
 * `addProviderToBarrel`) so it can be unit-tested without filesystem.
 */

const COMPONENT_TAG_RE = (componentName: string): RegExp => new RegExp(`<\\s*${componentName}\\b`);

/**
 * Insert `<ComponentName>{children}</ComponentName>` as the innermost wrap
 * around `{children}`. Idempotent: returns the input unchanged if the tag
 * is already present.
 */
export const injectProviderIntoChain = (content: string, componentName: string): string => {
  if (COMPONENT_TAG_RE(componentName).test(content)) {
    return content;
  }

  // Capture the indentation of the `{children}` line so we preserve formatting.
  const childrenLineRe = /^(?<indent>[ \t]*)\{children\}\s*$/m;
  const match = content.match(childrenLineRe);
  if (!match || match.index === undefined) {
    throw new Error(
      'Could not locate `{children}` line in RootProvider — expected a line containing only `{children}`.',
    );
  }

  const indent = match.groups?.indent ?? '';
  const innerIndent = `${indent}  `;
  const replacement = `${indent}<${componentName}>\n${innerIndent}{children}\n${indent}</${componentName}>`;

  return content.replace(childrenLineRe, replacement);
};

/**
 * Append a `export * from './<basename>';` line to the providers barrel,
 * keeping it sorted alphabetically among the other exports. Idempotent.
 */
export const addProviderToBarrel = (content: string, fileBaseName: string): string => {
  const exportLine = `export * from './${fileBaseName}';`;
  if (content.includes(exportLine)) return content;

  const lines = content.split('\n');
  const exportLines: string[] = [];
  const others: string[] = [];

  for (const line of lines) {
    if (/^export \* from '\.\/.*';\s*$/.test(line)) {
      exportLines.push(line);
    } else {
      others.push(line);
    }
  }

  const merged = [...exportLines, exportLine].sort();
  // Reconstitute: keep non-export lines (likely empty trailing/leading) where
  // they were, but place the sorted export block where the first export was.
  const firstExportIdx = lines.findIndex((l) => /^export \* from '\.\//.test(l));
  if (firstExportIdx === -1) {
    return `${exportLine}\n${content.replace(/^\n+/, '')}`;
  }

  const before = lines.slice(0, firstExportIdx);
  const afterStart = lines.findIndex(
    (l, idx) => idx > firstExportIdx && !/^export \* from '\.\//.test(l),
  );
  const after = afterStart === -1 ? [] : lines.slice(afterStart);

  return [...before, ...merged, ...after].join('\n');
};

const PROVIDER_DIR_REL = PROJECT_PATHS.PROVIDERS;
const ROOT_PROVIDER_REL = PROJECT_PATHS.ROOT_PROVIDER;
const PROVIDERS_INDEX_REL = PROJECT_PATHS.PROVIDERS_INDEX;

/** Locates the RootProvider file or returns null when none can be confidently identified. */
export const findRootProviderFile = async (
  projectPath: string,
  fs: { fileExists: (p: string) => boolean; readFile: (p: string) => Promise<string> } = {
    fileExists,
    readFile,
  },
): Promise<string | null> => {
  const canonical = path.join(projectPath, ROOT_PROVIDER_REL);
  if (fs.fileExists(canonical)) return canonical;

  const dir = path.join(projectPath, PROVIDER_DIR_REL);
  if (!fs.fileExists(dir)) return null;

  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir).catch(() => [] as string[]);
  const candidates = entries.filter((name) => name.endsWith('.tsx'));

  let best: { file: string; depth: number } | null = null;
  for (const entry of candidates) {
    const filePath = path.join(dir, entry);
    const contents = await fs.readFile(filePath);
    if (!/\{children\}/.test(contents)) continue;
    // Depth heuristic: number of opening JSX tags before `{children}`.
    const beforeChildren = contents.split('{children}')[0] ?? '';
    const depth = (beforeChildren.match(/<[A-Z][A-Za-z0-9_]*\b/g) ?? []).length;
    if (!best || depth > best.depth) {
      best = { file: filePath, depth };
    }
  }

  return best?.file ?? null;
};

export interface RegisterProviderOptions {
  projectPath: string;
  componentName: string;
  fileBaseName: string;
}

export const registerProvider = async (
  options: RegisterProviderOptions,
): Promise<{ rootProviderFile: string | null; barrelFile: string | null }> => {
  const { projectPath, componentName, fileBaseName } = options;

  const rootProviderFile = await findRootProviderFile(projectPath);
  if (rootProviderFile) {
    const before = await readFile(rootProviderFile);
    let after = before;
    if (!/from '\.\//.test(before) || !before.includes(`{ ${componentName} }`)) {
      after = addImportStatement(after, `import { ${componentName} } from './${fileBaseName}';`);
    }
    after = injectProviderIntoChain(after, componentName);
    if (after !== before) {
      await writeFile(rootProviderFile, after);
    }
  }

  const barrelPath = path.join(projectPath, PROVIDERS_INDEX_REL);
  let barrelFile: string | null = null;
  if (fileExists(barrelPath)) {
    const before = await readFile(barrelPath);
    const after = addProviderToBarrel(before, fileBaseName);
    if (after !== before) {
      await writeFile(barrelPath, after);
    }
    barrelFile = barrelPath;
  }

  return { rootProviderFile, barrelFile };
};
