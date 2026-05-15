import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectPrompts } from '../../../../src/prompts/create-app.prompt';
import { cleanupSEO } from '../../../../src/services/init/cleanup/seo.cleanup';

/**
 * Build a minimal ProjectPrompts. Only `i18n` matters for cleanupSEO; the
 * rest are filled with neutral defaults to satisfy the type.
 */
const makeAnswers = (i18n: boolean): ProjectPrompts =>
  ({
    projectName: 'test',
    description: '',
    author: '',
    version: '0.0.0',
    packageManager: 'yarn',
    gitRemote: '',
    pushToRemote: false,
    gitIssues: '',
    gitHomepage: '',
    httpClient: 'fetch',
    email: '',
    company: '',
    keepTemplates: false,
    darkMode: false,
    redux: false,
    i18n,
    communityFiles: [],
    readme: false,
    docker: false,
    ci: false,
    preCommitHooks: false,
    commitizen: false,
    copyEnv: false,
    tests: false,
    reactCompiler: false,
    bundleAnalyzer: false,
  }) as ProjectPrompts;

// What the template ships — these are the imports cleanupSEO needs to strip
// when i18n is opted out.
const INTL_SEO = `import type { Metadata } from 'next';

import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';

const APP_URL = env.NEXT_PUBLIC_APP_URL;
const APP_NAME = 'Nextjs Starter';

function localizedUrl(path: string, locale: string): string {
  return locale === routing.defaultLocale ? \`\${APP_URL}\${path}\` : \`\${APP_URL}/\${locale}\${path}\`;
}

export function generateSEOMetadata(params: { title: string; description: string; path?: string }) {
  return { title: params.title, description: params.description };
}
`;

const INTL_SITEMAP = `import type { MetadataRoute } from 'next';

import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.map((locale) => ({ url: \`\${env.NEXT_PUBLIC_APP_URL}/\${locale}\` }));
}
`;

describe('cleanupSEO', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-seo-cleanup-'));
    await mkdir(path.join(project, 'src/lib/config'), { recursive: true });
    await mkdir(path.join(project, 'src/app'), { recursive: true });
    await writeFile(path.join(project, 'src/lib/config/seo.ts'), INTL_SEO);
    await writeFile(path.join(project, 'src/app/sitemap.ts'), INTL_SITEMAP);
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('rewrites seo.ts to drop @/i18n/routing when i18n is off', async () => {
    await cleanupSEO(project, makeAnswers(false));

    const seo = await readFile(path.join(project, 'src/lib/config/seo.ts'), 'utf-8');
    expect(seo).not.toContain('@/i18n');
    expect(seo).not.toContain('routing');
    expect(seo).not.toContain('localizedUrl');
  });

  it('preserves generateSEOMetadata signature in the non-i18n version', async () => {
    await cleanupSEO(project, makeAnswers(false));

    const seo = await readFile(path.join(project, 'src/lib/config/seo.ts'), 'utf-8');
    // Callers in generated pages rely on this exact API — title, description,
    // path, image, noIndex — so the cleanup must not narrow it.
    expect(seo).toContain('export function generateSEOMetadata');
    expect(seo).toContain('title:');
    expect(seo).toContain('description:');
    expect(seo).toContain('path?:');
    expect(seo).toContain('image?:');
    expect(seo).toContain('noIndex?:');
  });

  it('preserves canonical + openGraph + twitter + robots blocks', async () => {
    await cleanupSEO(project, makeAnswers(false));

    const seo = await readFile(path.join(project, 'src/lib/config/seo.ts'), 'utf-8');
    expect(seo).toContain('canonical:');
    expect(seo).toContain('openGraph:');
    expect(seo).toContain('twitter:');
    expect(seo).toContain('robots:');
    // Locale-specific alternates require routing — must NOT survive.
    expect(seo).not.toContain('languages:');
  });

  it('rewrites sitemap.ts to drop @/i18n/routing when i18n is off', async () => {
    await cleanupSEO(project, makeAnswers(false));

    const sitemap = await readFile(path.join(project, 'src/app/sitemap.ts'), 'utf-8');
    expect(sitemap).not.toContain('@/i18n');
    expect(sitemap).not.toContain('routing');
    expect(sitemap).toContain('export default function sitemap');
    expect(sitemap).toContain('MetadataRoute.Sitemap');
  });

  it('is a no-op when i18n is on', async () => {
    await cleanupSEO(project, makeAnswers(true));

    const seo = await readFile(path.join(project, 'src/lib/config/seo.ts'), 'utf-8');
    const sitemap = await readFile(path.join(project, 'src/app/sitemap.ts'), 'utf-8');
    expect(seo).toBe(INTL_SEO);
    expect(sitemap).toBe(INTL_SITEMAP);
  });

  it('skips silently when the target files do not exist', async () => {
    await rm(path.join(project, 'src/lib/config/seo.ts'));
    await rm(path.join(project, 'src/app/sitemap.ts'));

    // Should not throw — users who deleted these manually shouldn't fail init.
    await expect(cleanupSEO(project, makeAnswers(false))).resolves.toBeUndefined();
    expect(existsSync(path.join(project, 'src/lib/config/seo.ts'))).toBe(false);
    expect(existsSync(path.join(project, 'src/app/sitemap.ts'))).toBe(false);
  });
});
