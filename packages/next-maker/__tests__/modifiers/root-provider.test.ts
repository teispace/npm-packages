import { describe, expect, it } from 'vitest';
import {
  addProviderToBarrel,
  injectProviderIntoChain,
} from '../../src/modifiers/root-provider.modifier';

const sampleRootProvider = `'use client';
import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';
import { CustomThemeProvider } from '@/providers';
import { StoreProvider } from './StoreProvider';

type RootProviderProps = {
  children: React.ReactNode;
};

export const RootProvider = ({ children }: RootProviderProps) => {
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

describe('injectProviderIntoChain', () => {
  it('wraps the {children} line preserving indentation', () => {
    const result = injectProviderIntoChain(sampleRootProvider, 'AuthProvider');
    expect(result).toContain(
      '          <AuthProvider>\n            {children}\n          </AuthProvider>',
    );
  });

  it('preserves outer providers', () => {
    const result = injectProviderIntoChain(sampleRootProvider, 'AuthProvider');
    expect(result).toContain('<StoreProvider>');
    expect(result).toContain('<NextIntlClientProvider');
  });

  it('is idempotent', () => {
    const once = injectProviderIntoChain(sampleRootProvider, 'AuthProvider');
    const twice = injectProviderIntoChain(once, 'AuthProvider');
    expect(twice).toBe(once);
  });

  it('throws when no {children} line is found', () => {
    expect(() =>
      injectProviderIntoChain('export const X = () => <div>hi</div>;\n', 'AuthProvider'),
    ).toThrow(/\{children\}/);
  });
});

const sampleBarrel = `export * from './CustomThemeProvider';
export * from './RootProvider';
`;

describe('addProviderToBarrel', () => {
  it('inserts a re-export and keeps the list sorted', () => {
    const result = addProviderToBarrel(sampleBarrel, 'AuthProvider');
    const exports = result.trim().split('\n');
    expect(exports).toEqual([
      "export * from './AuthProvider';",
      "export * from './CustomThemeProvider';",
      "export * from './RootProvider';",
    ]);
  });

  it('is idempotent', () => {
    const once = addProviderToBarrel(sampleBarrel, 'AuthProvider');
    const twice = addProviderToBarrel(once, 'AuthProvider');
    expect(twice).toBe(once);
  });

  it('handles an empty barrel', () => {
    const result = addProviderToBarrel('', 'AuthProvider');
    expect(result.trim()).toBe("export * from './AuthProvider';");
  });
});
