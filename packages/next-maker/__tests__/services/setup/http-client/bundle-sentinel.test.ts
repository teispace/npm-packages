import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  injectBundleSentinel,
  installBundleSentinelMount,
  removeBundleSentinelMount,
  resolveBundleSentinelLayoutPath,
  rewriteSentinelImports,
  rewriteServerEntryImports,
  stripBundleSentinel,
} from '../../../../src/services/setup/http-client/injectors';

const LOCALE_LAYOUT = `import type { Metadata } from 'next';
import '@/styles/globals.css';

import { Livvic } from 'next/font/google';
import { hasLocale } from 'next-intl';

import { routing } from '@/i18n/routing';
import { RootProvider } from '@/providers';

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  return (
    <html lang={locale}>
      <body>
        <RootProvider locale={locale}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
`;

const ROOT_LAYOUT = `import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Livvic } from 'next/font/google';
import { RootProvider } from '@/providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RootProvider>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
`;

describe('injectBundleSentinel (pure)', () => {
  it('mounts the sentinel as the first child of <RootProvider> with the right import', () => {
    const result = injectBundleSentinel(LOCALE_LAYOUT);

    expect(result).toContain(
      "import { HttpClientBundleSentinel } from '@/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel';",
    );
    expect(result).toContain('// Regression sentinel');
    // The sentinel must appear BEFORE {children} inside the provider.
    const provIdx = result.indexOf('<RootProvider');
    const sentinelIdx = result.indexOf('<HttpClientBundleSentinel />');
    const childrenIdx = result.indexOf('{children}');
    expect(provIdx).toBeLessThan(sentinelIdx);
    expect(sentinelIdx).toBeLessThan(childrenIdx);
  });

  it('works on a propless <RootProvider> (non-i18n root layout shape)', () => {
    const result = injectBundleSentinel(ROOT_LAYOUT);
    expect(result).toContain('<HttpClientBundleSentinel />');
    // Make sure we didn't break the JSX — open/close tag count balances.
    const opens = (result.match(/<RootProvider\b/g) ?? []).length;
    const closes = (result.match(/<\/RootProvider>/g) ?? []).length;
    expect(opens).toBe(1);
    expect(closes).toBe(1);
  });

  it('is idempotent — second invocation is a no-op', () => {
    const once = injectBundleSentinel(LOCALE_LAYOUT);
    const twice = injectBundleSentinel(once);
    expect(twice).toBe(once);
    // And exactly one sentinel JSX tag, not duplicated.
    expect(twice.match(/<HttpClientBundleSentinel \/>/g)).toHaveLength(1);
  });

  it('throws when no import block is found', () => {
    const bad = '// no imports here\nexport default function L() {}\n';
    expect(() => injectBundleSentinel(bad)).toThrow(/no `import` lines/);
  });

  it('throws when <RootProvider> opening tag is missing', () => {
    const bad = "import 'x';\nexport default function L() { return null; }\n";
    expect(() => injectBundleSentinel(bad)).toThrow(/RootProvider/);
  });
});

describe('stripBundleSentinel (pure)', () => {
  it('removes the import, comment, and JSX line', () => {
    const injected = injectBundleSentinel(LOCALE_LAYOUT);
    const stripped = stripBundleSentinel(injected);

    expect(stripped).not.toContain('HttpClientBundleSentinel');
    expect(stripped).not.toContain('Regression sentinel');
  });

  it('is idempotent on clean input', () => {
    const stripped = stripBundleSentinel(LOCALE_LAYOUT);
    expect(stripped).toBe(LOCALE_LAYOUT);
  });

  it('round-trips back to the original after inject + strip', () => {
    const round = stripBundleSentinel(injectBundleSentinel(LOCALE_LAYOUT));
    expect(round).toBe(LOCALE_LAYOUT);
  });

  it('strips the import even if the leading comment has been reworded', () => {
    // Simulates upstream comment drift — strip must still find the import via
    // the path anchor. The reworded comment dies along with the import line.
    const withRewordedComment = LOCALE_LAYOUT.replace(
      'import { RootProvider }',
      "// A totally different comment about the sentinel\nimport { HttpClientBundleSentinel } from '@/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel';\nimport { RootProvider }",
    ).replace(
      '<RootProvider locale={locale}>',
      '<RootProvider locale={locale}>\n          <HttpClientBundleSentinel />',
    );

    const stripped = stripBundleSentinel(withRewordedComment);
    expect(stripped).not.toContain('HttpClientBundleSentinel');
    expect(stripped).not.toContain('totally different comment');
    expect(stripped).not.toContain('__bundle-sentinel__');
  });

  it('does not remove an unrelated user comment near the import line', () => {
    // Belt-and-braces: the leading-comment match is anchored to the import on
    // the immediately following line, so a far-away comment that mentions
    // "Regression sentinel" stays put.
    const withDistantComment = `import type { Metadata } from 'next';

// Regression sentinel — note for ourselves about something else entirely.

import '@/styles/globals.css';
${LOCALE_LAYOUT.split('\n').slice(1).join('\n')}`;

    const stripped = stripBundleSentinel(withDistantComment);
    expect(stripped).toContain('note for ourselves about something else entirely');
  });
});

describe('resolveBundleSentinelLayoutPath', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-sentinel-resolve-'));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('prefers the [locale] layout when present', async () => {
    await mkdir(path.join(project, 'src/app/[locale]'), { recursive: true });
    await writeFile(path.join(project, 'src/app/[locale]/layout.tsx'), '// stub\n');
    await mkdir(path.join(project, 'src/app'), { recursive: true });
    await writeFile(path.join(project, 'src/app/layout.tsx'), '// stub\n');

    const result = resolveBundleSentinelLayoutPath(project);
    expect(result).toBe(path.join(project, 'src/app/[locale]/layout.tsx'));
  });

  it('falls back to the root layout when [locale] is absent', async () => {
    await mkdir(path.join(project, 'src/app'), { recursive: true });
    await writeFile(path.join(project, 'src/app/layout.tsx'), '// stub\n');

    const result = resolveBundleSentinelLayoutPath(project);
    expect(result).toBe(path.join(project, 'src/app/layout.tsx'));
  });

  it('returns null when neither layout exists', () => {
    const result = resolveBundleSentinelLayoutPath(project);
    expect(result).toBeNull();
  });
});

describe('installBundleSentinelMount / removeBundleSentinelMount (filesystem)', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-sentinel-fs-'));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('installs into the [locale] layout when present', async () => {
    await mkdir(path.join(project, 'src/app/[locale]'), { recursive: true });
    const target = path.join(project, 'src/app/[locale]/layout.tsx');
    await writeFile(target, LOCALE_LAYOUT);

    await installBundleSentinelMount(project);

    const result = await readFile(target, 'utf-8');
    expect(result).toContain('<HttpClientBundleSentinel />');
  });

  it('installs into the root layout when no [locale] layout exists', async () => {
    await mkdir(path.join(project, 'src/app'), { recursive: true });
    const target = path.join(project, 'src/app/layout.tsx');
    await writeFile(target, ROOT_LAYOUT);

    await installBundleSentinelMount(project);

    const result = await readFile(target, 'utf-8');
    expect(result).toContain('<HttpClientBundleSentinel />');
  });

  it('is a silent no-op when no layout exists', async () => {
    // Should not throw, just nothing to do.
    await expect(installBundleSentinelMount(project)).resolves.toBeUndefined();
    await expect(removeBundleSentinelMount(project)).resolves.toBeUndefined();
  });

  it('remove strips the sentinel back out', async () => {
    await mkdir(path.join(project, 'src/app/[locale]'), { recursive: true });
    const target = path.join(project, 'src/app/[locale]/layout.tsx');
    await writeFile(target, LOCALE_LAYOUT);

    await installBundleSentinelMount(project);
    await removeBundleSentinelMount(project);

    const result = await readFile(target, 'utf-8');
    expect(result).not.toContain('HttpClientBundleSentinel');
    expect(result).toBe(LOCALE_LAYOUT);
  });
});

const SENTINEL_SOURCE = `'use client';

import {
  axiosClient,
  createAxiosClient,
  createFetchClient,
  fetchClient,
  toSearchParams,
} from '@/lib/utils/http';

const __sentinel__ = {
  axiosClient,
  createAxiosClient,
  createFetchClient,
  fetchClient,
  toSearchParams,
};

export function HttpClientBundleSentinel(): null {
  if (typeof window !== 'undefined') {
    (window as unknown as { __http_sentinel__: unknown }).__http_sentinel__ = __sentinel__;
  }
  return null;
}
`;

describe('rewriteSentinelImports', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-sentinel-rewrite-'));
    await mkdir(path.join(project, 'src/lib/utils/http/__bundle-sentinel__'), { recursive: true });
    await writeFile(
      path.join(project, 'src/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel.tsx'),
      SENTINEL_SOURCE,
    );
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('reduces the sentinel to fetch-only symbols when fetch is the sole client', async () => {
    await rewriteSentinelImports(project, ['fetch']);

    const result = await readFile(
      path.join(project, 'src/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel.tsx'),
      'utf-8',
    );
    // Axios symbols are gone (would cause "export not found" build errors).
    expect(result).not.toContain('axiosClient');
    expect(result).not.toContain('createAxiosClient');
    // Fetch symbols survive.
    expect(result).toContain('fetchClient');
    expect(result).toContain('createFetchClient');
    // toSearchParams (in shared/) is universal — always referenced.
    expect(result).toContain('toSearchParams');
  });

  it('reduces the sentinel to axios-only symbols when axios is the sole client', async () => {
    await rewriteSentinelImports(project, ['axios']);

    const result = await readFile(
      path.join(project, 'src/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel.tsx'),
      'utf-8',
    );
    expect(result).not.toContain('fetchClient');
    expect(result).not.toContain('createFetchClient');
    expect(result).toContain('axiosClient');
    expect(result).toContain('createAxiosClient');
    expect(result).toContain('toSearchParams');
  });

  it('preserves both clients when both are active', async () => {
    await rewriteSentinelImports(project, ['fetch', 'axios']);

    const result = await readFile(
      path.join(project, 'src/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel.tsx'),
      'utf-8',
    );
    expect(result).toContain('axiosClient');
    expect(result).toContain('fetchClient');
    expect(result).toContain('toSearchParams');
  });

  it('is idempotent — re-running with the same client set is a byte-for-byte no-op', async () => {
    await rewriteSentinelImports(project, ['fetch']);
    const once = await readFile(
      path.join(project, 'src/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel.tsx'),
      'utf-8',
    );
    await rewriteSentinelImports(project, ['fetch']);
    const twice = await readFile(
      path.join(project, 'src/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel.tsx'),
      'utf-8',
    );
    expect(twice).toBe(once);
  });

  it('is a no-op when the sentinel file does not exist', async () => {
    await rm(path.join(project, 'src/lib/utils/http/__bundle-sentinel__'), { recursive: true });
    await expect(rewriteSentinelImports(project, ['fetch'])).resolves.toBeUndefined();
  });
});

const SERVER_ENTRY_SOURCE = `import 'server-only';

import { cookies } from 'next/headers';

import { createAxiosClient } from './axios-client';
import { handleUnauthorizedRedirect } from './client-utils';
import { createFetchClient } from './fetch-client';
import { secureStorageTokenStore } from './token-store';

async function readServerCookieHeader(): Promise<string | undefined> {
  const all = (await cookies()).getAll();
  if (all.length === 0) return undefined;
  return all.map((c) => \`\${c.name}=\${c.value}\`).join('; ');
}

export const fetchClient = createFetchClient({
  tokenStore: secureStorageTokenStore,
  onUnauthorized: handleUnauthorizedRedirect,
  cache: 'no-store',
  cookieResolver: readServerCookieHeader,
});

export const axiosClient = createAxiosClient({
  tokenStore: secureStorageTokenStore,
  onUnauthorized: handleUnauthorizedRedirect,
  cookieResolver: readServerCookieHeader,
});

export { createAxiosClient, createFetchClient };
`;

describe('rewriteServerEntryImports', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-server-entry-'));
    await mkdir(path.join(project, 'src/lib/utils/http'), { recursive: true });
    await writeFile(path.join(project, 'src/lib/utils/http/server.ts'), SERVER_ENTRY_SOURCE);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('strips axios when fetch is the sole client', async () => {
    await rewriteServerEntryImports(project, ['fetch']);

    const result = await readFile(path.join(project, 'src/lib/utils/http/server.ts'), 'utf-8');
    // axios-* gone — both the import and the createAxiosClient instantiation.
    expect(result).not.toContain('./axios-client');
    expect(result).not.toContain('createAxiosClient');
    expect(result).not.toContain('axiosClient = createAxiosClient');
    // fetch survives.
    expect(result).toContain('createFetchClient');
    expect(result).toContain('fetchClient = createFetchClient');
    // The trailing `export { ... };` line has axios trimmed but fetch kept.
    expect(result).toMatch(/export\s*\{\s*createFetchClient\s*\};/);
  });

  it('strips fetch when axios is the sole client', async () => {
    await rewriteServerEntryImports(project, ['axios']);

    const result = await readFile(path.join(project, 'src/lib/utils/http/server.ts'), 'utf-8');
    expect(result).not.toContain('./fetch-client');
    expect(result).not.toContain('createFetchClient');
    expect(result).toContain('createAxiosClient');
    expect(result).toMatch(/export\s*\{\s*createAxiosClient\s*\};/);
  });

  it('preserves both clients when both are active', async () => {
    await rewriteServerEntryImports(project, ['fetch', 'axios']);

    const result = await readFile(path.join(project, 'src/lib/utils/http/server.ts'), 'utf-8');
    expect(result).toContain('createAxiosClient');
    expect(result).toContain('createFetchClient');
  });

  it('is a no-op when clients is empty (caller should delete the file)', async () => {
    await rewriteServerEntryImports(project, []);

    const result = await readFile(path.join(project, 'src/lib/utils/http/server.ts'), 'utf-8');
    expect(result).toBe(SERVER_ENTRY_SOURCE);
  });

  it('is idempotent — re-running with the same active set is a byte-for-byte no-op', async () => {
    await rewriteServerEntryImports(project, ['fetch']);
    const once = await readFile(path.join(project, 'src/lib/utils/http/server.ts'), 'utf-8');
    await rewriteServerEntryImports(project, ['fetch']);
    const twice = await readFile(path.join(project, 'src/lib/utils/http/server.ts'), 'utf-8');
    expect(twice).toBe(once);
  });

  it('is a no-op when server.ts does not exist', async () => {
    await rm(path.join(project, 'src/lib/utils/http/server.ts'));
    await expect(rewriteServerEntryImports(project, ['fetch'])).resolves.toBeUndefined();
  });
});
