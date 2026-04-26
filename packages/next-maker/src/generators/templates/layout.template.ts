/**
 * Templates for the `layout` generator (B2). Nested layouts only — the root
 * layout is owned by the starter and is too heavy (fonts, providers, html/body)
 * to scaffold from a CLI.
 */

export interface LayoutTemplateParams {
  /** PascalCase component name (e.g. `DashboardLayout`). */
  componentName: string;
  /** True when the layout sits under `src/app/[locale]/...` and should consume the locale param. */
  hasI18n: boolean;
}

const i18nTemplate = (componentName: string): string =>
  `import { setRequestLocale } from 'next-intl/server';
import type { SupportedLocale } from '@/types/i18n';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function ${componentName}({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as SupportedLocale);

  return <>{children}</>;
}
`;

const plainTemplate = (componentName: string): string =>
  `type Props = {
  children: React.ReactNode;
};

export default function ${componentName}({ children }: Props) {
  return <>{children}</>;
}
`;

export const layoutTemplate = ({ componentName, hasI18n }: LayoutTemplateParams): string =>
  hasI18n ? i18nTemplate(componentName) : plainTemplate(componentName);
