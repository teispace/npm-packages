import { describe, expect, it } from 'vitest';
import {
  dynamicPageTemplate,
  errorTemplate,
  loadingTemplate,
  pageTemplate,
} from '../../../src/generators/templates/page.template';

describe('pageTemplate', () => {
  it('emits a non-i18n page with metadata', () => {
    const result = pageTemplate({
      componentName: 'Dashboard',
      routePath: '/dashboard',
      hasI18n: false,
    });
    expect(result).toContain('export default function DashboardPage');
    expect(result).toContain("title: 'Dashboard'");
    expect(result).not.toContain('next-intl');
  });

  it('emits a locale-aware page when hasI18n is true', () => {
    const result = pageTemplate({
      componentName: 'Dashboard',
      routePath: '/dashboard',
      hasI18n: true,
    });
    expect(result).toContain(
      "import { getTranslations, setRequestLocale } from 'next-intl/server';",
    );
    expect(result).toContain('setRequestLocale(locale)');
    expect(result).toContain("namespace: 'Dashboard'");
  });
});

describe('dynamicPageTemplate', () => {
  it('emits a non-i18n dynamic page consuming params', () => {
    const result = dynamicPageTemplate({
      componentName: 'Product',
      routePath: '/products',
      paramName: 'id',
      hasI18n: false,
    });
    expect(result).toContain('params: Promise<{ id: string }>');
    expect(result).toContain('const { id } = await props.params');
  });

  it('emits a locale-aware dynamic page', () => {
    const result = dynamicPageTemplate({
      componentName: 'Product',
      routePath: '/products',
      paramName: 'id',
      hasI18n: true,
    });
    expect(result).toContain('params: Promise<{ locale: string; id: string }>');
    expect(result).toContain('setRequestLocale(locale)');
  });
});

describe('loadingTemplate', () => {
  it('emits a static loading component', () => {
    const result = loadingTemplate({ componentName: 'Dashboard' });
    expect(result).toContain('export default function DashboardLoading');
    expect(result).toContain('Loading...');
  });
});

describe('errorTemplate', () => {
  it('emits a client-side error component with reset button', () => {
    const result = errorTemplate({ componentName: 'Dashboard' });
    expect(result).toContain("'use client';");
    expect(result).toContain('export default function DashboardError');
    expect(result).toContain('reset: () => void');
  });

  it('renders the reset button with type="button" (Biome a11y/useButtonType)', () => {
    const result = errorTemplate({ componentName: 'Dashboard' });
    expect(result).toContain('<button type="button" onClick={() => reset()}>Try again</button>');
  });
});
