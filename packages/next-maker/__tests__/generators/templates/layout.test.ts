import { describe, expect, it } from 'vitest';
import { layoutTemplate } from '../../../src/generators/templates/layout.template';

describe('layoutTemplate', () => {
  it('emits a locale-aware layout when hasI18n is true', () => {
    const result = layoutTemplate({ componentName: 'DashboardLayout', hasI18n: true });

    expect(result).toContain("import { setRequestLocale } from 'next-intl/server';");
    expect(result).toContain("import type { SupportedLocale } from '@/types/i18n';");
    expect(result).toContain('params: Promise<{ locale: string }>');
    expect(result).toContain('setRequestLocale(locale as SupportedLocale)');
    expect(result).toContain('export default async function DashboardLayout');
  });

  it('emits a plain layout when hasI18n is false', () => {
    const result = layoutTemplate({ componentName: 'MarketingLayout', hasI18n: false });

    expect(result).not.toContain('next-intl');
    expect(result).not.toContain('setRequestLocale');
    expect(result).toContain('export default function MarketingLayout');
    expect(result).toContain('children: React.ReactNode');
  });

  it('always renders <>{children}</>', () => {
    expect(layoutTemplate({ componentName: 'X', hasI18n: false })).toContain('<>{children}</>');
    expect(layoutTemplate({ componentName: 'X', hasI18n: true })).toContain('<>{children}</>');
  });
});
