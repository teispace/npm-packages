import { describe, expect, it } from 'vitest';
import { removeNamedImport, unwrapJsxChain } from '../../../src/manifests/transforms/unwrap-jsx';

describe('removeNamedImport', () => {
  it('drops a default import line', () => {
    const before = `import X from 'pkg';\nimport { Y } from 'other';\n`;
    expect(removeNamedImport(before, 'X')).toBe(`import { Y } from 'other';\n`);
  });

  it('drops the line when it is the only named symbol', () => {
    const before = `import { X } from 'pkg';\nconst y = 1;\n`;
    expect(removeNamedImport(before, 'X')).toBe(`const y = 1;\n`);
  });

  it('removes one symbol from a multi-symbol named import', () => {
    const before = `import { X, Y, Z } from 'pkg';\n`;
    expect(removeNamedImport(before, 'Y')).toBe(`import { X, Z } from 'pkg';\n`);
  });

  it('handles `type` and aliases', () => {
    const before = `import { type X, Y as Z } from 'pkg';\n`;
    expect(removeNamedImport(before, 'Y')).toBe(`import { type X } from 'pkg';\n`);
  });

  it('leaves the file untouched when the symbol is not imported', () => {
    const before = `import { Y } from 'pkg';\n`;
    expect(removeNamedImport(before, 'X')).toBe(before);
  });
});

const ROOT_PROVIDER = `'use client';
import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import { CustomThemeProvider } from '@/providers';
import { StoreProvider } from './StoreProvider';

export const RootProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <StoreProvider>
      <CustomThemeProvider>
        <NextIntlClientProvider locale="en" messages={{}} timeZone="UTC">
          {children}
        </NextIntlClientProvider>
      </CustomThemeProvider>
    </StoreProvider>
  );
};
`;

describe('unwrapJsxChain', () => {
  it('removes the wrap and outdents the body', () => {
    const result = unwrapJsxChain('NextIntlClientProvider')(ROOT_PROVIDER);
    expect(result).not.toBeNull();
    expect(result).not.toContain('<NextIntlClientProvider');
    expect(result).not.toContain('</NextIntlClientProvider>');
    // {children} should now sit at the indent that was occupied by the wrap.
    expect(result).toContain(
      '      <CustomThemeProvider>\n        {children}\n      </CustomThemeProvider>',
    );
  });

  it('drops the orphan import when present', () => {
    const result = unwrapJsxChain('NextIntlClientProvider')(ROOT_PROVIDER) ?? '';
    expect(result).not.toContain('NextIntlClientProvider');
    // Other named import on the same line should survive
    expect(result).toContain('AbstractIntlMessages');
  });

  it('removes a default-import-only line', () => {
    const result = unwrapJsxChain('CustomThemeProvider')(ROOT_PROVIDER) ?? '';
    expect(result).not.toContain('CustomThemeProvider');
    expect(result).not.toContain("from '@/providers'");
  });

  it('returns null when the opening tag is missing', () => {
    const result = unwrapJsxChain('NoSuchProvider')(ROOT_PROVIDER);
    expect(result).toBeNull();
  });

  it('returns null when the opening tag spans multiple lines', () => {
    const multiline = `<X
  prop="value"
>
  body
</X>
`;
    expect(unwrapJsxChain('X')(multiline)).toBeNull();
  });

  it('returns null when no matching close tag at the same indent', () => {
    const broken = `    <Y>\n  </Y>\n`; // close at lower indent
    expect(unwrapJsxChain('Y')(broken)).toBeNull();
  });

  it('preserves outer providers in the chain', () => {
    const result = unwrapJsxChain('NextIntlClientProvider')(ROOT_PROVIDER) ?? '';
    expect(result).toContain('<StoreProvider>');
    expect(result).toContain('<CustomThemeProvider>');
  });

  it('handles unwrap of the outermost wrap (StoreProvider)', () => {
    const result = unwrapJsxChain('StoreProvider')(ROOT_PROVIDER) ?? '';
    expect(result).not.toContain('<StoreProvider>');
    // CustomThemeProvider should now be the outermost in the chain
    expect(result).toMatch(/return \(\n\s+<CustomThemeProvider>/);
  });
});
