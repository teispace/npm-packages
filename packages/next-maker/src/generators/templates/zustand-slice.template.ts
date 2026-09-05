export const zustandSliceTemplate = (params: {
  componentName: string;
  camelName: string;
  typesImportPath: string;
}): string => {
  const { componentName, camelName, typesImportPath } = params;
  return `import type { StateCreator } from 'zustand';

import type { ${componentName}State } from '${typesImportPath}';

export interface ${componentName}Slice {
  ${camelName}: ${componentName}State;
  ${camelName}Started: () => void;
  ${camelName}Failed: (error: string) => void;
  ${camelName}Reset: () => void;
}

const initial: ${componentName}State = { status: 'idle', error: null };

/**
 * Slice creator. Compose it into the app store:
 *
 *   // src/store/index.ts
 *   export type AppState = CounterSlice & ${componentName}Slice & { ... };
 *   ...create${componentName}Slice(set, get, api),
 */
// biome-ignore lint/suspicious/noExplicitAny: composed into the app store, whose full type is declared there
export const create${componentName}Slice: StateCreator<any, [], [], ${componentName}Slice> = (set) => ({
  ${camelName}: initial,
  ${camelName}Started: () => set({ ${camelName}: { status: 'loading', error: null } }),
  ${camelName}Failed: (error: string) => set({ ${camelName}: { status: 'error', error } }),
  ${camelName}Reset: () => set({ ${camelName}: initial }),
});
`;
};
