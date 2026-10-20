import { stat } from 'node:fs/promises';
import path from 'node:path';
import { listFiles } from '../composition/glob';
import { exec } from './exec';
import { fileExists } from './files';

const FORMATTABLE = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.css',
]);

/**
 * The project's Biome launcher. On Windows the extensionless file in
 * `node_modules/.bin` is the POSIX shell shim, which cannot run there; the
 * `.cmd` beside it is the one to call.
 */
export const biomeBinary = (projectPath: string, platform = process.platform): string =>
  path.join(projectPath, 'node_modules', '.bin', platform === 'win32' ? 'biome.cmd' : 'biome');

/**
 * Format and sort imports in `paths` with the Biome installed in
 * `biomeFrom` (the project itself by default), so generated and merged code
 * passes `lint` as written. Without Biome nothing happens; remaining lint
 * errors are not this step's concern and do not fail it.
 */
export const formatWithBiome = async (
  cwd: string,
  paths: string[],
  biomeFrom = cwd,
  /**
   * Lay the code out without applying lint fixes. Used on the merge's base
   * tree: a fix there (dropping an import an edit just made unused) is a
   * change the project never had, and the merge would report it as one.
   */
  formatOnly = false,
): Promise<boolean> => {
  const biome = biomeBinary(biomeFrom);
  if (paths.length === 0 || !fileExists(biome)) return false;
  const args = formatOnly
    ? ['format', '--write', '--no-errors-on-unmatched', ...paths]
    : ['check', '--write', '--no-errors-on-unmatched', ...paths];
  try {
    await exec(biome, args, { cwd });
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return false;
  }
  return true;
};

/**
 * Format every formattable file written at or after `since` (a `Date.now()`
 * taken when the command started). Generators and merges write through
 * several paths, so the clock, not a list of paths, decides what to format.
 */
export const formatTouched = async (projectPath: string, since: number): Promise<string[]> => {
  const touched: string[] = [];
  for (const rel of await listFiles(projectPath)) {
    if (!FORMATTABLE.has(path.extname(rel))) continue;
    try {
      const s = await stat(path.join(projectPath, rel));
      // A second of slack covers filesystems with coarse mtimes.
      if (s.mtimeMs >= since - 1000) touched.push(rel);
    } catch {
      // Removed between listing and stat; nothing to format.
    }
  }
  if (touched.length) await formatWithBiome(projectPath, touched);
  return touched;
};
