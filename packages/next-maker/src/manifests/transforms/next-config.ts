/**
 * Transforms for `next.config.ts` — undo the wraps that `setupI18n` and
 * `setupBundleAnalyzer` apply.
 *
 * Conservative: each helper bails out (returns `null`) if the file's shape
 * has drifted away from the canonical pattern. Better to ask the user to
 * resolve it than to corrupt their config.
 */

import type { RemoveTransform } from '../types';
import { removeNamedImport } from './unwrap-jsx';

/**
 * Undo `setupI18n`'s wrap: removes
 *   - `import createNextIntlPlugin from 'next-intl/plugin';`
 *   - `const withNextIntl = createNextIntlPlugin(...);`
 *   - the `withNextIntl(...)` call inside the default export, replacing it
 *     with the inner argument.
 */
export const unwrapNextIntlPlugin: RemoveTransform = (content) => {
  let result = content
    .split('\n')
    .filter(
      (line) =>
        !/^import\s+createNextIntlPlugin\s+from\s+['"]next-intl\/plugin['"];?\s*$/.test(line),
    )
    .join('\n');

  // Drop the `const withNextIntl = createNextIntlPlugin(...)` line(s). The
  // call may take args, so allow multi-line content between the outer parens.
  result = result.replace(/^const\s+withNextIntl\s*=\s*createNextIntlPlugin\([^)]*\);\s*\n?/m, '');

  // Unwrap `withNextIntl(<arg>)` in the default export. The inner arg is
  // typically a bare identifier (`nextConfig`) or a sibling wrap call
  // (`bundleAnalyzer(nextConfig)`). We tolerate the second case by allowing
  // one level of nested parens.
  const callRe = /withNextIntl\(\s*((?:[^()]|\([^()]*\))+?)\s*\)/;
  if (!callRe.test(result)) return null;
  result = result.replace(callRe, '$1');

  return result;
};

/**
 * Undo `setupBundleAnalyzer`'s wrap: removes
 *   - `import withBundleAnalyzer from '@next/bundle-analyzer';`
 *   - the `const bundleAnalyzer = withBundleAnalyzer({ ... });` block.
 *   - the `bundleAnalyzer(...)` call inside the default export.
 */
export const unwrapBundleAnalyzer: RemoveTransform = (content) => {
  let result = removeNamedImport(content, 'withBundleAnalyzer');

  // The `const bundleAnalyzer = withBundleAnalyzer({...});` block is
  // generated as a multi-line statement. We match conservatively: a `const`
  // declaration whose call body never closes its top-level `}` until we
  // see `);`. Bail out if it isn't there.
  const blockRe = /^const\s+bundleAnalyzer\s*=\s*withBundleAnalyzer\(\{[\s\S]*?\}\);\s*\n?/m;
  if (!blockRe.test(result)) {
    return null;
  }
  result = result.replace(blockRe, '');

  // Unwrap `bundleAnalyzer(<arg>)` in the default export.
  const callRe = /bundleAnalyzer\(\s*((?:[^()]|\([^()]*\))+?)\s*\)/;
  if (!callRe.test(result)) return null;
  result = result.replace(callRe, '$1');

  return result;
};
