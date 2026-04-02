export const pageTemplate = (params: {
  componentName: string;
  routePath: string;
  hasI18n: boolean;
}): string => {
  const { componentName, routePath, hasI18n } = params;

  if (hasI18n) {
    return `import { generateSEOMetadata } from '@/lib/config/seo';
import { SupportedLocale } from '@/types/i18n';
import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const locale = (await props.params).locale as SupportedLocale;
  const t = await getTranslations({ locale, namespace: '${componentName}' });

  return generateSEOMetadata({
    title: t('title'),
    description: t('description'),
    path: '${routePath}',
  });
}

export default async function ${componentName}Page(props: Props) {
  const locale = (await props.params).locale as SupportedLocale;
  setRequestLocale(locale);

  const t = await getTranslations('${componentName}');

  return (
    <div>
      <h1>{t('title')}</h1>
    </div>
  );
}
`;
  }

  return `import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${componentName}',
  description: '${componentName} page',
};

export default function ${componentName}Page() {
  return (
    <div>
      <h1>${componentName}</h1>
    </div>
  );
}
`;
};

export const dynamicPageTemplate = (params: {
  componentName: string;
  routePath: string;
  paramName: string;
  hasI18n: boolean;
}): string => {
  const { componentName, paramName, routePath, hasI18n } = params;

  if (hasI18n) {
    return `import { generateSEOMetadata } from '@/lib/config/seo';
import { SupportedLocale } from '@/types/i18n';
import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string; ${paramName}: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, ${paramName} } = await props.params;
  const t = await getTranslations({ locale: locale as SupportedLocale, namespace: '${componentName}' });

  return generateSEOMetadata({
    title: t('title'),
    description: t('description'),
    path: '${routePath}',
  });
}

export default async function ${componentName}Page(props: Props) {
  const { locale, ${paramName} } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations('${componentName}');

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>${componentName}: {${paramName}}</p>
    </div>
  );
}
`;
  }

  return `import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${componentName}',
  description: '${componentName} page',
};

type Props = {
  params: Promise<{ ${paramName}: string }>;
};

export default async function ${componentName}Page(props: Props) {
  const { ${paramName} } = await props.params;

  return (
    <div>
      <h1>${componentName}</h1>
      <p>${componentName}: {${paramName}}</p>
    </div>
  );
}
`;
};

export const loadingTemplate = (params: { componentName: string }): string => {
  return `export default function ${params.componentName}Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <p>Loading...</p>
    </div>
  );
}
`;
};

export const errorTemplate = (params: { componentName: string }): string => {
  return `'use client';

export default function ${params.componentName}Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
`;
};
