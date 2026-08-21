/**
 * Pure `next.config.ts` transform for the React Compiler retrofit.
 *
 * Extracted from the service so both the installer and the `doctor --fix`
 * repair path share one implementation (and so it can be unit-tested against
 * strings without touching the filesystem).
 */

const CONFIG_BLOCK_RE = /(const\s+nextConfig\s*:\s*NextConfig\s*=\s*\{)/;

/** True when the file already declares a `reactCompiler` flag (any value). */
export const hasReactCompilerFlag = (content: string): boolean => /reactCompiler\s*:/.test(content);

/**
 * Insert `reactCompiler: true` into `const nextConfig: NextConfig = { … }`.
 *
 * - Idempotent: returns the input untouched when a `reactCompiler` key is
 *   already present — we never flip a user's explicit `false`.
 * - Throws when the canonical config shape is missing, matching the
 *   security-headers retrofit's contract.
 */
export const injectReactCompilerFlag = (content: string): string => {
  if (hasReactCompilerFlag(content)) return content;
  if (!CONFIG_BLOCK_RE.test(content)) {
    throw new Error('Could not locate `const nextConfig: NextConfig = {` in next.config.ts.');
  }
  return content.replace(CONFIG_BLOCK_RE, '$1\n  reactCompiler: true,');
};
