/**
 * Page templates for the v2 starter: Cache Components on, locale from root
 * params (no `setRequestLocale`), typed route props, `generateSEOMetadata`.
 */
export interface PageTemplateParams {
  componentName: string;
  /** App path without the locale segment, e.g. `/dashboard/settings`. */
  routePath: string;
  hasI18n: boolean;
  /** Present for dynamic routes, e.g. `id` for `/posts/[id]`. */
  paramName?: string;
}

const routeType = ({ routePath, hasI18n, paramName }: PageTemplateParams): string =>
  `${hasI18n ? '/[locale]' : ''}${routePath}${paramName ? `/[${paramName}]` : ''}`;

export const pageTemplate = (params: PageTemplateParams): string => {
  const { componentName, routePath, hasI18n, paramName } = params;
  const route = routeType(params);

  if (hasI18n) {
    return `import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { generateSEOMetadata } from '@/lib/config/seo';

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('${componentName}')]);
  return generateSEOMetadata({
    title: t('title'),
    description: t('description'),
    path: '${routePath}',
    locale,
  });
}

export default async function ${componentName}Page(${paramName ? `{ params }: PageProps<'${route}'>` : ''}) {
  const t = await getTranslations('${componentName}');
${paramName ? `  const { ${paramName} } = await params;\n` : ''}
  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="font-bold text-2xl">{t('title')}</h1>
      <p className="text-gray-500 dark:text-gray-400">{t('description')}</p>${
        paramName ? `\n      <p className="text-sm">${paramName}: {${paramName}}</p>` : ''
      }
    </div>
  );
}
`;
  }

  return `import type { Metadata } from 'next';

import { generateSEOMetadata } from '@/lib/config/seo';

export const metadata: Metadata = generateSEOMetadata({
  title: '${componentName}',
  description: '${componentName} page',
  path: '${routePath}',
});

export default ${paramName ? 'async ' : ''}function ${componentName}Page(${paramName ? `{ params }: PageProps<'${route}'>` : ''}) {
${paramName ? `  const { ${paramName} } = await params;\n\n` : ''}  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="font-bold text-2xl">${componentName}</h1>${
        paramName ? `\n      <p className="text-sm">${paramName}: {${paramName}}</p>` : ''
      }
    </div>
  );
}
`;
};

export const loadingTemplate = (params: { componentName: string }): string => {
  return `export default function ${params.componentName}Loading() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-gray-500 text-sm dark:text-gray-400">Loading…</p>
    </div>
  );
}
`;
};

export const errorTemplate = (params: { componentName: string }): string => {
  return `'use client';

import { useEffect } from 'react';

import { logger } from '@/lib/logger';

export default function ${params.componentName}Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error({ err: error, digest: error.digest }, '${params.componentName} failed to render');
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="font-semibold text-xl">Something went wrong</h2>
      <button
        type="button"
        onClick={reset}
        className="cursor-pointer rounded-md bg-dark px-6 py-2 text-light text-sm dark:bg-light dark:text-dark"
      >
        Try again
      </button>
    </div>
  );
}
`;
};
