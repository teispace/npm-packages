import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists, writeFile } from '../../../core/files';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

/**
 * The template's `src/lib/config/seo.ts` and `src/app/sitemap.ts` import
 * `routing` from `@/i18n/routing` to compose locale-aware URLs. When the
 * user opts out of i18n, `src/i18n/` is deleted by `cleanupI18n` — but
 * these two files are outside the i18n manifest's footprint, so they
 * survive and then fail to compile.
 *
 * Rather than regex-transform the originals (brittle against template
 * drift), we overwrite both with intl-free versions that keep the same
 * public surface: `generateSEOMetadata({ title, description, path, image,
 * noIndex })` still works for any generated page that calls it.
 */
export const cleanupSEO = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (answers.i18n) return;

  const seoPath = path.join(projectPath, PROJECT_PATHS.SEO_FILE);
  if (fileExists(seoPath)) {
    await writeFile(seoPath, NON_I18N_SEO);
  }

  const sitemapPath = path.join(projectPath, PROJECT_PATHS.SITEMAP_FILE);
  if (fileExists(sitemapPath)) {
    await writeFile(sitemapPath, NON_I18N_SITEMAP);
  }
};

const NON_I18N_SEO = `import type { Metadata } from 'next';

import { env } from '@/lib/env';

const APP_URL = env.NEXT_PUBLIC_APP_URL;
const APP_NAME = 'Nextjs Starter';

type SEOParams = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
};

export function generateSEOMetadata({
  title,
  description,
  path = '',
  image,
  noIndex = false,
}: SEOParams): Metadata {
  const url = \`\${APP_URL}\${path}\`;
  const ogImage = image || \`\${APP_URL}/og-image.png\`;

  return {
    title,
    description,
    metadataBase: new URL(APP_URL),
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      siteName: APP_NAME,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          'max-video-preview': -1,
          'max-image-preview': 'large' as const,
          'max-snippet': -1,
        },
  };
}

export { APP_NAME, APP_URL };
`;

const NON_I18N_SITEMAP = `import type { MetadataRoute } from 'next';

import { env } from '@/lib/env';

const APP_URL = env.NEXT_PUBLIC_APP_URL;

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['/'];

  return paths.map((path) => ({
    url: \`\${APP_URL}\${path}\`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: path === '/' ? 1 : 0.8,
  }));
}
`;
