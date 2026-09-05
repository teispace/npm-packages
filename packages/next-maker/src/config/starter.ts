import { cp, stat } from 'node:fs/promises';
import path from 'node:path';
import degit from 'degit';

/**
 * The starter template every `init`, `setup`, and repair composes from.
 *
 * Pinned by tag, not by branch: the CLI reads the starter's composition
 * manifest at runtime, but the manifest version it understands and the
 * generators it ships are written against one starter line. Bump the ref
 * together with the CLI changes that track it.
 */
export const STARTER_REPO = 'teispace/nextjs-starter';
export const STARTER_REF = 'v2.0.0-alpha.0';

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
    await cp(source.location, dest, {
      recursive: true,
      filter: (src) => !LOCAL_COPY_SKIP.has(path.basename(src)),
    });
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
