import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateLayout } from '../../src/generators/layout.generator';

let projectPath: string;

beforeEach(async () => {
  projectPath = await mkdtemp(path.join(tmpdir(), 'next-maker-layout-'));
});

afterEach(async () => {
  await rm(projectPath, { recursive: true, force: true });
});

describe('generateLayout', () => {
  it('writes a locale-aware layout under [locale]/segment', async () => {
    const result = await generateLayout({
      segment: 'dashboard',
      projectPath,
      hasI18n: true,
      withGroup: false,
    });

    expect(result.layoutFile).toBe(path.join(projectPath, 'src/app/[locale]/dashboard/layout.tsx'));
    expect(result.componentName).toBe('DashboardLayout');

    const contents = await readFile(result.layoutFile, 'utf-8');
    expect(contents).toContain('export default async function DashboardLayout');
    expect(contents).toContain('next-intl/server');
  });

  it('writes a non-locale layout when hasI18n is false', async () => {
    const result = await generateLayout({
      segment: 'admin',
      projectPath,
      hasI18n: false,
      withGroup: false,
    });

    expect(result.layoutFile).toBe(path.join(projectPath, 'src/app/admin/layout.tsx'));
    const contents = await readFile(result.layoutFile, 'utf-8');
    expect(contents).not.toContain('next-intl');
  });

  it('wraps the segment in parens when withGroup is true', async () => {
    const result = await generateLayout({
      segment: 'marketing',
      projectPath,
      hasI18n: true,
      withGroup: true,
    });

    expect(result.layoutFile).toBe(
      path.join(projectPath, 'src/app/[locale]/(marketing)/layout.tsx'),
    );
    expect(result.componentName).toBe('MarketingLayout');
  });

  it('places the layout under a nested --at path', async () => {
    const result = await generateLayout({
      segment: 'preferences',
      at: 'dashboard/settings',
      projectPath,
      hasI18n: true,
      withGroup: false,
    });

    expect(result.layoutFile).toBe(
      path.join(projectPath, 'src/app/[locale]/dashboard/settings/preferences/layout.tsx'),
    );
  });

  it('rejects an invalid segment', async () => {
    await expect(
      generateLayout({
        segment: '(Marketing)',
        projectPath,
        hasI18n: true,
        withGroup: false,
      }),
    ).rejects.toThrow(/Invalid layout segment/);
  });

  it('rejects an invalid --at path', async () => {
    await expect(
      generateLayout({
        segment: 'preferences',
        at: 'Dashboard/Bad',
        projectPath,
        hasI18n: true,
        withGroup: false,
      }),
    ).rejects.toThrow(/Invalid --at path/);
  });

  it('refuses to overwrite an existing layout', async () => {
    await generateLayout({
      segment: 'dashboard',
      projectPath,
      hasI18n: false,
      withGroup: false,
    });
    await expect(
      generateLayout({
        segment: 'dashboard',
        projectPath,
        hasI18n: false,
        withGroup: false,
      }),
    ).rejects.toThrow(/already exists/);
  });
});
