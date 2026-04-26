/**
 * Pure transformation logic for the `setupSecurityHeaders` retrofit.
 *
 * Kept separate from `index.ts` so it can be unit-tested with string inputs
 * without touching the filesystem.
 */

/**
 * The header set the starter ships in `next.config.ts`. Single source of truth
 * — `setupSecurityHeaders` and the manifest (D1) both consume this list.
 */
export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
];

const NEXT_CONFIG_BLOCK_RE = /(const\s+nextConfig\s*:\s*NextConfig\s*=\s*\{)/;

// Matches `  headers:` at the start of an indented line — the config-key
// shape, not the `key: 'Permissions-Policy'` string-value shape.
const HEADERS_KEY_RE = /^\s+headers\s*:/m;

const buildHeadersBlock = (headers: ReadonlyArray<{ key: string; value: string }>): string => {
  const lines = headers
    .map(({ key, value }) => `          { key: '${key}', value: '${value}' },`)
    .join('\n');

  return `\n  headers: async () => {
    return [
      {
        source: '/:path*',
        headers: [
${lines}
        ],
      },
    ];
  },`;
};

export const hasSecurityHeaders = (content: string): boolean => HEADERS_KEY_RE.test(content);

/**
 * Inject the standard security-headers block into a `next.config.ts` source.
 *
 * - Idempotent: returns the input unchanged if a `headers:` key already exists
 *   anywhere in the file (we never overwrite a user-defined header set).
 * - Throws if the canonical `const nextConfig: NextConfig = {` shape is missing
 *   — same contract as the React-Compiler retrofit, so behaviour stays
 *   predictable across `setup` services.
 */
export const injectSecurityHeaders = (
  content: string,
  headers: ReadonlyArray<{ key: string; value: string }> = SECURITY_HEADERS,
): string => {
  if (hasSecurityHeaders(content)) {
    return content;
  }
  if (!NEXT_CONFIG_BLOCK_RE.test(content)) {
    throw new Error('Could not locate `const nextConfig: NextConfig = {` in next.config.ts.');
  }
  return content.replace(NEXT_CONFIG_BLOCK_RE, `$1${buildHeadersBlock(headers)}`);
};
