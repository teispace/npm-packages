import { execFile } from 'node:child_process';
import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import degit from 'degit';

const execFileAsync = promisify(execFile);

/**
 * The starter template every `init`, `setup`, and repair composes from.
 *
 * Pinned by tag, not by branch: the CLI reads the starter's composition
 * manifest at runtime, but the manifest version it understands and the
 * generators it ships are written against one starter line. Bump the ref
 * together with the CLI changes that track it.
 */
export const STARTER_REPO = 'teispace/nextjs-starter';
export const STARTER_REF = 'v2.0.0-alpha.1';

/** Environment override for development and the composition matrix. */
export const STARTER_PATH_ENV = 'NEXT_MAKER_STARTER_PATH';

export interface StarterSource {
  kind: 'remote' | 'local';
  /** `owner/repo#ref` for remote, absolute directory for local. */
  location: string;
}

export const starterSource = (ref: string = STARTER_REF): string =>
  ref === 'main' ? STARTER_REPO : `${STARTER_REPO}#${ref}`;

export const resolveStarterSource = (
  options: { starterPath?: string; ref?: string } = {},
): StarterSource => {
  const local = options.starterPath ?? process.env[STARTER_PATH_ENV];
  if (local) return { kind: 'local', location: path.resolve(local) };
  return { kind: 'remote', location: starterSource(options.ref) };
};

const LOCAL_COPY_SKIP = new Set([
  'node_modules',
  '.git',
  '.next',
  'coverage',
  'playwright-report',
  'test-results',
  '.env',
]);

/** Clone the pinned starter into `dest`. Always a fresh fetch, never the degit cache. */
export const cloneStarter = async (
  dest: string,
  options: { verbose?: boolean; source?: StarterSource } = {},
): Promise<StarterSource> => {
  const source = options.source ?? resolveStarterSource();
  if (source.kind === 'local') {
    try {
      if (!(await stat(source.location)).isDirectory()) throw new Error('not a directory');
    } catch {
      throw new Error(`Starter path ${source.location} is not a directory`);
    }
    await copyLocalStarter(source.location, dest);
    return source;
  }
  const emitter = degit(source.location, {
    cache: false,
    force: true,
    verbose: options.verbose ?? false,
  });
  await emitter.clone(dest);
  return source;
};

/**
 * Copy a local checkout the way `degit` would export it: tracked and
 * untracked-but-not-ignored files only, so build output, `node_modules`,
 * `.husky/_`, and `.env` never leak into a project. Falls back to a filtered
 * copy when the directory is not a git repository.
 */
export const copyLocalStarter = async (from: string, dest: string): Promise<void> => {
  let files: string[] | null = null;
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', from, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    files = stdout.split('\0').filter(Boolean);
  } catch {
    files = null;
  }
  if (files === null) {
    await cp(from, dest, {
      recursive: true,
      filter: (src) => !LOCAL_COPY_SKIP.has(path.basename(src)),
    });
    return;
  }
  for (const file of files) {
    const target = path.join(dest, file);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await cp(path.join(from, file), target);
    } catch {
      // A file listed by git but gone from disk (deleted, not yet committed) is simply not copied.
    }
  }
};
