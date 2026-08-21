/**
 * Pure `next.config.ts` transform for the @next/bundle-analyzer retrofit.
 *
 * Extracted from the service so the installer and the `doctor --fix` repair
 * path share one implementation.
 */

const EXPORT_DEFAULT_RE = /export default (.*?);/;

export const ANALYZE_SCRIPT = 'ANALYZE=true next build';

/** True when the config already references the analyzer. */
export const hasBundleAnalyzer = (content: string): boolean =>
  content.includes('@next/bundle-analyzer');

/**
 * Add the `withBundleAnalyzer` import and wrap the default export.
 *
 * - Idempotent: returns the input untouched when the analyzer is already
 *   referenced anywhere in the file.
 * - Throws when there is no `export default …;` to wrap.
 */
export const injectBundleAnalyzer = (content: string): string => {
  if (hasBundleAnalyzer(content)) return content;

  const withImport = `import withBundleAnalyzer from '@next/bundle-analyzer';\n${content}`;

  const match = withImport.match(EXPORT_DEFAULT_RE);
  if (!match) {
    throw new Error('Could not locate `export default` in next.config.ts.');
  }

  const existingExport = match[1];
  const replacement = `const bundleAnalyzer = withBundleAnalyzer({\n  enabled: process.env.ANALYZE === 'true',\n});\n\nexport default bundleAnalyzer(${existingExport});`;
  return withImport.replace(EXPORT_DEFAULT_RE, replacement);
};
