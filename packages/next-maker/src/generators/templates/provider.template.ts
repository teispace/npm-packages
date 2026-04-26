/**
 * Templates for the `provider` generator (B3). Generates a context-based
 * provider — the most common use case. Users who only need a thin wrapper
 * around an external `<XxxProvider>` can delete the context boilerplate.
 */

export interface ProviderTemplateParams {
  /** PascalCase base name (e.g. `Auth`). The template appends `Provider` for the component and `useX` for the hook. */
  baseName: string;
}

const ensureSuffix = (name: string, suffix: string): string =>
  name.endsWith(suffix) ? name : `${name}${suffix}`;

export const providerTemplate = ({ baseName }: ProviderTemplateParams): string => {
  const componentName = ensureSuffix(baseName, 'Provider');
  // Strip the Provider suffix for the value/context name (e.g. AuthProvider -> Auth).
  const root = componentName.replace(/Provider$/, '');
  const valueType = `${root}ContextValue`;
  const contextName = `${root}Context`;
  const hookName = `use${root}`;

  return `'use client';
import { createContext, useContext, useMemo } from 'react';

type ${valueType} = {
  // TODO: declare context value fields
};

const ${contextName} = createContext<${valueType} | null>(null);

export const ${hookName} = (): ${valueType} => {
  const ctx = useContext(${contextName});
  if (!ctx) {
    throw new Error('${hookName} must be used within ${componentName}');
  }
  return ctx;
};

export const ${componentName} = ({ children }: { children: React.ReactNode }) => {
  const value = useMemo<${valueType}>(() => ({}), []);
  return <${contextName}.Provider value={value}>{children}</${contextName}.Provider>;
};
`;
};

export const providerComponentName = (baseName: string): string =>
  ensureSuffix(baseName, 'Provider');
