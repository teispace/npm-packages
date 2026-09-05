/**
 * Resolver for the conflict blocks `git merge-file` leaves behind.
 *
 * git flags two edits as conflicting when they touch adjacent lines or the
 * same line, which is exactly what happens when a generator registers a
 * slice on the line a feature toggle rewrites. A block is retried here as
 * a three-way merge of its lines; line runs both sides changed are merged
 * again by token, with each side's tokens aligned only inside the lines it
 * replaced. Three rules are relaxed relative to git: edits that merely
 * touch are applied in order, two insertions at one point are both kept
 * (project first), and an insertion that lands inside the other side's
 * edit is slid to its edge when the tokens allow it. Edits that change the
 * same token stay conflicts and keep their markers.
 */
export interface Hunk<T> {
  start: number;
  end: number;
  insert: T[];
}

const MAX_CELLS = 4_000_000;

/** Edit script from `base` to `other` as replacement hunks over `base` ranges. */
export const diffHunks = <T>(base: T[], other: T[]): Hunk<T>[] | null => {
  const n = base.length;
  const m = other.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) return null;
  const width = m + 1;
  const lcs = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        base[i] === other[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const hunks: Hunk<T>[] = [];
  let current: Hunk<T> | null = null;
  let i = 0;
  let j = 0;
  const open = (): Hunk<T> => {
    if (!current) {
      current = { start: i, end: i, insert: [] };
      hunks.push(current);
    }
    return current;
  };
  // Forward-greedy matching attaches an insertion to the end of a repeated
  // run, which keeps generator inserts next to the argument they follow.
  while (i < n || j < m) {
    const cell = i * width + j;
    if (i < n && j < m && base[i] === other[j] && lcs[cell] === lcs[cell + width + 1] + 1) {
      current = null;
      i++;
      j++;
    } else if (j < m && (i >= n || lcs[cell + 1] >= lcs[cell + width])) {
      open().insert.push(other[j]);
      j++;
    } else {
      open().end = ++i;
    }
  }
  return hunks;
};

const isInsertion = <T>(h: Hunk<T>) => h.start === h.end;

// Two insertions at one point are compatible: the project's goes first.
const overlaps = <T>(a: Hunk<T>, b: Hunk<T>): boolean => {
  if (isInsertion(a) && isInsertion(b)) return false;
  if (isInsertion(a)) return b.start < a.start && a.start < b.end;
  if (isInsertion(b)) return a.start < b.start && b.start < a.end;
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
};

const sameHunk = <T>(a: Hunk<T>, b: Hunk<T>): boolean =>
  a.start === b.start &&
  a.end === b.end &&
  a.insert.length === b.insert.length &&
  a.insert.every((t, k) => t === b.insert[k]);

/**
 * Move an insertion sitting inside `other`'s range to one of its edges by
 * rotating the inserted tokens over equal base tokens. Returns the moved
 * hunk or null when the tokens do not line up.
 */
const slideToEdge = <T>(base: T[], ins: Hunk<T>, other: Hunk<T>): Hunk<T> | null => {
  let pos = ins.start;
  let tokens = ins.insert;
  while (pos < other.end && tokens.length > 0 && tokens[0] === base[pos]) {
    tokens = [...tokens.slice(1), tokens[0]];
    pos++;
  }
  if (pos === other.end) return { start: pos, end: pos, insert: tokens };
  pos = ins.start;
  tokens = ins.insert;
  while (pos > other.start && tokens.length > 0 && tokens[tokens.length - 1] === base[pos - 1]) {
    tokens = [tokens[tokens.length - 1], ...tokens.slice(0, -1)];
    pos--;
  }
  if (pos === other.start) return { start: pos, end: pos, insert: tokens };
  return null;
};

const shift = <T>(hunks: Hunk<T>[], by: number): Hunk<T>[] =>
  hunks.map((h) => ({ start: h.start + by, end: h.end + by, insert: h.insert }));

/**
 * Finer-grained merge of one contested region: the base slice plus each
 * side's hunks over it (region-relative). Returns the merged region or null.
 */
export type Refine<T> = (base: T[], ours: Hunk<T>[], theirs: Hunk<T>[]) => T[] | null;

/**
 * Merge two edit scripts over `base`. Contested regions are handed to
 * `refine` when given; without it, or when `refine` also fails, the result
 * is null.
 */
export const mergeHunks = <T>(
  base: T[],
  a: Hunk<T>[],
  b: Hunk<T>[],
  refine?: Refine<T>,
): T[] | null => {
  const out: T[] = [];
  let pos = 0;
  let i = 0;
  let j = 0;
  const apply = (h: Hunk<T>) => {
    for (let k = pos; k < h.start; k++) out.push(base[k]);
    out.push(...h.insert);
    pos = Math.max(pos, h.end);
  };
  const refineRegion = (x: Hunk<T>, y: Hunk<T>): boolean => {
    if (!refine) return false;
    const s = Math.min(x.start, y.start);
    let e = Math.max(x.end, y.end);
    let ai = i;
    let bj = j;
    let grew = true;
    while (grew) {
      grew = false;
      while (ai + 1 < a.length && a[ai + 1].start < e) {
        ai++;
        e = Math.max(e, a[ai].end);
        grew = true;
      }
      while (bj + 1 < b.length && b[bj + 1].start < e) {
        bj++;
        e = Math.max(e, b[bj].end);
        grew = true;
      }
    }
    const merged = refine(
      base.slice(s, e),
      shift(a.slice(i, ai + 1), -s),
      shift(b.slice(j, bj + 1), -s),
    );
    if (!merged) return false;
    apply({ start: s, end: e, insert: merged });
    i = ai + 1;
    j = bj + 1;
    return true;
  };
  while (i < a.length || j < b.length) {
    let x = a[i];
    let y = b[j];
    if (x && y) {
      if (sameHunk(x, y)) {
        apply(x);
        i++;
        j++;
        continue;
      }
      if (overlaps(x, y)) {
        const moved =
          isInsertion(x) && !isInsertion(y)
            ? slideToEdge(base, x, y)
            : isInsertion(y) && !isInsertion(x)
              ? slideToEdge(base, y, x)
              : null;
        if (moved && isInsertion(x)) x = moved;
        else if (moved) y = moved;
        else if (refineRegion(x, y)) continue;
        else return null;
      }
      const xFirst = x.start < y.start || (x.start === y.start && isInsertion(x));
      if (xFirst) {
        apply(x);
        i++;
      } else {
        apply(y);
        j++;
      }
    } else if (x) {
      apply(x);
      i++;
    } else if (y) {
      apply(y);
      j++;
    }
  }
  for (let k = pos; k < base.length; k++) out.push(base[k]);
  return out;
};

export const merge3 = <T>(base: T[], ours: T[], theirs: T[], refine?: Refine<T>): T[] | null => {
  const a = diffHunks(base, ours);
  const b = diffHunks(base, theirs);
  return a && b ? mergeHunks(base, a, b, refine) : null;
};

// Whitespace rides on the token before it, so bare spaces never align on
// their own; only leading indentation stands alone.
const TOKEN = /\s+|[\p{L}\p{N}_$]+\s*|[^\s\p{L}\p{N}_$]\s*/gu;
export const tokenize = (text: string): string[] => text.match(TOKEN) ?? [];

const tokenizeLines = (lines: string[]): string[] => lines.flatMap((l) => tokenize(`${l}\n`));

const splitLines = (text: string): string[] => {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};

const joinLines = (lines: string[]): string => (lines.length ? `${lines.join('\n')}\n` : '');

/**
 * Token merge of a contested line region. Each side's token hunks are
 * computed inside the lines that side replaced, so similar lines elsewhere
 * in the region cannot pull the alignment apart.
 */
const refineByToken: Refine<string> = (baseLines, oursHunks, theirsHunks) => {
  const tokens: string[] = [];
  const starts: number[] = [];
  for (const line of baseLines) {
    starts.push(tokens.length);
    tokens.push(...tokenize(`${line}\n`));
  }
  starts.push(tokens.length);
  const lift = (hunks: Hunk<string>[]): Hunk<string>[] | null => {
    const lifted: Hunk<string>[] = [];
    for (const h of hunks) {
      const off = starts[h.start];
      const d = diffHunks(tokens.slice(off, starts[h.end]), tokenizeLines(h.insert));
      if (!d) return null;
      lifted.push(...shift(d, off));
    }
    return lifted;
  };
  const a = lift(oursHunks);
  const b = lift(theirsHunks);
  if (!a || !b) return null;
  const merged = mergeHunks(tokens, a, b);
  return merged ? splitLines(merged.join('')) : null;
};

/**
 * Resolve one conflict block: lines first, contested line runs by token.
 * Returns the merged text, or null when the sides edit the same token.
 */
export const resolveBlock = (ours: string, base: string, theirs: string): string | null => {
  const merged = merge3(splitLines(base), splitLines(ours), splitLines(theirs), refineByToken);
  return merged ? joinLines(merged) : null;
};

/**
 * Walk `git merge-file --diff3 -p` output, resolving what it can. Remaining
 * blocks are re-emitted in the plain two-side form editors recognise.
 */
export const resolveConflicts = (
  diff3Output: string,
  labels: { ours: string; base: string; theirs: string },
): { content: string; conflicts: number } => {
  const lines = diff3Output.split('\n');
  const trailingNewline = diff3Output.endsWith('\n');
  if (trailingNewline) lines.pop();
  const out: string[] = [];
  let conflicts = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('<<<<<<< ')) {
      out.push(line);
      i++;
      continue;
    }
    const ours: string[] = [];
    const base: string[] = [];
    const theirs: string[] = [];
    let section: string[] = ours;
    i++;
    let closed = false;
    while (i < lines.length) {
      const l = lines[i++];
      if (section === ours && l.startsWith('||||||| ')) section = base;
      else if ((section === ours || section === base) && l === '=======') section = theirs;
      else if (section === theirs && l.startsWith('>>>>>>> ')) {
        closed = true;
        break;
      } else section.push(l);
    }
    if (!closed) throw new Error('Malformed conflict block in merge output.');
    const resolved = resolveBlock(joinLines(ours), joinLines(base), joinLines(theirs));
    if (resolved !== null) {
      out.push(...splitLines(resolved));
      continue;
    }
    conflicts++;
    out.push(`<<<<<<< ${labels.ours}`, ...ours, '=======', ...theirs, `>>>>>>> ${labels.theirs}`);
  }
  return { content: out.join('\n') + (trailingNewline ? '\n' : ''), conflicts };
};
