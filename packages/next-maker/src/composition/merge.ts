import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { listFiles } from './glob';

const execFileAsync = promisify(execFile);

/**
 * Three-way merge of a project (`ours`) against two composed starter trees:
 * what the project looked like when it was generated (`base`) and what it
 * would look like now (`theirs`). Files the user never touched follow the
 * starter; files only the starter changed are updated; files both changed
 * are merged line by line with `git merge-file`, and real conflicts are
 * written with markers and reported.
 *
 * `package.json` is merged structurally so it stays parseable: the starter's
 * key-level changes are applied where the project kept the base value.
 */
export type MergeOutcome =
  | 'unchanged'
  | 'updated'
  | 'added'
  | 'deleted'
  | 'merged'
  | 'conflict'
  | 'kept'
  | 'skipped';

export interface MergeEntry {
  file: string;
  outcome: MergeOutcome;
  note?: string;
}

export interface MergeReport {
  entries: MergeEntry[];
  conflicts: string[];
}

export interface MergeOptions {
  dryRun?: boolean;
  /** Files never merged (lockfiles, env files, records). Relative paths. */
  skip?: (file: string) => boolean;
}

const DEFAULT_SKIP = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  '.env',
  '.next-maker.json',
  'next-env.d.ts',
  'tsconfig.tsbuildinfo',
]);

export const defaultSkip = (file: string): boolean =>
  DEFAULT_SKIP.has(file) || file.startsWith('.env.') || file.endsWith('.log');

const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.pdf',
  '.zip',
  '.gz',
]);

const isBinary = (file: string, sample: Buffer): boolean =>
  BINARY_EXT.has(path.extname(file)) || sample.subarray(0, 8000).includes(0);

const readMaybe = async (file: string): Promise<Buffer | null> => {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
};

const write = async (target: string, content: Buffer | string, dryRun: boolean): Promise<void> => {
  if (dryRun) return;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
};

/** `git merge-file -p`; exit 0 clean, exit n>0 with markers, other failures throw. */
export const mergeText = async (
  ours: string,
  base: string,
  theirs: string,
  labels = { ours: 'project', base: 'starter (previous)', theirs: 'starter (new)' },
): Promise<{ content: string; conflicts: number }> => {
  const dir = path.join(
    process.env.TMPDIR ?? '/tmp',
    `next-maker-merge-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(path.join(dir, 'ours'), ours);
    await writeFile(path.join(dir, 'base'), base);
    await writeFile(path.join(dir, 'theirs'), theirs);
    try {
      const { stdout } = await execFileAsync(
        'git',
        [
          'merge-file',
          '-p',
          '-L',
          labels.ours,
          '-L',
          labels.base,
          '-L',
          labels.theirs,
          'ours',
          'base',
          'theirs',
        ],
        { cwd: dir, maxBuffer: 64 * 1024 * 1024 },
      );
      return { content: stdout, conflicts: 0 };
    } catch (error) {
      const e = error as { code?: number | string; stdout?: string; message?: string };
      if (
        typeof e.code === 'number' &&
        e.code > 0 &&
        e.code < 128 &&
        typeof e.stdout === 'string'
      ) {
        return { content: e.stdout, conflicts: e.code };
      }
      if (e.code === 'ENOENT')
        throw new Error('git is required for merges but was not found on PATH.');
      throw error;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

type Json = Record<string, unknown>;
const OBJECT_SECTIONS = [
  'scripts',
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'engines',
];

/**
 * Apply the starter's changes to `package.json` key by key. Where the
 * project changed the same key to a different value, the project wins and
 * the key is reported.
 */
export const mergePackageJson = (
  ours: Json,
  base: Json,
  theirs: Json,
): { result: Json; conflicts: string[] } => {
  const result: Json = structuredClone(ours);
  const conflicts: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const mergeKey = (target: Json, o: Json, b: Json, t: Json, key: string, label: string) => {
    const bv = b[key];
    const tv = t[key];
    const ov = o[key];
    if (same(bv, tv)) return; // starter did not touch it
    if (same(ov, bv) || same(ov, tv)) {
      if (tv === undefined) delete target[key];
      else target[key] = tv;
      return;
    }
    conflicts.push(label);
  };

  for (const section of OBJECT_SECTIONS) {
    const b = (base[section] as Json) ?? {};
    const t = (theirs[section] as Json) ?? {};
    const o = (ours[section] as Json) ?? {};
    if (!result[section]) result[section] = {};
    const target = result[section] as Json;
    for (const key of new Set([...Object.keys(b), ...Object.keys(t)])) {
      mergeKey(target, o, b, t, key, `${section}.${key}`);
    }
    if (Object.keys(target).length === 0 && !(section in theirs)) delete result[section];
    else if (section !== 'scripts' && section !== 'engines')
      result[section] = Object.fromEntries(
        Object.entries(target).sort(([a], [c]) => a.localeCompare(c)),
      );
  }
  for (const key of new Set([...Object.keys(base), ...Object.keys(theirs)])) {
    if (OBJECT_SECTIONS.includes(key)) continue;
    mergeKey(result, ours, base, theirs, key, key);
  }
  return { result, conflicts };
};

export interface MergeTrees {
  base: string;
  theirs: string;
  ours: string;
}

export const mergeTrees = async (
  { base, theirs, ours }: MergeTrees,
  options: MergeOptions = {},
): Promise<MergeReport> => {
  const dryRun = options.dryRun ?? false;
  const skip = options.skip ?? defaultSkip;
  const [baseFiles, theirFiles, ourFiles] = await Promise.all([
    listFiles(base),
    listFiles(theirs),
    listFiles(ours),
  ]);
  const ourSet = new Set(ourFiles);
  const baseSet = new Set(baseFiles);
  const theirSet = new Set(theirFiles);
  const report: MergeReport = { entries: [], conflicts: [] };
  const add = (file: string, outcome: MergeOutcome, note?: string) => {
    report.entries.push({ file, outcome, note });
    if (outcome === 'conflict') report.conflicts.push(file);
  };

  for (const file of [...new Set([...baseFiles, ...theirFiles])].sort()) {
    if (skip(file)) continue;
    const inBase = baseSet.has(file);
    const inTheirs = theirSet.has(file);
    const inOurs = ourSet.has(file);
    const [b, t, o] = await Promise.all([
      inBase ? readMaybe(path.join(base, file)) : null,
      inTheirs ? readMaybe(path.join(theirs, file)) : null,
      inOurs ? readMaybe(path.join(ours, file)) : null,
    ]);
    const target = path.join(ours, file);

    if (inTheirs && !inBase) {
      if (!inOurs) {
        await write(target, t as Buffer, dryRun);
        add(file, 'added');
      } else if ((o as Buffer).equals(t as Buffer)) {
        add(file, 'unchanged');
      } else if (isBinary(file, t as Buffer)) {
        add(file, 'kept', 'starter added a binary the project also has');
      } else {
        const merged = await mergeText(
          (o as Buffer).toString('utf8'),
          '',
          (t as Buffer).toString('utf8'),
        );
        await write(target, merged.content, dryRun);
        add(file, merged.conflicts ? 'conflict' : 'merged');
      }
      continue;
    }

    if (inBase && !inTheirs) {
      if (!inOurs) continue;
      if ((o as Buffer).equals(b as Buffer)) {
        if (!dryRun) await rm(target, { force: true });
        add(file, 'deleted');
      } else {
        add(file, 'kept', 'starter removed it, but the project changed it');
      }
      continue;
    }

    // in base and theirs
    if (!inOurs) {
      add(file, 'kept', 'deleted in the project');
      continue;
    }
    if ((b as Buffer).equals(t as Buffer) || (o as Buffer).equals(t as Buffer)) {
      add(file, 'unchanged');
      continue;
    }
    if ((o as Buffer).equals(b as Buffer)) {
      await write(target, t as Buffer, dryRun);
      add(file, 'updated');
      continue;
    }
    if (isBinary(file, o as Buffer) || isBinary(file, t as Buffer)) {
      add(file, 'kept', 'binary changed on both sides');
      continue;
    }
    if (file === 'package.json') {
      const { result, conflicts } = mergePackageJson(
        JSON.parse((o as Buffer).toString('utf8')),
        JSON.parse((b as Buffer).toString('utf8')),
        JSON.parse((t as Buffer).toString('utf8')),
      );
      await write(target, `${JSON.stringify(result, null, 2)}\n`, dryRun);
      add(
        file,
        conflicts.length ? 'conflict' : 'merged',
        conflicts.length ? `project kept: ${conflicts.join(', ')}` : undefined,
      );
      if (conflicts.length) report.conflicts.pop(); // reported through the note; the file stays valid JSON
      continue;
    }
    const merged = await mergeText(
      (o as Buffer).toString('utf8'),
      (b as Buffer).toString('utf8'),
      (t as Buffer).toString('utf8'),
    );
    await write(target, merged.content, dryRun);
    add(file, merged.conflicts ? 'conflict' : 'merged');
  }
  return report;
};

/** Copy a tree without dependency and build folders. */
export const snapshotTree = async (from: string, to: string): Promise<void> => {
  const skipDirs = new Set([
    'node_modules',
    '.git',
    '.next',
    'coverage',
    'playwright-report',
    'test-results',
  ]);
  await cp(from, to, { recursive: true, filter: (src) => !skipDirs.has(path.basename(src)) });
};

export const exists = async (file: string): Promise<boolean> => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};
