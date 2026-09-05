/**
 * Composition anchors: comments the starter places on lines that belong to an
 * optional feature. See the starter's `docs/composition.md`.
 *
 *   `// @next-maker:ws`            own line  → this line and the next go
 *   `foo(); // @next-maker:ws`     trailing  → this line goes
 *   `:start` / `:end` markers      block     → everything between, inclusive
 *
 * All transforms are string-based and line-oriented. They never guess: an
 * unmatched `:start` throws so a broken starter fails loudly.
 */

const ANCHOR_RE = /@next-maker:([\w-]+)(?::(start|end))?/;

const COMMENT_ONLY_RE = /^\s*(?:\{\s*\/\*.*?\*\/\s*\}|\/\*.*?\*\/|\/\/.*|#.*)\s*$/;

/** Strip the comment that carries the anchor from a line, keeping the code. */
const removeAnchorComment = (line: string): string =>
  line
    .replace(/\s*\{\s*\/\*[^*]*@next-maker:[^*]*\*\/\s*\}\s*$/, '')
    .replace(/\s*\/\*[^*]*@next-maker:[^*]*\*\/\s*$/, '')
    .replace(/\s*\/\/[^\n]*@next-maker:[^\n]*$/, '')
    .replace(/\s*#[^\n]*@next-maker:[^\n]*$/, '');

export interface StripOptions {
  /** Anchor ids whose lines and blocks are removed (features that are off). */
  off: ReadonlySet<string>;
}

/**
 * Remove the code of every `off` feature and the anchor comments of every
 * other feature, so the output carries no `@next-maker` residue.
 */
export const stripAnchors = (content: string, { off }: StripOptions): string => {
  const lines = content.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(ANCHOR_RE);
    if (!match) {
      out.push(line);
      continue;
    }
    const [, id, marker] = match;
    const isOff = off.has(id);

    if (marker === 'start') {
      const endIdx = findEnd(lines, i + 1, id);
      if (isOff) {
        i = endIdx;
      }
      // Feature stays on: drop only the marker lines, keep the body.
      // (The `:end` line is skipped when reached because it carries an anchor.)
      continue;
    }
    if (marker === 'end') {
      continue;
    }

    const ownLine = COMMENT_ONLY_RE.test(line);
    if (isOff) {
      if (ownLine) i++; // also drop the line the anchor annotates
      continue;
    }
    if (ownLine) continue;
    out.push(removeAnchorComment(line));
  }

  return out.join('\n');
};

const findEnd = (lines: string[], from: number, id: string): number => {
  for (let j = from; j < lines.length; j++) {
    const m = lines[j].match(ANCHOR_RE);
    if (m && m[1] === id && m[2] === 'end') return j;
  }
  throw new Error(`Anchor @next-maker:${id}:start has no matching :end`);
};

export const hasAnchors = (content: string): boolean => content.includes('@next-maker:');

/** Drop `symbol` from an import statement, or the whole statement when it was alone. */
export const removeImportedSymbol = (content: string, symbol: string): string => {
  const lines = content.split('\n');
  const out: string[] = [];
  const defaultRe = new RegExp(`^import\\s+${symbol}\\s+from\\s+['"][^'"]+['"];?\\s*$`);
  const namedRe = /^(import\s+(?:type\s+)?)\{([^}]+)\}(\s+from\s+['"][^'"]+['"];?\s*)$/;
  for (const line of lines) {
    if (defaultRe.test(line)) continue;
    const m = line.match(namedRe);
    if (m) {
      const symbols = m[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const kept = symbols.filter((s) => s.replace(/^type\s+/, '').split(/\s+as\s+/)[0] !== symbol);
      if (kept.length === 0) continue;
      if (kept.length < symbols.length) {
        out.push(`${m[1]}{ ${kept.join(', ')} }${m[3]}`);
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
};

/**
 * Remove `<Tag ...>` and its matching `</Tag>` (found at the same indent),
 * outdenting the body by one level, and drop the now-unused import. Returns
 * the content unchanged when the tag is absent. Self-closing tags are left
 * alone: there is nothing to unwrap.
 */
export const unwrapJsx = (content: string, tag: string): string => {
  const lines = content.split('\n');
  const openRe = new RegExp(`^([ \\t]*)<${tag}\\b`);
  let openIdx = -1;
  let indent = '';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(openRe);
    if (m) {
      openIdx = i;
      indent = m[1];
      break;
    }
  }
  if (openIdx === -1) return content;

  // The opening tag may span several lines; it ends at the first `>`.
  let openEnd = openIdx;
  while (openEnd < lines.length && !/>\s*$/.test(lines[openEnd])) openEnd++;
  if (openEnd >= lines.length) throw new Error(`unwrapJsx: opening <${tag}> never closes`);
  if (/\/>\s*$/.test(lines[openEnd])) return content;

  const escaped = indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const closeRe = new RegExp(`^${escaped}</${tag}>\\s*$`);
  let closeIdx = -1;
  for (let i = openEnd + 1; i < lines.length; i++) {
    if (closeRe.test(lines[i])) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) throw new Error(`unwrapJsx: no closing </${tag}> at the opening indent`);

  const body = lines
    .slice(openEnd + 1, closeIdx)
    .map((line) => (line.startsWith('  ') ? line.slice(2) : line));
  const merged = [...lines.slice(0, openIdx), ...body, ...lines.slice(closeIdx + 1)].join('\n');
  return removeImportedSymbol(merged, tag);
};

/** Replace `name(<expr>)` with `<expr>` wherever it appears, honouring nested parentheses. */
export const unwrapCall = (content: string, name: string): string => {
  const re = new RegExp(`\\b${name}\\(`, 'g');
  let out = content;
  let match: RegExpExecArray | null = re.exec(out);
  while (match) {
    const start = match.index;
    let depth = 0;
    let i = start + match[0].length - 1;
    for (; i < out.length; i++) {
      if (out[i] === '(') depth++;
      else if (out[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) throw new Error(`unwrapCall: unbalanced parentheses after ${name}(`);
    const inner = out.slice(start + match[0].length, i);
    out = out.slice(0, start) + inner + out.slice(i + 1);
    re.lastIndex = start;
    match = re.exec(out);
  }
  return out;
};
