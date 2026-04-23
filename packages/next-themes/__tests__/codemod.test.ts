import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import transform from '../codemod/from-next-themes.cjs';

const j = jscodeshift.withParser('tsx');

type Options = { storage?: 'hybrid' | 'cookie' | 'local' | 'session' | 'none' };

function run(source: string, options: Options = {}): string {
  const result = (transform as unknown as Transform)(
    { source, path: 'test.tsx' },
    { jscodeshift: j, j, stats: () => {}, report: () => {} },
    options,
  );
  return result ?? source;
}

type Transform = (
  file: { source: string; path: string },
  api: { jscodeshift: typeof j; j: typeof j; stats: () => void; report: () => void },
  options: Options,
) => string | null;

describe('codemod: from-next-themes', () => {
  it('rewrites named imports', () => {
    const src = `import { ThemeProvider, useTheme } from 'next-themes';`;
    expect(run(src)).toContain("from '@teispace/next-themes'");
    expect(run(src)).not.toContain("'next-themes'");
  });

  it('rewrites default imports', () => {
    const src = `import anything from 'next-themes';`;
    expect(run(src)).toContain("from '@teispace/next-themes'");
  });

  it('rewrites namespace imports', () => {
    const src = `import * as Themes from 'next-themes';`;
    expect(run(src)).toContain("from '@teispace/next-themes'");
  });

  it('rewrites next-themes/dist subpaths', () => {
    const src = `import { ThemeProvider } from 'next-themes/dist/index';`;
    expect(run(src)).toContain("from '@teispace/next-themes/index'");
  });

  it('rewrites require() calls', () => {
    const src = `const themes = require('next-themes');`;
    expect(run(src)).toContain("require('@teispace/next-themes')");
  });

  it('rewrites dynamic import() calls', () => {
    const src = `const m = import('next-themes');`;
    expect(run(src)).toContain("import('@teispace/next-themes')");
  });

  it('rewrites re-exports', () => {
    const src = `export { ThemeProvider } from 'next-themes';\nexport * from 'next-themes';`;
    const out = run(src);
    expect(out).toContain("from '@teispace/next-themes'");
    expect(out.match(/'next-themes'/g)).toBeNull();
  });

  it('leaves unrelated imports alone', () => {
    const src = `import React from 'react';\nimport { a } from 'next-themes-plus';`;
    expect(run(src)).toBe(src);
  });

  it('returns null when nothing changes (jscodeshift convention)', () => {
    const src = `const x = 1;`;
    const api = { jscodeshift: j, j, stats: () => {}, report: () => {} };
    const r = (transform as unknown as Transform)({ source: src, path: 'x.ts' }, api, {});
    expect(r).toBeNull();
  });

  it('adds storage="hybrid" to <ThemeProvider> when --storage=hybrid', () => {
    const src = `import { ThemeProvider } from 'next-themes';\nexport default () => <ThemeProvider attribute="class">x</ThemeProvider>;`;
    const out = run(src, { storage: 'hybrid' });
    expect(out).toMatch(/storage=['"]hybrid['"]/);
  });

  it('does not duplicate storage prop if already set', () => {
    const src = `import { ThemeProvider } from 'next-themes';\nexport default () => <ThemeProvider storage="local">x</ThemeProvider>;`;
    const out = run(src, { storage: 'hybrid' });
    expect(out.match(/storage=/g)?.length).toBe(1);
    expect(out).toMatch(/storage=['"]local['"]/); // original preserved
  });

  it('throws on invalid --storage value', () => {
    const src = `import { ThemeProvider } from 'next-themes';`;
    expect(() => run(src, { storage: 'garbage' as never })).toThrow();
  });
});
