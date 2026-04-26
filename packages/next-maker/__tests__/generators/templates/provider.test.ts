import { describe, expect, it } from 'vitest';
import {
  providerComponentName,
  providerTemplate,
} from '../../../src/generators/templates/provider.template';

describe('providerComponentName', () => {
  it('appends Provider when missing', () => {
    expect(providerComponentName('Auth')).toBe('AuthProvider');
  });

  it('preserves Provider suffix when present', () => {
    expect(providerComponentName('AuthProvider')).toBe('AuthProvider');
  });
});

describe('providerTemplate', () => {
  it('emits a "use client" provider with context, hook, and component', () => {
    const result = providerTemplate({ baseName: 'Auth' });

    expect(result.startsWith("'use client';")).toBe(true);
    expect(result).toContain('const AuthContext = createContext<AuthContextValue | null>(null);');
    expect(result).toContain('export const useAuth = (): AuthContextValue =>');
    expect(result).toContain(
      'export const AuthProvider = ({ children }: { children: React.ReactNode }) =>',
    );
    expect(result).toContain('useAuth must be used within AuthProvider');
  });

  it('strips a trailing Provider suffix from the base name', () => {
    const result = providerTemplate({ baseName: 'SessionProvider' });
    expect(result).toContain('const SessionContext');
    expect(result).toContain('useSession');
    expect(result).not.toContain('SessionProviderContext');
  });

  it('memoises the value object', () => {
    const result = providerTemplate({ baseName: 'Theme' });
    expect(result).toContain('const value = useMemo<ThemeContextValue>(() => ({}), []);');
  });
});
