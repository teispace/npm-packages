import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

/** A run of words in a changed block: kept, added or removed. */
export interface WordChange {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/** One top-level block in a comparison of two versions. */
export type BlockChange =
  | { kind: 'same'; text: string }
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string }
  /** The block was edited: its words, kept, added and removed. */
  | { kind: 'changed'; before: string; after: string; words: WordChange[] };

export interface VersionDiff {
  blocks: BlockChange[];
  /** Blocks added, removed and changed. */
  added: number;
  removed: number;
  changed: number;
}

type NodeJSON = SerializedLexicalNode & { children?: NodeJSON[]; text?: string };

/** A node's text, as Lexical's `getTextContent` would give it. */
function textOf(node: NodeJSON): string {
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'linebreak') return '\n';
  if (node.type === 'tab') return '\t';
  if (!node.children) return '';
  // Blocks inside a block (list items, table cells) are lines of their own.
  return node.children
    .map(textOf)
    .join(node.children.some((child) => child.children && !isInline(child)) ? '\n' : '');
}

const INLINE = new Set(['link', 'autolink', 'mark', 'hashtag', 'mention', 'ruby']);
const isInline = (node: NodeJSON) => INLINE.has(node.type);

/** The text of each top-level block of a document. */
export function blockTexts(state: SerializedEditorState): string[] {
  return (state.root.children as NodeJSON[]).map(textOf);
}

/** The longest common subsequence of two lists, as index pairs. */
function lcs<T>(a: readonly T[], b: readonly T[]): Array<[number, number]> {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? (table[(i + 1) * cols + j + 1] as number) + 1
          : Math.max(table[(i + 1) * cols + j] as number, table[i * cols + j + 1] as number);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if ((table[(i + 1) * cols + j] as number) >= (table[i * cols + j + 1] as number)) i++;
    else j++;
  }
  return pairs;
}

/** Words and the spaces between them, so joining them gives the text back. */
const words = (text: string) => text.match(/\s+|[^\s]+/g) ?? [];

/** How one block's text became another's, word by word. */
export function diffWords(before: string, after: string): WordChange[] {
  const a = words(before);
  const b = words(after);
  const out: WordChange[] = [];
  const push = (kind: WordChange['kind'], text: string) => {
    const last = out.at(-1);
    if (last?.kind === kind) last.text += text;
    else if (text) out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  for (const [x, y] of [...lcs(a, b), [a.length, b.length] as [number, number]]) {
    while (i < x) push('removed', a[i++] as string);
    while (j < y) push('added', b[j++] as string);
    if (x < a.length) push('same', a[x] as string);
    i = x + 1;
    j = y + 1;
  }
  return out;
}

/**
 * Compare two documents block by block: blocks kept, added and removed,
 * and a removed block followed by an added one shown as one edited block
 * with its words marked.
 */
export function diffDocuments(
  before: SerializedEditorState,
  after: SerializedEditorState,
): VersionDiff {
  const a = blockTexts(before);
  const b = blockTexts(after);
  const raw: BlockChange[] = [];
  let i = 0;
  let j = 0;
  for (const [x, y] of [...lcs(a, b), [a.length, b.length] as [number, number]]) {
    const removed = a.slice(i, x);
    const added = b.slice(j, y);
    // Pair edits up: the nth removed block became the nth added one.
    const paired = Math.min(removed.length, added.length);
    for (let k = 0; k < paired; k++) {
      const was = removed[k] as string;
      const now = added[k] as string;
      raw.push({ kind: 'changed', before: was, after: now, words: diffWords(was, now) });
    }
    for (const text of removed.slice(paired)) raw.push({ kind: 'removed', text });
    for (const text of added.slice(paired)) raw.push({ kind: 'added', text });
    if (x < a.length) raw.push({ kind: 'same', text: a[x] as string });
    i = x + 1;
    j = y + 1;
  }
  return {
    blocks: raw,
    added: raw.filter((block) => block.kind === 'added').length,
    removed: raw.filter((block) => block.kind === 'removed').length,
    changed: raw.filter((block) => block.kind === 'changed').length,
  };
}
