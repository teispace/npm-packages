/**
 * JSX unwrap helpers used by manifests' `removePattern` to undo a provider
 * chain wrap (e.g. unwrap `<NextIntlClientProvider>{children}</NextIntlClientProvider>`
 * back to `{children}`) and clean up the now-orphan import statement.
 *
 * String-only transforms — no AST. Conservative: bail out (return `null`) when
 * the file shape has drifted from the canonical pattern instead of guessing.
 */

import type { RemoveTransform } from '../types';

/**
 * Drop a named or default import for `symbol`. If the import was the only
 * symbol in a named-import block, the whole line is removed; otherwise the
 * symbol is excised from the brace list.
 */
export const removeNamedImport = (content: string, symbol: string): string => {
  const lines = content.split('\n');
  const out: string[] = [];
  const defaultRe = new RegExp(`^import\\s+${symbol}\\s+from\\s+['"][^'"]+['"];?\\s*$`);
  const namedRe = /^(import\s+)\{([^}]+)\}(\s+from\s+['"][^'"]+['"];?\s*)$/;

  for (const line of lines) {
    if (defaultRe.test(line)) continue; // drop default import line entirely

    const m = line.match(namedRe);
    if (m) {
      const symbols = m[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const filtered = symbols.filter((s) => {
        const name = s
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          .trim();
        return name !== symbol;
      });
      if (filtered.length === 0) continue; // every symbol was the target — drop line
      if (filtered.length < symbols.length) {
        out.push(`${m[1]}{ ${filtered.join(', ')} }${m[3]}`);
        continue;
      }
    }
    out.push(line);
  }

  return out.join('\n');
};

/**
 * Build a `RemoveTransform` that:
 *   1. Locates `<ComponentName ...>` ... `</ComponentName>` in the file.
 *   2. Replaces the wrap with its body, outdented by one level (2 spaces).
 *   3. Drops the orphan import for `ComponentName`.
 *
 * Returns `null` (→ manual cleanup) when:
 * - The opening tag isn't found.
 * - The opening tag spans multiple lines (attributes broken across lines).
 * - No matching closing tag at the same indent is found.
 *
 * The conservative bail-outs keep auto-removal trustworthy: if the user has
 * customised the file beyond the canonical shape, we surface a manual hint
 * rather than corrupt their JSX.
 */
export const unwrapJsxChain =
  (componentName: string): RemoveTransform =>
  (content) => {
    const lines = content.split('\n');

    const openRe = new RegExp(`^([ \\t]*)<${componentName}\\b`);
    let openIdx = -1;
    let openIndent = '';
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(openRe);
      if (m) {
        openIdx = i;
        openIndent = m[1];
        break;
      }
    }
    if (openIdx === -1) return null;

    // Opening tag must close on the same line — multi-line opening tags
    // would require attribute-aware parsing which we deliberately skip.
    if (!/>\s*$/.test(lines[openIdx])) return null;

    const escapedIndent = openIndent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const closeRe = new RegExp(`^${escapedIndent}<\\/${componentName}>\\s*$`);
    let closeIdx = -1;
    for (let i = openIdx + 1; i < lines.length; i++) {
      if (closeRe.test(lines[i])) {
        closeIdx = i;
        break;
      }
    }
    if (closeIdx === -1) return null;

    // Outdent the body by 2 spaces (one indent level).
    const inner = lines
      .slice(openIdx + 1, closeIdx)
      .map((line) => (line.startsWith('  ') ? line.slice(2) : line));

    const merged = [...lines.slice(0, openIdx), ...inner, ...lines.slice(closeIdx + 1)].join('\n');

    return removeNamedImport(merged, componentName);
  };
