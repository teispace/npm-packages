import { describe, expect, it } from 'vitest';
import {
  errorTemplate,
  loadingTemplate,
  pageTemplate,
} from '../../../src/generators/templates/page.template';

describe('pageTemplate', () => {
  it('emits a non-i18n page with SEO metadata', () => {
    const result = pageTemplate({
      componentName: 'Dashboard',
      routePath: '/dashboard',
      hasI18n: false,
    });
    expect(result).toContain('export default function DashboardPage()');
    expect(result).toContain("title: 'Dashboard'");
    expect(result).toContain("path: '/dashboard'");
    expect(result).not.toContain('next-intl');
  });

  it('emits a locale-aware page that reads the locale from root params', () => {
    const result = pageTemplate({
      componentName: 'Dashboard',
      routePath: '/dashboard',
      hasI18n: true,
    });
    expect(result).toContain("import { getLocale, getTranslations } from 'next-intl/server';");
    expect(result).toContain("getTranslations('Dashboard')");
    expect(result).not.toContain('setRequestLocale');
    expect(result).not.toContain('params: Promise<{ locale');
  });

  it('types dynamic routes with PageProps', () => {
    const plain = pageTemplate({
      componentName: 'Product',
      routePath: '/products',
      hasI18n: false,
      paramName: 'id',
    });
    expect(plain).toContain("PageProps<'/products/[id]'>");
    expect(plain).toContain('const { id } = await params;');
    const intl = pageTemplate({
      componentName: 'Product',
      routePath: '/products',
      hasI18n: true,
      paramName: 'id',
    });
    expect(intl).toContain("PageProps<'/[locale]/products/[id]'>");
  });

  it('reads params inside Suspense so the route still prerenders', () => {
    for (const hasI18n of [false, true]) {
      const result = pageTemplate({
        componentName: 'Product',
        routePath: '/products',
        hasI18n,
        paramName: 'id',
      });
      expect(result).toContain("import { Suspense } from 'react';");
      expect(result).toContain('<Suspense fallback=');
      expect(result).toContain('<ProductId params={params} />');
      expect(result).toContain('async function ProductId(');
      // The page body itself must not await request data.
      const body = result.slice(
        result.indexOf('export default'),
        result.indexOf('async function ProductId('),
      );
      expect(body).not.toContain('await params');
    }
  });

  it('keeps static pages free of Suspense and params', () => {
    const result = pageTemplate({ componentName: 'Reports', routePath: '/reports', hasI18n: true });
    expect(result).not.toContain('Suspense');
    expect(result).not.toContain('params');
  });
});

describe('loading and error templates', () => {
  it('emits a loading boundary', () => {
    expect(loadingTemplate({ componentName: 'Dashboard' })).toContain(
      'export default function DashboardLoading',
    );
  });

  it('emits a client error boundary that logs and resets', () => {
    const result = errorTemplate({ componentName: 'Dashboard' });
    expect(result).toContain("'use client';");
    expect(result).toContain('export default function DashboardError');
    expect(result).toContain('logger.error');
    expect(result).toContain('onClick={reset}');
  });
});
